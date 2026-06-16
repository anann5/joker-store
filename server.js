const dotenv = require('dotenv');
const envResult = dotenv.config();

if (envResult.error && process.env.NODE_ENV !== 'production') {
    console.log('⚠️ خطأ: لم يتم العثور على ملف .env في المجلد الرئيسي!');
}

const crypto = require('crypto');
const express    = require('express');
const mongoose   = require('mongoose');
const path       = require('path');
const rateLimit  = require('express-rate-limit');
const helmet     = require('helmet');
const nodemailer = require('nodemailer');
const axios      = require('axios');
const bcrypt     = require('bcrypt');

// ====================================================
// 🚀 إعداد إشعارات تلجرام (مجانية 100% وسريعة)
// ====================================================
async function notifyAdminTelegram(orderId, amount, customer) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId   = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) return;

    const message = 
        `🃏 *طلب شراء جديد!*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🆔 *رقم الطلب:* \`${orderId}\` \n` +
        `👤 *العميل:* ${customer}\n` +
        `💰 *المبلغ:* \`${amount}$\` \n` +
        `━━━━━━━━━━━━━━\n` +
        `🚀 *افحص لوحة التحكم الآن!*`;

    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });
        console.log('✅ تم إرسال إشعار تلجرام بنجاح');
    } catch (err) {
        if (err.response && err.response.data) {
            console.error('⚠️ خطأ تلجرام:', err.response.data.description);
        } else {
            console.error('⚠️ خطأ في إرسال إشعار تلجرام:', err.message);
        }
    }
}

// ====================================================
// 📧 إعداد مُرسل الإيميلات الصاروخي عبر منصة Resend
// ====================================================
const transporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true, 
    auth: {
        user: 'resend', 
        pass: process.env.RESEND_API_KEY
    }
});

// تحقق من الاتصال بالإيميل عند تشغيل السيرفر
transporter.verify(function(error, success) {
    if (error) {
        console.log('⚠️ مشكلة في إعداد الإيميل:', error.message);
    } else {
        console.log('✅ الإيميل جاهز للإرسال!');
    }
});

async function sendCodeByEmail(buyerEmail, productName, code, orderId) {
    const mailOptions = {
        from: `"Joker Store 🃏" <onboarding@resend.dev>`,
        to: buyerEmail, 
        subject: `✅ كود الشحن الخاص بك — ${productName}`,
        html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #1a1a2e; color: #fff; padding: 30px; border-radius: 12px;">
            <h2 style="color: #ff9f43; text-align: center;">🃏 Joker Store</h2>
            <h3 style="text-align: center; color: #00f2fe;">✅ تم الشراء بنجاح!</h3>
            <p style="color: #ccc;">شكراً لشرائك من متجر الجوكر!</p>
            <p><strong>المنتج:</strong> ${productName}</p>
            <p><strong>رقم الطلب:</strong> ${orderId}</p>
            <div style="background: #0f0f18; border: 2px solid #ff9f43; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
                <p style="color: #aaa; margin-bottom: 8px;">كود الشحن الخاص بك:</p>
                <p style="color: #ff9f43; font-size: 1.5rem; font-weight: bold; letter-spacing: 3px; word-break: break-all;">${code}</p>
            </div>
            <p style="color: #aaa; font-size: 0.85rem; text-align: center;">احتفظ بهذا الكود في مكان آمن</p>
            <hr style="border-color: #333; margin: 20px 0;">
            <p style="color: #666; font-size: 0.8rem; text-align: center;">© 2026 Joker Store — جميع الحقوق محفوظة</p>
        </div>
        `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 تم إرسال الكود لـ ${buyerEmail}`);
}

const { Product, Order, Log } = require('./models');
const app = express();
app.set('trust proxy', 1);

// ====================================================
// 🛡️ Helmet & Rate Limiting
// ====================================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:  ["'self'"],
            styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc:     ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc:      ["'self'", "data:", "https:"],
            scriptSrc:   ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            connectSrc:  ["'self'"],
            frameSrc:    ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 150,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'كثير طلبات، انتظر شوي' }
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 1000, 
    message: { success: false, error: 'محاولات كثيرة، انتظر 15 دقيقة' }
});

app.use(generalLimiter);

// 🛡️ محدد طلبات صارم مخصص لحماية حقل الشراء والإيميلات من السبام
const checkoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // كل 15 دقيقة
    max: 5, // يسمح بـ 5 محاولات فقط كحد أقصى من نفس الجهاز
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'لقد قمت بمحاولات شراء كثيرة، يرجى الانتظار 15 دقيقة ثم المحاولة مجدداً.' }
});

// Map لحفظ التوكنات النشطة في الذاكرة
const activeTokens = new Map();

// تنظيف التوكنات المنتهية كل ساعة
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of activeTokens.entries()) {
        if (data.expiresAt < now) {
            activeTokens.delete(token);
        }
    }
}, 60 * 60 * 1000);

// ====================================================
// قاعدة البيانات
// ====================================================
if (!process.env.MONGODB_URI || !process.env.MONGODB_URI.startsWith('mongodb')) {
    console.error('❌ خطأ فادح: MONGODB_URI مفقود أو غير صحيح في ملف .env');
    console.error('تأكد من وجود المتغير في ملف الـ .env وحفظ الملف.');
    process.exit(1); // إيقاف السيرفر بوضوح بدلاً من الانهيار
}

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB متصل');
        // فحص وجود الـ Hash عند التشغيل لمساعدة المطور
        
        console.log('📂 المجلد الحالي للسيرفر:', process.cwd());

        if (process.env.ADMIN_PASSWORD_HASH) {
            console.log('🛡️ نظام حماية الأدمن: جاهز (Hash موجود)');
        } else {
            console.log('❌ نظام حماية الأدمن: تعذر التشغيل (ADMIN_PASSWORD_HASH مفقود في ملف .env)');
            console.log('❌ خطأ أمني: ADMIN_PASSWORD_HASH غير موجود في ملف .env');
        }
    })
    .catch(err => console.log('⚠️ MongoDB غير متصل:', err.message));

app.use(express.json({ limit: '10kb' }));

// NoSQL Sanitize يدوي
app.use((req, res, next) => {
    const sanitize = (obj) => {
        if (obj && typeof obj === 'object') {
            for (const key in obj) {
                if (key.startsWith('$') || key.includes('.')) {
                    delete obj[key];
                } else if (typeof obj[key] === 'object') {
                    sanitize(obj[key]);
                }
            }
        }
    };
    sanitize(req.body);
    sanitize(req.params);
    sanitize(req.query);
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ==========================================================
// 🔒 مسارات صفحات الأدمن المحمية (Admin UI Routes)
// ==========================================================

// ✅ راوت آمن ومستقل لعرض صفحة تسجيل الدخول للأدمن
app.get('/admin-login', (req, res) => {
    // بما أن ملف login.html يظهر في القائمة لديك داخل مجلد public مباشرة:
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 2. الرابط الذكي والديناميكي للدخول للوحة التحكم (يمنع الرمشة والتسريب)
app.get('/admin', (req, res) => {
    const token = req.query.token;

    // إذا لم يرسل توكن، يوجهه فوراً لصفحة تسجيل الدخول الآمنة
    if (!token) {
        return res.redirect('/admin-login');
    }

    const tokenData = activeTokens.get(token);
    // إذا كان التوكن وهمي أو منتهي الصلاحية، يتم حذفه والتوجيه لصفحة الدخول
    if (!tokenData || tokenData.expiresAt < Date.now()) {
        if (tokenData) activeTokens.delete(token);
        return res.redirect('/admin-login');
    }

    // الحصن الأمني: السيرفر يسلم الصفحة الحساسة من المجلد الخاص (private) فقط بعد نجاح الفحص
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

// 3. دالة التحقق الصارمة لحماية عمليات الـ API (تعديل، حذف، إضافة)
async function verifyAdmin(req, res, next) {
    // جلب التوكن إما من الـ Headers (الأسلوب الأفضل للـ Front-end) أو من الـ Query
    const token = req.headers['x-admin-token'] || req.query.token;
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالوصول، يرجى تسجيل الدخول!' });
    }

    const tokenData = activeTokens.get(token);
    if (!tokenData || tokenData.expiresAt < Date.now()) {
        // سجل محاولة اختراق أو استخدام توكن منتهي
        await new Log({ 
            action: 'محاولة وصول غير مصرح', 
            details: `محاولة استخدام توكن غير صالح أو منتهي من IP: ${req.ip}`, 
            ip: req.ip 
        }).save();
        if (tokenData) activeTokens.delete(token);
        return res.status(401).json({ success: false, error: 'انتهت صلاحية الجلسة، سجل دخول مجدداً' });
    }

    // التوكن سليم، مرر العملية بأمان
    next();
}

// ====================================================
// 🛡️ الـ API للأدمن
// ====================================================
app.post('/api/admin/login', adminLimiter, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || typeof password !== 'string') {
             return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
        }

        const hashedPass = process.env.ADMIN_PASSWORD_HASH ? process.env.ADMIN_PASSWORD_HASH.trim() : null;

        if (!hashedPass) return res.status(500).json({ success: false, error: 'السيرفر غير مهيأ أمنياً (نقص الـ Hash)' });

        const isMatch = await bcrypt.compare(password, hashedPass);
        if (!isMatch) return res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة' });

        const sessionToken = crypto.randomBytes(32).toString('hex');
        activeTokens.set(sessionToken, {
            createdAt: Date.now(),
            expiresAt: Date.now() + (8 * 60 * 60 * 1000)
        });

        // سجل حركة تسجيل الدخول
        await new Log({ 
            action: 'تسجيل دخول', 
            details: 'تم الدخول بنجاح للوحة التحكم', 
            ip: req.ip 
        }).save();

        return res.json({ success: true, token: sessionToken });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'خطأ داخلي بالسيرفر' });
    }
});

// ✅ الترتيب الصحيح: الـ Middlewares أولاً، ثم كلمة async قبل الـ (req, res)
app.get('/api/admin/inventory', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const products = await Product.find({ isActive: true }).select('productName category region price codes updatedAt');
        
        const inventory = products.map(p => ({
            id: p._id,
            productName: p.productName || "اسم المنتج",
            category: p.category || "عام",
            region: p.region || "عالمي",
            price: p.price || 0,
            available: p.codes ? p.codes.filter(c => c.status === 'available').length : 0,
            total: p.codes ? p.codes.length : 0,
            lastUpdated: p.updatedAt || new Date()
        }));

        res.json({ success: true, inventory });
    } catch (err) {
        console.error('Inventory Route Error:', err);
        res.status(500).json({ success: false, error: 'حدث خطأ داخلي في السيرفر' });
    }
});

app.put('/api/admin/products/:id', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const { productName, price, region, category } = req.body;
        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            { productName: productName.trim(), price: parseFloat(price), region, category, updatedAt: new Date() },
            { returnDocument: 'after' }
        );
        if (!updatedProduct) return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
        
        // سجل الحركة
        await new Log({ 
            action: 'تعديل منتج', 
            details: `تم تعديل بيانات المنتج: ${updatedProduct.productName}`, 
            ip: req.ip 
        }).save();

        res.json({ success: true, message: '✅ تم تحديث بيانات البطاقة بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل في تحديث المنتج' });
    }
});

app.delete('/api/admin/products/:id', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
        product.isActive = false;
        await product.save();

        // سجل الحركة
        await new Log({ 
            action: 'حذف منتج', 
            details: `تم إخفاء/حذف المنتج: ${product.productName}`, 
            ip: req.ip 
        }).save();

        res.json({ success: true, message: '🗑️ تم حذف المنتج بنجاح من العرض' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل في حذف المنتج' });
    }
});

// ✅ جلب جميع الطلبات للأدمن
app.get('/api/admin/orders', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل في جلب قائمة الطلبات' });
    }
});

// ✅ الموافقة على الطلب وإرسال الكود (بضغطة زر)
app.post('/api/admin/orders/:id/complete', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
        if (order.status !== 'pending') return res.status(400).json({ success: false, error: 'الطلب معالج مسبقاً' });

        // 1. البحث عن المنتج الأول في الطلب (لتبسيط النسخة الحالية)
        const item = order.items[0]; 
        if (!item || !item.productId) throw new Error('بيانات المنتج مفقودة في الطلب');

        // 2. سحب كود من المخزون بشكل ذري (Atomic)
        const codeValue = await Product.claimCodeAtomic(item.productId, order.orderId, order.buyerEmail);

        // 3. تحديث حالة الطلب
        order.status = 'completed';
        order.code = codeValue;
        order.completedAt = new Date();
        await order.save();

        // 4. إرسال الكود فوراً للإيميل
        await sendCodeByEmail(order.buyerEmail, order.productName, codeValue, order.orderId);

        // 5. سجل الحركة
        await new Log({ 
            action: 'إكمال طلب', 
            details: `تم تسليم كود للطلب ${order.orderId} بنجاح`, 
            ip: req.ip 
        }).save();

        res.json({ success: true, message: '✅ تم تسليم الكود وتحديث الطلب بنجاح' });
    } catch (err) {
        console.error('Complete Order Error:', err.message);
        res.status(500).json({ success: false, error: err.message || 'فشل في إكمال الطلب' });
    }
});

// ✅ مسار جديد لجلب سجل العمليات للأدمن فقط
app.get('/api/admin/logs', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 }).limit(50);
        res.json({ success: true, logs });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل في جلب السجلات' });
    }
});

// ====================================================
// 🌐 قسم زوار المتجر (العام)
// ====================================================
app.get('/api/products/:category', generalLimiter, async (req, res) => {
    try {
        let { category } = req.params;
        // تأمين إضافي للمدخلات
        category = String(category).substring(0, 50);

        let query = { isActive: true };

        if (category && category !== 'all' && category !== 'الكل') {
            query.$or = [{ category: category.toLowerCase() }, { "فئة": category.toLowerCase() }];
        }

        const products = await Product.find(query);
        const formattedProducts = products.map(p => {
            const catVal = p.category || p["فئة"] || "all";
            const regVal = p.region || p["منطقة"] || "عالمي";
            const nameVal = p.productName || p["اسم المنتج"] || "منتج بدون اسم";
            return {
                id:        p._id,
                name:      String(nameVal).trim(),  
                category:  String(catVal).trim().toLowerCase(),
                region:    String(regVal).trim().toLowerCase(),
                price:     Number(p.price || p["سعر"] || 0),
                available: p.codes ? p.codes.filter(c => c.status === 'available').length : 0
            };
        });
        res.json(formattedProducts);
    } catch (err) {
        res.status(500).json([]);
    }
});

app.get('/api/products', generalLimiter, async (req, res) => {
    try {
        const products = await Product.find({ isActive: true });
        const formattedProducts = products.map(p => {
            const catVal = p.category || p["فئة"] || "all";
            const regVal = p.region || p["منطقة"] || "عالمي";
            const nameVal = p.productName || p["اسم المنتج"] || "منتج بدون اسم";
            return {
                id:        p._id,
                name:      String(nameVal).trim(),  
                category:  String(catVal).trim().toLowerCase(),
                region:    String(regVal).trim().toLowerCase(),
                price:     Number(p.price || p["سعر"] || 0),
                available: p.codes ? p.codes.filter(c => c.status === 'available').length : 0
            };
        });
        res.json(formattedProducts);
    } catch (err) {
        res.status(500).json([]);
    }
});

// دالة أمنية سريعة لتشفيير وتطهير النصوص ومنع حقن الـ HTML
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

// ==========================================================
// 🚀 راوت استقبال الطلبات المحمي تماماً ضد الـ CRLF والـ HTML Injection
// ==========================================================
app.post('/api/checkout', checkoutLimiter, async (req, res) => {
    try {
        const { customerEmail, customerName, cartItems } = req.body;

        // 🛡️ 1. فحص المدخلات
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!customerEmail || !emailRegex.test(customerEmail) || customerEmail.includes('\r') || customerEmail.includes('\n')) {
            return res.status(400).json({ success: false, error: 'صيغة البريد الإلكتروني غير صالحة أو غير آمنة!' });
        }

        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({ success: false, error: 'بيانات الطلب غير مكتملة!' });
        }

        // 🛡️ 2. التحقق من توفر المنتجات والمخزون في قاعدة البيانات
        let itemsHtml = '';
        let calculatedTotal = 0;
        const verifiedItems = [];

        for (const item of cartItems) {
            const product = await Product.findOne({ _id: item.id, isActive: true });
            if (!product) continue;

            const availableCount = product.codes.filter(c => c.status === 'available').length;
            if (availableCount < (item.qty || 1)) {
                return res.status(400).json({ success: false, error: `نعتذر، الكمية المطلوبة من ${product.productName} غير متوفرة حالياً.` });
            }

            calculatedTotal += product.price * (item.qty || 1);
            verifiedItems.push({ 
                productId: product._id, 
                name: product.productName, 
                price: product.price, 
                qty: item.qty || 1 
            });
            
            itemsHtml += `
                <li style="padding: 10px 0; border-bottom: 1px solid rgba(0, 240, 255, 0.1); display: flex; justify-content: space-between; direction: rtl;">
                    <span>${escapeHTML(product.productName)} (x${item.qty || 1})</span>
                    <span style="color: #00f0ff; font-weight: bold;">${(product.price * (item.qty || 1)).toFixed(2)}$</span>
                </li>`;
        }

        if (verifiedItems.length === 0) {
            return res.status(400).json({ success: false, error: 'لم يتم العثور على أي منتجات صالحة في السلة.' });
        }

        const cleanCustomerName = escapeHTML(customerName || 'عزيزنا الزبون');
        const orderId = 'JKR-' + Math.floor(100000 + Math.random() * 900000);

        // 🛡️ 3. تسجيل الطلب في قاعدة البيانات
        await new Order({
            orderId: orderId,
            buyerEmail: customerEmail.trim(),
            productName: verifiedItems.map(i => i.name).join(', '),
            items: verifiedItems,
            price: calculatedTotal,
            status: 'pending',
            createdAt: new Date()
        }).save();

        // 🛡️ 4. إشعار تلجرام فوري للأدمن (مجاني)
        await notifyAdminTelegram(orderId, calculatedTotal.toFixed(2), cleanCustomerName);

        const mailOptions = {
            from: '"Joker Store 🃏" <onboarding@resend.dev>', 
            to: customerEmail.trim(), 
            subject: '📦 تأكيد استلام طلبك من متجر Joker Store',
            html: `
                <div style="font-family: sans-serif; direction: rtl; text-align: right; padding: 25px; border: 1px solid #00f0ff; border-radius: 12px; background-color: #0b0e14; color: #fff; max-width: 500px; margin: auto;">
                    <h2 style="color: #00f0ff; border-bottom: 2px solid #00f0ff; padding-bottom: 10px; margin-top: 0;">مرحباً ${cleanCustomerName} 👋</h2>
                    <p style="font-size: 1rem; color: #b9bbbe;">تم استلام طلبك بنجاح في نظامنا، وإليك تفاصيل فاتورتك الرقمية:</p>
                    
                    <ul style="list-style: none; padding: 0; margin: 20px 0;">
                        ${itemsHtml}
                    </ul>
                    
                    <div style="background: rgba(0, 240, 255, 0.05); padding: 15px; border-radius: 8px; text-align: center; border: 1px solid rgba(0, 240, 255, 0.2);">
                        <h3 style="margin: 0; color: #ff0055; font-size: 1.3rem;">المجموع الإجمالي: ${calculatedTotal.toFixed(2)}$</h3>
                    </div>
                    <p style="text-align:center; color:#ff9f43; font-weight:bold;">رقم طلبك: ${orderId}</p>
                    <p style="color: #666; font-size: 0.8rem; text-align: center; margin-top: 30px; margin-bottom: 0;">هذا الإيميل تلقائي وصادر عن نظام فحص متجر Joker Store.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'تم استلام الطلب وإرسال الفاتورة بأمان كامل! 🚀' });

    } catch (error) {
        console.error('❌ حدث خطأ أثناء إرسال الإيميل:', error);
        res.status(500).json({ success: false, error: 'فشل السيرفر في معالجة الإيميل بأمان.' });
    }
});


// ==========================================================
// 🔍 مسار تتبع الطلب للزبائن (عمومي)
// ==========================================================
app.get('/api/orders/track/:orderId', generalLimiter, async (req, res) => {
    try {
        const { orderId } = req.params;
        // البحث عن الطلب مع جلب بيانات محدودة فقط للأمان
        const order = await Order.findOne({ orderId: orderId.trim().toUpperCase() })
                                 .select('orderId status productName price createdAt');

        if (!order) {
            return res.status(404).json({ success: false, error: 'عذراً، لم يتم العثور على طلب بهذا الرقم.' });
        }

        res.json({ success: true, order });
    } catch (error) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء محاولة تتبع الطلب.' });
    }
});

// ====================================================
// 🚀 تشغيل السيرفر والربط الديناميكي مع بورت ريندر
// ====================================================
const FINAL_PORT = process.env.PORT || 5850;
app.listen(FINAL_PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر شغال ومثالي تماماً على بورت ${FINAL_PORT}`);
});