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
 * يتحقق أن التوكن ينتمي لإصدار الجلسة الحالي للمستخدم.
 * إعادة تعيين كلمة المرور تزيد tokenVersion فتُبطل كل التوكنات القديمة.
 * عند تعذّر التحقق من قاعدة البيانات نرفض الجلسة (fail closed).
 */
const loadSession = async (decoded) => {
    if (!decoded || !decoded.userId) return null;
    try {
        const { User } = require('../models');
        const user = await User.findById(decoded.userId).select('tokenVersion');
        if (!user) return null;
        const currentVersion = Number(user.tokenVersion) || 0;
        return currentVersion === (Number(decoded.ver) || 0) ? decoded : null;
    } catch (_err) {
        return null;
    }
};

/**
 * Middleware اختياري للتحقق من توكن المستخدم.
 * إذا كان التوكن موجوداً وصالحاً، يضيف بيانات المستخدم إلى الطلب.
 * إذا لم يكن موجوداً أو كان قديماً، يسمح للطلب بالمرور كزائر.
 */
exports.verifyUserTokenOptional = async (req, res, next) => {
    const token = extractToken(req);
    if (!token) return next();

    try {
        const decoded = jwt.verify(token, getUserSecret());
        const session = await loadSession(decoded);
        if (session) req.user = session;
    } catch (_err) {
        // توكن غير صالح → متابعة كزائر
    }
    next();
};

/**
 * Middleware للتحقق من توكن المستخدم المطلوب.
 * يتطلب توكن صالحاً وغير مُبطَل، وإلا يرفض الطلب.
 */
exports.verifyUserToken = async (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "الوصول مرفوض. يجب تسجيل الدخول أولاً."
        });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, getUserSecret());
    } catch (err) {
        const message = err.name === 'TokenExpiredError'
            ? "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى."
            : "توكن غير صالح.";
        return res.status(401).json({ success: false, message });
    }

    const session = await loadSession(decoded);
    if (!session) {
        return res.status(401).json({
            success: false,
            message: "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى."
        });
    }

    req.user = session;
    next();
};
