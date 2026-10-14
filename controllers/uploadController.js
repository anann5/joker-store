const fs = require('fs');
const path = require('path');

/**
 * Verify a file's actual content signature (magic bytes) matches its extension.
 * Prevents uploading disguised executables/HTML/SVG disguised as images.
 */
function isValidImage(filePath) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(12);
        fs.readSync(fd, buf, 0, 12, 0);
        fs.closeSync(fd);

        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.jpg' || ext === '.jpeg') {
            return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
        }
        if (ext === '.png') {
            return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
        }
        if (ext === '.gif') {
            return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
        }
        if (ext === '.webp') {
            return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
                && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
        }
        return false;
    } catch (_err) {
        return false;
    }
}

exports.uploadImage = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'لم يتم اختيار ملف صورة' });
    }

    if (!isValidImage(req.file.path)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ success: false, message: 'الملف المرفوع ليس صورة صالحة' });
    }

    const url = `/uploads/${req.file.filename}`;
    res.json({ success: true, url, message: 'تم رفع الصورة بنجاح' });
};
