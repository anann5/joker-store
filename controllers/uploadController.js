exports.uploadImage = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'لم يتم اختيار ملف صورة' });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ success: true, url, message: 'تم رفع الصورة بنجاح' });
};
