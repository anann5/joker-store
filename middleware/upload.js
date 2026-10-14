const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// SVG مستبعد عمداً: قد يحتوي سكربتات قابلة للتنفيذ.
// يُفضَّل رفع صور WebP لأنها أخف بنسبة تصل لـ 30-50% وتُحمّل أسرع في الواجهة.
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext || '.png'}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext) && (file.mimetype || '').startsWith('image/')) {
        return cb(null, true);
    }
    cb(new Error('نوع الملف غير مدعوم. يرجى رفع صورة فقط (jpg, png, gif, webp)'));
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = upload;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
