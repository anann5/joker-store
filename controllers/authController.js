const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createLog, sendTelegramAlert } = require('./helpers');
const { logSecurityEvent } = require('../middleware/securityLogger');

// Rate limiting storage for admin login attempts
const adminFailedAttempts = new Map();
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const adminSessions = new Map();

const getClientFingerprint = (req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex');
};

// Middleware للتحقق من التوكن
exports.verifyAdminToken = (req, res, next) => {
    const token = (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]) ||
                  req.cookies['admin_token'];

    if (!token) {
        logSecurityEvent('UNAUTHORIZED_ACCESS', 'محاولة الوصول بدون توكن', req);
        return res.status(403).json({ success: false, message: "يجب تسجيل الدخول أولاً" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            logSecurityEvent('INVALID_TOKEN', 'استخدام توكن غير صالح أو منتهي الصلاحية', req);
            return res.status(401).json({ success: false, message: "جلسة منتهية، يرجى إعادة تسجيل الدخول" });
        }

        const fingerprint = getClientFingerprint(req);
        const session = adminSessions.get(decoded.jti || token);
        if (!session || session.fingerprint !== fingerprint) {
            logSecurityEvent('SESSION_MISMATCH', 'محاولة استخدام جلسة غير متطابقة', req);
            return res.status(401).json({ success: false, message: "جلسة غير صالحة، يرجى تسجيل الدخول مرة أخرى" });
        }

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

        // Check for account lockout
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const attemptKey = `admin:${ip}`;
        const attempts = adminFailedAttempts.get(attemptKey) || { count: 0, lockedUntil: 0 };

        if (attempts.lockedUntil > Date.now()) {
            const remaining = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
            return res.status(429).json({
                success: false,
                message: `تم إغلاق الحساب مؤقتاً. يرجى المحاولة بعد ${remaining} دقيقة.`
            });
        }

        const isMatch = await bcrypt.compare(password, adminHash);
        if (isMatch) {
            adminFailedAttempts.delete(attemptKey);

            const sessionId = crypto.randomBytes(16).toString('hex');
            const token = jwt.sign({ role: 'admin', jti: sessionId }, jwtSecret, { expiresIn: '12h' });
            const fingerprint = getClientFingerprint(req);
            adminSessions.set(sessionId, { fingerprint, issuedAt: Date.now() });

            // ✅ تحسين أمني: إرسال الـ HttpOnly Cookie
            // في التطوير (localhost/127.0.0.1) → secure = false، sameSite = 'none'
            // في الإنتاج (https) → secure = true، sameSite = 'lax'
            const isLocalhost = req.hostname === 'localhost' ||
                                req.hostname === '127.0.0.1' ||
                                req.headers['x-forwarded-host']?.includes('localhost') ||
                                req.headers['x-forwarded-host']?.includes('127.0.0.1');

            console.log('🔐 Setting cookie → isLocalhost:', isLocalhost, '| secure:', !isLocalhost);

            res.cookie('admin_token', token, {
                httpOnly: true,
                secure: !isLocalhost,
                sameSite: isLocalhost ? 'none' : 'lax',
                maxAge: 12 * 60 * 60 * 1000,
                path: '/',
                overwrite: true
            });

            // ✅ Force the cookie to be sent BEFORE any await
            res.setHeader('X-Cookie-Sent', 'true');

            await createLog('تسجيل دخول', 'قام المسؤول بتسجيل الدخول بنجاح', req);

            const loginMsg = `🔐 *تنبيه أمني: دخول المسؤول*\n🌐 *IP:* \`${ip}\` \n🕒 *الوقت:* \`${new Date().toLocaleString('ar-EG')}\``;
            await sendTelegramAlert(loginMsg);

            logSecurityEvent('ADMIN_LOGIN_SUCCESS', 'نجح تسجيل دخول الأدمن', req);

            res.json({ success: true, token, message: "تم تسجيل الدخول بنجاح" });
        } else {
            // Increment failed attempts
            attempts.count++;
            if (attempts.count >= MAX_FAILED_ATTEMPTS) {
                attempts.lockedUntil = Date.now() + LOCKOUT_DURATION;
                logSecurityEvent('ADMIN_LOCKED_OUT', `تم إغلاق حساب الأدمن مؤقتاً بعد ${attempts.count} محاولات فاشلة`, req);
            }
            adminFailedAttempts.set(attemptKey, attempts);
            
            logSecurityEvent('ADMIN_LOGIN_FAILED', 'فشل تسجيل دخول الأدمن - كلمة مرور خاطئة', req);
            res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة" });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.logout = (req, res) => {
    const token = req.cookies['admin_token'];
    if (token) {
        try {
            const decoded = jwt.decode(token);
            if (decoded?.jti) {
                adminSessions.delete(decoded.jti);
            }
        } catch (error) {
            // ignore malformed token
        }
    }

    res.clearCookie('admin_token', { path: '/' });
    res.clearCookie('csrf_token', { path: '/' });
    logSecurityEvent('ADMIN_LOGOUT', 'تسجيل خروج الأدمن', req);
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
};
