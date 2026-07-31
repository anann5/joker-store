const jwt = require('jsonwebtoken');

/**
 * Middleware اختياري للتحقق من توكن المستخدم.
 * إذا كان التوكن موجوداً وصالحاً، يضيف بيانات المستخدم إلى الطلب.
 * إذا لم يكن موجوداً، يسمح للطلب بالمرور (للسماح للزوار بالشراء).
 */
exports.verifyUserTokenOptional = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (!err) {
                req.user = decoded; // إضافة بيانات المستخدم (userId, email) إلى الطلب
            }
        });
    }
    next(); // السماح للطلب بالاستمرار في كل الحالات
};