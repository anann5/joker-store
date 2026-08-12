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
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours (matches JWT expiry)

const computeFingerprint = (ip, userAgent) => {
    return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex');
};

const getClientFingerprint = (req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return computeFingerprint(ip, userAgent);
};

/**
 * Verify an admin JWT against the in-memory server session + client fingerprint.
 * Returns the decoded payload or null when invalid/expired/mismatched.
 */
const verifyAdminSession = (token, ip, userAgent) => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const fingerprint = computeFingerprint(ip, userAgent);
        const session = adminSessions.get(decoded.jti || token);
        if (!session || session.fingerprint !== fingerprint) {
            return null;
        }
        return decoded;
    } catch (_err) {
        return null;
    }
};

/**
 * Socket.IO middleware: authenticate an admin socket using the HttpOnly cookie.
 * On success the socket joins the 'admins' room.
 */
exports.verifyAdminSocket = (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie || '';
    const cookies = {};
    cookieHeader.split(';').forEach(part => {
        const idx = part.indexOf('=');
        if (idx > -1) {
            cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
        }
    });

    const token = cookies['admin_token'];
    if (!token) return next(new Error('unauthorized'));

    const decoded = verifyAdminSession(
        token,
        socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || 'unknown',
        socket.handshake.headers['user-agent'] || 'unknown'
    );
    if (!decoded) return next(new Error('unauthorized'));

    socket.admin = decoded;
    socket.join('admins');
    next();
};

// Periodic cleanup of expired sessions / stale failed-attempt counters
// to prevent unbounded in-memory growth.
setInterval(() => {
    const now = Date.now();
    adminSessions.forEach((session, key) => {
        if (!session.issuedAt || now - session.issuedAt > SESSION_TTL_MS) {
            adminSessions.delete(key);
        }
    });
    adminFailedAttempts.forEach((attempt, key) => {
        if (attempt.lockedUntil && now > attempt.lockedUntil + LOCKOUT_DURATION) {
            adminFailedAttempts.delete(key);
        }
    });
}, 60 * 60 * 1000).unref();

// Middleware للتحقق من التوكن
exports.verifyAdminToken = (req, res, next, redirectPath) => {
    const token = (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]) ||
                  req.cookies['admin_token'];

    if (!token) {
        logSecurityEvent('UNAUTHORIZED_ACCESS', 'محاولة الوصول بدون توكن', req);
        if (redirectPath) return res.redirect(redirectPath);
        return res.status(403).json({ success: false, message: "يجب تسجيل الدخول أولاً" });
    }

    const decoded = verifyAdminSession(
        token,
        req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown',
        req.headers['user-agent'] || 'unknown'
    );
    if (!decoded) {
        logSecurityEvent('INVALID_TOKEN', 'استخدام توكن غير صالح أو منتهي الصلاحية أو جلسة غير متطابقة', req);
        if (redirectPath) return res.redirect(redirectPath);
        return res.status(401).json({ success: false, message: "جلسة منتهية، يرجى إعادة تسجيل الدخول" });
    }

    req.admin = decoded;
    next();
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
            // في التطوير (localhost/127.0.0.1) → secure = false، sameSite = 'lax'
            // في الإنتاج (https) → secure = true، sameSite = 'lax'
            // ملاحظة: 'sameSite=none' مرفوض من المتصفحات بدون 'secure'، لذا نعتمد 'lax' دائماً.
            const isLocalhost = req.hostname === 'localhost' ||
                                req.hostname === '127.0.0.1' ||
                                req.headers['x-forwarded-host']?.includes('localhost') ||
                                req.headers['x-forwarded-host']?.includes('127.0.0.1');

            console.log('🔐 Setting cookie → isLocalhost:', isLocalhost, '| secure:', !isLocalhost);

            res.cookie('admin_token', token, {
                httpOnly: true,
                secure: !isLocalhost,
                sameSite: 'lax',
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

            // لا يُعاد التوكن صريحاً في الاستجابة؛ المتصفح يحمله في HttpOnly cookie فقط
            res.json({ success: true, message: "تم تسجيل الدخول بنجاح" });
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
        } catch (_error) {
            // ignore malformed token
        }
    }

    const isLocalhost = req.hostname === 'localhost' ||
                        req.hostname === '127.0.0.1' ||
                        req.headers['x-forwarded-host']?.includes('localhost') ||
                        req.headers['x-forwarded-host']?.includes('127.0.0.1');

    res.clearCookie('admin_token', {
        path: '/',
        httpOnly: true,
        secure: !isLocalhost,
        sameSite: 'lax'
    });
    res.clearCookie('csrf_token', { path: '/', secure: !isLocalhost, sameSite: 'lax' });
    logSecurityEvent('ADMIN_LOGOUT', 'تسجيل خروج الأدمن', req);
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
};
