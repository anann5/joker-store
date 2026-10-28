const multer = require('multer');
const path = require('path');
const fs = require('fs');

const PUBLIC_UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
// إثباتات الدفع مالية وحساسة: تُخزَّن خارج المجلد العام وتُقدَّم للأدمن فقط.
const PRIVATE_PROOF_DIR = path.join(__dirname, '..', 'private', 'uploads', 'payments');

for (const dir of [PUBLIC_UPLOAD_DIR, PRIVATE_PROOF_DIR]) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// SVG مستبعد عمداً: قد يحتوي سكربتات قابلة للتنفيذ.
// يُفضَّل رفع صور WebP لأنها أخف بنسبة تصل لـ 30-50% وتُحمّل أسرع في الواجهة.
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// اسم الملف يولّده الخادم فقط: طابع زمني + 16 خانة سداسية + امتداد صورة مسموح.
const UPLOAD_FILENAME_PATTERN = '[0-9]{10,16}-[a-f0-9]{16}\\.(?:jpg|jpeg|png|gif|webp)';
const UPLOAD_FILENAME_RE = new RegExp(`^${UPLOAD_FILENAME_PATTERN}$`, 'i');
const PROOF_URL_RE = new RegExp(`^/(private-proofs|uploads)/(${UPLOAD_FILENAME_PATTERN})$`, 'i');

function createImageUploader() {
    const fileFilter = (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (ALLOWED_EXTENSIONS.includes(ext) && (file.mimetype || '').startsWith('image/')) {
            return cb(null, true);
        }
        cb(new Error('نوع الملف غير مدعوم. يرجى رفع صورة فقط (jpg, png, gif, webp)'));
    };

    // الذاكرة أولاً: المتحكم يحفظ الملف في R2 أو على القرص المحلي حسب الإعداد.
    return multer({
        storage: multer.memoryStorage(),
        fileFilter,
        limits: { fileSize: MAX_UPLOAD_BYTES }
    });
}

const publicUpload = createImageUploader();
const paymentProofUpload = createImageUploader();

module.exports = publicUpload;
module.exports.publicUpload = publicUpload;
module.exports.paymentProofUpload = paymentProofUpload;
module.exports.PUBLIC_UPLOAD_DIR = PUBLIC_UPLOAD_DIR;
module.exports.PRIVATE_PROOF_DIR = PRIVATE_PROOF_DIR;
module.exports.MAX_UPLOAD_BYTES = MAX_UPLOAD_BYTES;
module.exports.UPLOAD_FILENAME_RE = UPLOAD_FILENAME_RE;
module.exports.PROOF_URL_RE = PROOF_URL_RE;
