const jwt = require('jsonwebtoken');

// مفتاح توقيع منفصل لتوكنات المستخدمين (يُنصح بأن يختلف عن مفتاح الأدمن)
const getUserSecret = () => process.env.JWT_USER_SECRET || process.env.JWT_SECRET;

const extractToken = (req) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    // دعم الجلسة المخزنة في HttpOnly cookie
    return req.cookies?.['user_token'] || null;
};

/**
 * Middleware اختياري للتحقق من توكن المستخدم.
 * إذا كان التوكن موجوداً وصالحاً، يضيف بيانات المستخدم إلى الطلب.
 * إذا لم يكن موجوداً، يسمح للطلب بالمرور (للسماح للزوار بالشراء).
 */
exports.verifyUserTokenOptional = (req, res, next) => {
    const token = extractToken(req);

    if (token) {
        jwt.verify(token, getUserSecret(), (err, decoded) => {
            if (!err) {
                req.user = decoded; // إضافة بيانات المستخدم (userId, email) إلى الطلب
            }
            next();
        });
        return;
    }
    next(); // السماح للطلب بالاستمرار في كل الحالات
};

/**
 * Middleware للتحقق من توكن المستخدم المطلوب.
 * يتطلب توكن صالحاً، وإلا يرفض الطلب.
 */
exports.verifyUserToken = (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: "الوصول مرفوض. يجب تسجيل الدخول أولاً." 
        });
    }

    jwt.verify(token, getUserSecret(), (err, decoded) => {
        if (err) {
            const message = err.name === 'TokenExpiredError' 
                ? "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى." 
                : "توكن غير صالح.";
            return res.status(401).json({ 
                success: false, 
                message: message
            });
        }
        req.user = decoded;
        next();
    });
};
