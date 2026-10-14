const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, Order } = require('../models');
const { logSecurityEvent } = require('../middleware/securityLogger');

// مفتاح توقيع منفصل لتوكنات المستخدمين (يُنصح بأن يختلف عن مفتاح الأدمن)
const getUserSecret = () => process.env.JWT_USER_SECRET || process.env.JWT_SECRET;

// ===== نظام الإحالة =====
const REFERRAL_REWARD = () => parseFloat(process.env.REFERRAL_REWARD || '5');
const REFERRAL_WELCOME = () => parseFloat(process.env.REFERRAL_WELCOME || '2');
const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بلا أحرف غامضة

const generateReferralCode = () => {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += REFERRAL_ALPHABET[bytes[i] % REFERRAL_ALPHABET.length];
    }
    return code;
};

async function generateUniqueReferralCode() {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateReferralCode();
        const exists = await User.findOne({ referralCode: code }).select('_id').lean();
        if (!exists) return code;
    }
    throw new Error('تعذر توليد كود إحالة فريد');
}

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
        const referralCodeInput = String(req.body.referralCode || '').trim().toUpperCase();

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

        // التحقق من كود الإحالة المرفق (اختياري)
        let referrer = null;
        const normalizedEmail = email.toLowerCase();
        if (referralCodeInput) {
            if (referralCodeInput.length < 4 || referralCodeInput.length > 12 || !/^[A-Z0-9]+$/.test(referralCodeInput)) {
                return res.status(400).json({ success: false, message: 'كود الإحالة غير صالح.' });
            }
            referrer = await User.findOne({ referralCode: referralCodeInput }).select('email').lean();
            if (!referrer) {
                return res.status(400).json({ success: false, message: 'كود الإحالة غير صالح.' });
            }
            if (referrer.email === normalizedEmail) {
                return res.status(400).json({ success: false, message: 'لا يمكنك استخدام كود إحالتك الخاص.' });
            }
        }

        const salt = await bcrypt.genSalt(12); // زيادة عدد الأدوار للأمان
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            email: normalizedEmail,
            passwordHash: hashedPassword,
            balance: 0
        });

        newUser.referralCode = await generateUniqueReferralCode();
        await newUser.save();

        if (referrer) {
            const reward = REFERRAL_REWARD();
            const welcome = REFERRAL_WELCOME();
            await User.updateOne(
                { _id: referrer._id },
                {
                    $inc: { balance: reward, referralEarned: reward, referralCount: 1 },
                    $push: { referralHistory: { amount: reward, type: 'referral', fromEmail: normalizedEmail } }
                }
            );
            if (welcome > 0) {
                newUser.balance += welcome;
                newUser.referralHistory.push({ amount: welcome, type: 'welcome', fromEmail: referrer.email });
                await newUser.save();
            }
            logSecurityEvent('REFERRAL_USED', `إحالة مستخدم جديد: ${referralCodeInput} ← ${normalizedEmail}`, req);
        }

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
        const user = await User.findById(req.user.userId).select('email balance referralCode referralCount referralEarned');
        if (!user) {
            return res.json({ success: true, user: null });
        }
        res.json({
            success: true,
            user: {
                email: user.email,
                balance: user.balance,
                referralCode: user.referralCode,
                referralCount: user.referralCount,
                referralEarned: user.referralEarned
            }
        });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء جلب بيانات المستخدم.' });
    }
};

/**
 * معلومات الإحالة للمستخدم الحالي: كود المشاركة + رابط + إحصائيات.
 */
exports.getReferralInfo = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .select('referralCode referralCount referralEarned referralHistory email');
        if (!user) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود.' });
        }

        const host = req.get('host');
        const proto = req.headers['x-forwarded-proto'] || req.protocol;
        const origin = `${proto}://${host}`;

        res.json({
            success: true,
            referral: {
                code: user.referralCode,
                url: `${origin}/?ref=${user.referralCode}`,
                count: user.referralCount,
                earned: user.referralEarned,
                history: Array.isArray(user.referralHistory) ? user.referralHistory.slice(-10).reverse() : []
            }
        });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب معلومات الإحالة.' });
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

// أقصى عدد عناصر في السلة المخزنة (حماية من سوء الاستخدام)
const MAX_CART_ITEMS = 200;

/**
 * جلب سلة المستخدم السحابية (للزامنة بين الأجهزة).
 * المعرّف في التوكن هو req.user.userId — لا يوجد req.user.id إطلاقاً.
 */
exports.getUserCart = async (req, res) => {
    if (!req.user || !req.user.userId) {
        return res.status(401).json({ success: false });
    }
    try {
        const user = await User.findById(req.user.userId).select('cart');
        if (!user) {
            return res.status(401).json({ success: false });
        }
        res.json({ success: true, cart: Array.isArray(user.cart) ? user.cart : [] });
    } catch (_err) {
        res.status(500).json({ success: false });
    }
};

/**
 * حفظ سلة المستخدم السحابية.
 * الجسم المتوقع: { cart: [{ id, qty }] } — يُطبَّع ويُخزَّن بصيغة productId/qty.
 */
exports.saveUserCart = async (req, res) => {
    if (!req.user || !req.user.userId) {
        return res.status(401).json({ success: false });
    }
    try {
        const input = Array.isArray(req.body && req.body.cart) ? req.body.cart : [];
        if (input.length > MAX_CART_ITEMS) {
            return res.status(400).json({ success: false, error: 'سلة كبيرة جداً.' });
        }

        const normalized = [];
        const seen = new Set();
        for (const item of input) {
            if (!item || typeof item !== 'object') continue;
            const id = typeof item.id === 'string' ? item.id.trim() : '';
            if (!id || !/^[a-fA-F0-9]{24}$/.test(id)) continue; // نتجاهل المعرّفات غير الصالحة
            if (seen.has(id)) continue; // نمنع التكرار
            const parsedQty = Number.parseInt(item.qty, 10);
            const qty = Number.isInteger(parsedQty) ? Math.min(99, Math.max(1, parsedQty)) : 1;
            seen.add(id);
            normalized.push({ productId: id, qty });
            if (normalized.length >= MAX_CART_ITEMS) break;
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(401).json({ success: false });
        }
        user.cart = normalized;
        await user.save();
        res.json({ success: true });
    } catch (_err) {
        res.status(500).json({ success: false });
    }
};
