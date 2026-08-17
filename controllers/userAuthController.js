const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, Order } = require('../models');
const { logSecurityEvent } = require('../middleware/securityLogger');

// مفتاح توقيع منفصل لتوكنات المستخدمين (يُنصح بأن يختلف عن مفتاح الأدمن)
const getUserSecret = () => process.env.JWT_USER_SECRET || process.env.JWT_SECRET;

// Track failed login attempts
const failedAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 minutes

// Periodic cleanup of failed-attempt counters
setInterval(() => {
    const now = Date.now();
    failedAttempts.forEach((attempt, key) => {
        if (now - attempt.firstAttempt > ATTEMPT_WINDOW) {
            failedAttempts.delete(key);
        }
    });
}, 60 * 60 * 1000).unref();

// في الإنتاج يكون secure دائماً — لا نثق إطلاقاً بترويسات X-Forwarded-Host المخادعة
const isLocalhostRequest = (req) => {
    return process.env.NODE_ENV !== 'production' &&
        (req.hostname === 'localhost' || req.hostname === '127.0.0.1');
};

/**
 * تسجيل مستخدم جديد
 */
exports.register = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.' });
        }

        // Validate password strength
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور ضعيفة. يجب أن تحتوي على 8 أحرف على الأقل، مع حرف كبير، حرف صغير، ورقم.'
            });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'هذا البريد الإلكتروني مسجل بالفعل.' });
        }

        const salt = await bcrypt.genSalt(12); // زيادة عدد الأدوار للأمان
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            email: email.toLowerCase(),
            passwordHash: hashedPassword,
            balance: 0
        });

        await newUser.save();

        logSecurityEvent('USER_REGISTERED', `تم تسجيل مستخدم جديد: ${email}`, req);

        res.status(201).json({ success: true, message: 'تم إنشاء الحساب بنجاح! يمكنك الآن تسجيل الدخول.' });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء إنشاء الحساب.' });
    }
};

/**
 * تسجيل دخول مستخدم
 */
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // Check for account lockout
        const attemptKey = `${email.toLowerCase()}:${ip}`;
        const attempts = failedAttempts.get(attemptKey) || { count: 0, firstAttempt: Date.now() };

        // Reset attempts if the window has passed
        if (Date.now() - attempts.firstAttempt > ATTEMPT_WINDOW) {
            attempts.count = 0;
            attempts.firstAttempt = Date.now();
        }

        if (attempts.count >= MAX_FAILED_ATTEMPTS) {
            logSecurityEvent('ACCOUNT_LOCKED', `حساب مؤقتاً مغلق بسبب محاولات تسجيل دخول فاشلة: ${email}`, req);
            return res.status(429).json({
                success: false,
                message: 'تم إغلاق الحساب مؤقتاً مثل هذا. يرجى المحاولة بعد 15 دقيقة.'
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

        if (!user) {
            // Increment failed attempts
            attempts.count++;
            failedAttempts.set(attemptKey, attempts);
            
            logSecurityEvent('FAILED_LOGIN', `محاولة تسجيل دخول فاشلة - بريد غير موجود: ${email}`, req);
            return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            // Increment failed attempts
            attempts.count++;
            failedAttempts.set(attemptKey, attempts);
            
            logSecurityEvent('FAILED_LOGIN', `محاولة تسجيل دخول فاشلة - كلمة مرور خاطئة: ${email}`, req);
            return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }

        // Reset failed attempts on successful login
        failedAttempts.delete(attemptKey);

        // توكن صالح لمدة أسبوع، مُوقّع بمفتاح مستخدم منفصل
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            getUserSecret(),
            { expiresIn: '7d' }
        );

        // أمان: التوكن يُحفظ في HttpOnly cookie فقط ولا يُمرَّر للجافاسكريبت
        // (يمنع سرقته عبر XSS من localStorage/document.cookie)
        res.cookie('user_token', token, {
            httpOnly: true,
            secure: !isLocalhostRequest(req),
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        });

        logSecurityEvent('SUCCESSFUL_LOGIN', `تسجيل دخول ناجح: ${email}`, req);

        res.json({
            success: true,
            user: { email: user.email, balance: user.balance }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء تسجيل الدخول.' });
    }
};

/**
 * جلب بيانات المستخدم الحالي (للتحقق من حالة الجلسة عبر الكوكي)
 */
exports.getMe = async (req, res) => {
    try {
        if (!req.user || !req.user.userId) {
            return res.json({ success: true, user: null });
        }
        const user = await User.findById(req.user.userId).select('email balance');
        if (!user) {
            return res.json({ success: true, user: null });
        }
        res.json({ success: true, user: { email: user.email, balance: user.balance } });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء جلب بيانات المستخدم.' });
    }
};

/**
 * جلب سجل طلبات المستخدم
 */
exports.getOrderHistory = async (req, res) => {
    try {
        // تحديث: البحث باستخدام معرّف المستخدم بدلاً من البريد الإلكتروني
        // هذا يضمن أن المستخدم يرى طلباته فقط، حتى لو تغير بريده الإلكتروني مستقبلاً.
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const query = { userId: req.user.userId };
        const [orders, total] = await Promise.all([
            Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Order.countDocuments(query)
        ]);
        res.json({ success: true, orders, total, page, limit });
    } catch (err) {
        console.error('Error fetching order history:', err);
        res.status(500).json({ success: false, error: 'فشل جلب سجل الطلبات.' });
    }
};

/**
 * تسجيل الخروج (إبطال الجلسة في المتصفح بمسح الكوكي)
 */
exports.logout = async (req, res) => {
    try {
        logSecurityEvent('USER_LOGOUT', `تسجيل خروج: ${req.user?.email || 'مجهول'}`, req);
        res.clearCookie('user_token', {
            path: '/',
            httpOnly: true,
            secure: !isLocalhostRequest(req),
            sameSite: 'lax'
        });
        res.json({ success: true, message: 'تم تسجيل الخروج بنجاح.' });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء تسجيل الخروج.' });
    }
};
