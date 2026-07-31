const { createLog, sendTelegramAlert } = require('./helpers'); // Assuming these are in helpers.js
const bcrypt = require('bcrypt'); // يتطلب تثبيت: npm install bcrypt
const jwt = require('jsonwebtoken'); // يتطلب تثبيت: npm install jsonwebtoken
// Middleware للتحقق من التوكن قبل السماح بالدخول للمسارات المحمية
exports.verifyAdminToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // استخراج التوكن من "Bearer TOKEN"

    if (!token) return res.status(403).json({ success: false, message: "يجب تسجيل الدخول أولاً" });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ success: false, message: "جلسة منتهية، يرجى إعادة تسجيل الدخول" });
        req.admin = decoded;
        next();
    });
};

// دالة تسجيل دخول الأدمن
exports.login = async (req, res) => {
    try {
        const { password } = req.body;
        const adminHash = process.env.ADMIN_PASSWORD_HASH;
        const jwtSecret = process.env.JWT_SECRET;

        if (!adminHash || !jwtSecret) return res.status(500).json({ success: false, message: "إعدادات الأمان ناقصة" });

        const isMatch = await bcrypt.compare(password, adminHash);
        if (isMatch) {
            // إنشاء توكن صالح لمدة 12 ساعة
            const token = jwt.sign({ role: 'admin' }, jwtSecret, { expiresIn: '12h' });
            await createLog('تسجيل دخول', 'قام المسؤول بتسجيل الدخول بنجاح', req);
            
            // إرسال إشعار تلجرام فوراً
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const loginMsg = `🔐 *تنبيه أمني: دخول المسؤول*\n` + `━━━━━━━━━━━━━━\n` + `👤 *النشاط:* تسجيل دخول جديد\n` + `🌐 *IP:* \`${ip}\` \n` + `🕒 *الوقت:* \`${new Date().toLocaleString('ar-EG')}\` \n` + `━━━━━━━━━━━━━━`;
            await sendTelegramAlert(loginMsg);

            res.json({ success: true, token, message: "تم تسجيل الدخول بنجاح" });
        } else {
            res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة" });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
