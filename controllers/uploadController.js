const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const objectStorage = require('../services/objectStorage');
const {
    PUBLIC_UPLOAD_DIR,
    PRIVATE_PROOF_DIR,
    UPLOAD_FILENAME_RE
} = require('../middleware/upload');

/**
 * التحقق من بصمة المحتوى الفعلية (magic bytes) بدل الاعتماد على الامتداد أو MIME.
 * يمنع رفع ملفات تنفيذية أو HTML/SVG متنكرة كصور.
 */
function isValidImageBuffer(buffer, filename) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;

    const ext = path.extname(filename).toLowerCase();

    if (ext === '.jpg' || ext === '.jpeg') {
        return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    }
    if (ext === '.png') {
        return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    }
    if (ext === '.gif') {
        return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
    }
    if (ext === '.webp') {
        return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
            && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    }
    return false;
}

function buildFilename(originalName) {
    const ext = path.extname(String(originalName || '')).toLowerCase();
    return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext || '.png'}`;
}

/**
 * يحفظ الصورة في R2 عند تفعيله، وإلا على القرص المحلي (تطوير/اختبارات).
 */
async function saveImage(file, { privateProof }) {
    const filename = buildFilename(file.originalname);
    if (!isValidImageBuffer(file.buffer, filename)) {
        const error = new Error('الملف المرفوع ليس صورة صالحة');
        error.statusCode = 400;
        throw error;
    }

    if (objectStorage.isEnabled()) {
        const key = `${privateProof ? 'payment-proofs' : 'uploads'}/${filename}`;
        await objectStorage.putObject(key, file.buffer, objectStorage.contentTypeForFilename(filename));
        return filename;
    }

    const dir = privateProof ? PRIVATE_PROOF_DIR : PUBLIC_UPLOAD_DIR;
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, filename), file.buffer);
    return filename;
}

exports.uploadImage = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'لم يتم اختيار ملف صورة' });
    }

    try {
        const filename = await saveImage(req.file, { privateProof: false });
        return res.json({ success: true, url: `/uploads/${filename}`, message: 'تم رفع الصورة بنجاح' });
    } catch (err) {
        if (!err.statusCode) console.error('Upload image error:', err.message);
        return res.status(err.statusCode || 502).json({
            success: false,
            message: err.statusCode ? err.message : 'تعذّر حفظ الصورة، حاول مجدداً.'
        });
    }
};

// إثبات الدفع: رابط داخلي غير عام، ويُقدَّم لاحقاً عبر مسار الأدمن المحمي فقط.
exports.uploadPaymentProof = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'لم يتم اختيار ملف إثبات', message: 'لم يتم اختيار ملف إثبات' });
    }

    try {
        const filename = await saveImage(req.file, { privateProof: true });
        return res.json({
            success: true,
            url: `/private-proofs/${filename}`,
            message: 'تم رفع إثبات الدفع بنجاح'
        });
    } catch (err) {
        if (!err.statusCode) console.error('Upload payment proof error:', err.message);
        return res.status(err.statusCode || 502).json({
            success: false,
            error: err.statusCode ? err.message : 'تعذّر حفظ إثبات الدفع، حاول مجدداً.',
            message: err.statusCode ? err.message : 'تعذّر حفظ إثبات الدفع، حاول مجدداً.'
        });
    }
};

// صور المتجر العامة: تُخدَم من R2 مباشرة عبر الخادم عند تفعيله.
exports.servePublicUpload = async (req, res, next) => {
    if (!objectStorage.isEnabled()) return next();

    const filename = String(req.params.filename || '');
    if (path.basename(filename) !== filename || !UPLOAD_FILENAME_RE.test(filename)) {
        return next();
    }

    try {
        const object = await objectStorage.getObject(`uploads/${filename}`);
        res.setHeader('Content-Type', object.contentType || objectStorage.contentTypeForFilename(filename));
        if (object.contentLength > 0) res.setHeader('Content-Length', object.contentLength);
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        object.body.on('error', () => res.destroy());
        return object.body.pipe(res);
    } catch (err) {
        if (objectStorage.isNotFoundError(err)) {
            // قد يكون الملف محلياً في بيئة تطوير أو أثناء الانتقال إلى R2.
            return next();
        }
        console.error('R2 public image error:', err.message);
        return res.status(502).type('text').send('Bad Gateway');
    }
};

// إثباتات الدفع: خاصة دائماً. من R2 عند تفعيله، وإلا من المجلد المحلي.
exports.servePaymentProof = async (req, res) => {
    const filename = String(req.params.filename || '');
    if (path.basename(filename) !== filename || !UPLOAD_FILENAME_RE.test(filename)) {
        return res.status(400).json({ success: false, message: 'اسم ملف غير صالح' });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    if (objectStorage.isEnabled()) {
        try {
            const object = await objectStorage.getObject(`payment-proofs/${filename}`);
            res.setHeader('Content-Type', object.contentType || objectStorage.contentTypeForFilename(filename));
            if (object.contentLength > 0) res.setHeader('Content-Length', object.contentLength);
            object.body.on('error', () => res.destroy());
            return object.body.pipe(res);
        } catch (err) {
            if (objectStorage.isNotFoundError(err)) {
                // توافق مع الملفات المحلية القديمة قبل تفعيل R2.
                const localPath = path.resolve(PRIVATE_PROOF_DIR, filename);
                if (localPath.startsWith(path.resolve(PRIVATE_PROOF_DIR) + path.sep) && fs.existsSync(localPath)) {
                    return res.sendFile(localPath);
                }
                return res.status(404).json({ success: false, message: 'الإثبات غير موجود' });
            }
            console.error('R2 payment proof error:', err.message);
            return res.status(502).json({ success: false, message: 'تعذّر جلب الإثبات' });
        }
    }

    const filePath = path.resolve(PRIVATE_PROOF_DIR, filename);
    if (!filePath.startsWith(path.resolve(PRIVATE_PROOF_DIR) + path.sep) || !fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'الإثبات غير موجود' });
    }
    return res.sendFile(filePath);
};
