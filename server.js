require('dotenv').config();
const crypto = require('crypto');
const express    = require('express');
const mongoose   = require('mongoose');
const path       = require('path');
const rateLimit  = require('express-rate-limit');
const helmet     = require('helmet');
const nodemailer = require('nodemailer');
const axios      = require('axios');

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

const { Product, Order } = require('./models');
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
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB متصل'))
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
// 🔒 مسارات صفحات الأدمن (Admin UI Routes)
// ==========================================================
app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html')); 
});

app.get('/admin.html', (req, res) => {
    const token = req.query.token;
    if (!token || !activeTokens.has(token)) {
        return res.status(403).send('<h1>عذراً، انتهت صلاحية الجلسة أو غير مصرح لك بالدخول! يرجى تسجيل الدخول مجدداً من صفحة admin-login.</h1>');
    }
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

function verifyAdmin(req, res, next) {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (!token) return res.status(401).json({ success: false, error: 'غير مصرح' });

    const tokenData = activeTokens.get(token);
    if (!tokenData || tokenData.expiresAt < Date.now()) {
        activeTokens.delete(token);
        return res.status(401).json({ success: false, error: 'انتهت الجلسة، سجل دخول مجدداً' });
    }
    next();
}

app.get('/admin', (req, res) => {
    const token = req.query.token;
    if (!token) return res.redirect('/admin-login.html');

    const tokenData = activeTokens.get(token);
    if (!tokenData || tokenData.expiresAt < Date.now()) {
        if (tokenData) activeTokens.delete(token);
        return res.redirect('/admin-login.html');
    }
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

// ====================================================
// 🛡️ الـ API للأدمن
// ====================================================
app.post('/api/admin/login', adminLimiter, (req, res) => {
    try {
        const { password } = req.body;
        const securePass = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : null;

        if (!securePass) return res.status(500).json({ success: false, error: 'السيرفر غير مهيأ في الـ .env' });
        if (!password || password.trim() !== securePass) return res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة' });

        const sessionToken = crypto.randomBytes(32).toString('hex');
        activeTokens.set(sessionToken, {
            createdAt: Date.now(),
            expiresAt: Date.now() + (8 * 60 * 60 * 1000)
        });

        return res.json({ success: true, token: sessionToken });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'خطأ داخلي بالسيرفر' });
    }
});

app.get('/api/admin/inventory', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const products = await Product.find({ isActive: true }).select('productName category region price codes updatedAt فئة اسم المنتج سعر منطقة');
        const inventory = products.map(p => ({
            id:             p._id,
            productName:    p.productName || p["اسم المنتج"],
            category:       p.category || p["فئة"],
            region:         p.region || p["منطقة"],
            price:          p.price || p["سعر"],
            available:      p.codes ? p.codes.filter(c => c.status === 'available').length : 0,
            total:          p.codes ? p.codes.length : 0,
            lastUpdated:    p.updatedAt || new Date()
        }));
        res.json({ success: true, inventory });
    } catch (err) {
        res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
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
        res.json({ success: true, message: '🗑️ تم حذف المنتج بنجاح من العرض' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل في حذف المنتج' });
    }
});

// ====================================================
// 🌐 قسم زوار المتجر (العام)
// ====================================================
app.get('/api/products/:category', adminLimiter, async (req, res) => {
    try {
        const { category } = req.params;
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

app.get('/api/products', adminLimiter, async (req, res) => {
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

// ==========================================================
// 🚀 راوت استقبال الطلبات وإرسال الفاتورة عبر Resend
// ==========================================================
app.post('/api/checkout', async (req, res) => {
    try {
        // قراءة البيانات القادمة من بوستمان أو الموقع
        const { customerEmail, customerName, cartItems, totalAmount } = req.body;

        if (!customerEmail || !cartItems || !Array.isArray(cartItems)) {
            return res.status(400).json({ success: false, error: 'بيانات الطلب غير مكتملة أو غير صحيحة!' });
        }

        // بناء قائمة المشتريات بشكل منظم للبريد الإلكتروني
        let itemsHtml = '';
        cartItems.forEach(item => {
            itemsHtml += `
                <li style="padding: 10px 0; border-bottom: 1px solid rgba(0, 240, 255, 0.1); display: flex; justify-content: space-between; direction: rtl;">
                    <span>${item.name} (x${item.qty})</span>
                    <span style="color: #00f0ff; font-weight: bold; margin-right: 10px;">${Number(item.price * item.qty).toFixed(2)}$</span>
                </li>`;
        });

        const mailOptions = {
            from: '"Joker Store 🃏" <onboarding@resend.dev>', 
            to: customerEmail, 
            subject: '📦 تأكيد استلام طلبك من متجر Joker Store',
            html: `
                <div style="font-family: sans-serif; direction: rtl; text-align: right; padding: 25px; border: 1px solid #00f0ff; border-radius: 12px; background-color: #0b0e14; color: #fff; max-width: 500px; margin: auto;">
                    <h2 style="color: #00f0ff; border-bottom: 2px solid #00f0ff; padding-bottom: 10px; margin-top: 0;">مرحباً ${customerName || 'عزيزنا الزبون'} 👋</h2>
                    <p style="font-size: 1rem; color: #b9bbbe;">تم استلام طلبك بنجاح في نظامنا، وإليك تفاصيل فاتورتك الرقمية:</p>
                    
                    <ul style="list-style: none; padding: 0; margin: 20px 0;">
                        ${itemsHtml}
                    </ul>
                    
                    <div style="background: rgba(0, 240, 255, 0.05); padding: 15px; border-radius: 8px; text-align: center; border: 1px solid rgba(0, 240, 255, 0.2);">
                        <h3 style="margin: 0; color: #ff0055; font-size: 1.3rem;">المجموع الإجمالي: ${totalAmount}$</h3>
                    </div>
                    
                    <p style="color: #666; font-size: 0.8rem; text-align: center; margin-top: 30px; margin-bottom: 0;">هذا الإيميل تلقائي وصادر عن نظام فحص متجر Joker Store.</p>
                </div>
            `
        };

        // إرسال الفاتورة عبر الناقل الأصلي المربوط بـ Resend فوق
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'تم استلام الطلب وإرسال الفاتورة للهوتميل بنجاح! 🚀' });

    } catch (error) {
        console.error('❌ حدث خطأ أثناء إرسال الإيميل:', error);
        res.status(500).json({ success: false, error: 'فشل السيرفر في إرسال الإيميل، تأكد من مفتاح RESEND_API_KEY' });
    }
});

// ====================================================
// 🚀 تشغيل السيرفر والربط الديناميكي مع بورت ريندر
// ====================================================
const FINAL_PORT = process.env.PORT || 5850;
app.listen(FINAL_PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر شغال ومثالي تماماً على بورت ${FINAL_PORT}`);
});