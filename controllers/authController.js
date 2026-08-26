const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createLog, sendTelegramAlert } = require('./helpers');
const { logSecurityEvent } = require('../middleware/securityLogger');
const { AdminSession } = require('../models');

// Rate limiting storage for admin login attempts
const adminFailedAttempts = new Map();
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const SESSION_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours (matches JWT expiry)

const computeFingerprint = (ip, userAgent) => {
    return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex');
};

const getClientIp = (req) => {
    // خلف وسطاء (Cloudflare/Render) يحوي x-forwarded-for قائمة IPs مفصولة بفواصل
    // ويغيّر ترتيبها بين الطلبات، لذا نأخذ أول عنوان فقط لثبات البصمة.
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
        const first = String(xff).split(',')[0].trim();
        if (first) return first;
    }
    return req.socket.remoteAddress || 'unknown';
};

// نفس منطق getClientIp لكن للسياق الخاص الصادرة من مآخذ الويب (socket.io)
const clientIpFrom = (xff, remoteAddress) => {
    if (xff) {
        const first = String(xff).split(',')[0].trim();
        if (first) return first;
    }
    return remoteAddress || 'unknown';
};

const getClientFingerprint = (req) => {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    return computeFingerprint(ip, userAgent);
};

/**
 * Verify an admin JWT against the DB-persisted session + client fingerprint.
 * Returns the decoded payload or null when invalid/expired/mismatched.
 */
const verifyAdminSession = async (token, ip, userAgent) => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const fingerprint = computeFingerprint(ip, userAgent);
        const session = await AdminSession.findOne({ jti: decoded.jti || token });
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
exports.verifyAdminSocket = async (socket, next) => {
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

    const decoded = await verifyAdminSession(
        token,
        clientIpFrom(socket.handshake.headers['x-forwarded-for'], socket.handshake.address),
        socket.handshake.headers['user-agent'] || 'unknown'
    );
    if (!decoded) return next(new Error('unauthorized'));

    socket.admin = decoded;
    socket.join('admins');
    next();
};

/**
 * Socket.IO middleware: authenticate a storefront user socket using the
 * HttpOnly `user_token` cookie. On success the socket joins the 'user:<id>' room
 * so approved/rejected orders reach the customer in realtime.
 */
exports.verifyUserSocket = async (socket, next) => {
    try {
        const cookieHeader = socket.handshake.headers.cookie || '';
        const cookies = {};
        cookieHeader.split(';').forEach(part => {
            const idx = part.indexOf('=');
            if (idx > -1) {
                cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
            }
        });

        const token = cookies['user_token'];
        if (!token) return next(new Error('unauthorized'));

        const secret = process.env.JWT_USER_SECRET || process.env.JWT_SECRET;
        const decoded = jwt.verify(token, secret);
        if (!decoded || !decoded.userId) return next(new Error('unauthorized'));

        socket.userId = decoded.userId;
        socket.join(`user:${decoded.userId}`);
        return next();
    } catch (_err) {
        return next(new Error('unauthorized'));
    }
};

// Periodic cleanup of stale failed-attempt counters
// (الجلسات تنظف تلقائياً من MongoDB عبر TTL على expiresAt)
setInterval(() => {
    const now = Date.now();
    adminFailedAttempts.forEach((attempt, key) => {
        // حذف المحاولات التي انتهى القفل فيها
        if (attempt.lockedUntil && now > attempt.lockedUntil) {
            adminFailedAttempts.delete(key);
        }
    });
}, 60 * 60 * 1000).unref();

// Middleware للتحقق من التوكن
exports.verifyAdminToken = async (req, res, next, redirectPath = null) => {
    const token = (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]) ||
                  req.cookies['admin_token'];

    if (!token) {
        logSecurityEvent('UNAUTHORIZED_ACCESS', 'محاولة الوصول بدون توكن', req);
        if (redirectPath) return res.redirect(redirectPath);
        return res.status(403).json({ success: false, message: "يجب تسجيل الدخول أولاً" });
    }

    const decoded = await verifyAdminSession(
        token,
        getClientIp(req),
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
        const ip = getClientIp(req);
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
        // 2FA اختياري: إن ضُبط ADMIN_2FA_CODE يجب إرسال totp مطابق
        const required2FA = String(process.env.ADMIN_2FA_CODE || '').trim();
        if (isMatch && required2FA) {
            const provided = String(req.body?.totp || '').trim();
            if (provided !== required2FA) {
                logSecurityEvent('ADMIN_2FA_FAILED', 'رمز تحقق ثنائي خاطئ', req);
                return res.status(401).json({ success: false, message: 'رمز التحقق الثنائي غير صحيح' });
            }
        }
        if (isMatch) {
            adminFailedAttempts.delete(attemptKey);

            const sessionId = crypto.randomBytes(16).toString('hex');
            const token = jwt.sign({ role: 'admin', jti: sessionId }, jwtSecret, { expiresIn: SESSION_TTL_MS / 1000 });
            const fingerprint = getClientFingerprint(req);

            // الجلسة محفوظة في MongoDB (بدل الذاكرة) حتى تبقى صالحة
            // بعد إعادة تشغيل السيرفر، وتُنظف تلقائياً عبر TTL.
            await AdminSession.create({
                jti: sessionId,
                fingerprint,
                ip: getClientIp(req),
                expiresAt: new Date(Date.now() + SESSION_TTL_MS)
            });

            // ✅ تحسين أمني: إرسال الـ HttpOnly Cookie
            // في التطوير (localhost/127.0.0.1) → secure = false، sameSite = 'lax'
            // في الإنتاج (https) → secure = true دائماً (بغض النظر عن أي ترويسات X-Forwarded مخادعة)
            // ملاحظة: 'sameSite=none' مرفوض من المتصفحات بدون 'secure'، لذا نعتمد 'lax' دائماً.
            const isLocalhost = process.env.NODE_ENV !== 'production' &&
                (req.hostname === 'localhost' || req.hostname === '127.0.0.1');

            res.cookie('admin_token', token, {
                httpOnly: true,
                secure: !isLocalhost,
                sameSite: 'lax',
                maxAge: SESSION_TTL_MS,
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
        // لا نكشف للعميل تفاصيل الخطأ الداخلية (bcrypt/DB) في الإنتاج
        const message = process.env.NODE_ENV === 'production'
            ? 'حدث خطأ أثناء تسجيل الدخول'
            : err.message;
        res.status(500).json({ success: false, error: message });
    }
};

exports.logout = async (req, res) => {
    const token = req.cookies['admin_token'];
    if (token) {
        try {
            const decoded = jwt.decode(token);
            if (decoded?.jti) {
                await AdminSession.deleteOne({ jti: decoded.jti });
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
