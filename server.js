require('dotenv').config();
const crypto = require('crypto');
const express    = require('express');
const mongoose   = require('mongoose');
const path       = require('path');
const rateLimit  = require('express-rate-limit');
const helmet     = require('helmet');
const { Product, Order } = require('./models');

const app  = express();
app.set('trust proxy', 1);

const PORT           = process.env.PORT || 5850;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWROD;

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
    windowMs: 15 * 60 * 1000, max: 20, // زدنا المحاولات قليلاً لتسهيل الإدارة
    message: { success: false, error: 'محاولات كثيرة، انتظر 15 دقيقة' }
});

app.use(generalLimiter);

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

// 🛡️ التحقق من الأدمن بدون كراشات وبأعلى حماية
function verifyAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
    }

    const tokenData = activeTokens.get(token);
    
    if (!tokenData || tokenData.expiresAt < Date.now()) {
        activeTokens.delete(token);
        return res.status(401).json({ success: false, error: 'انتهت الجلسة، ادخل من جديد' });
    }

    next();
}

// ====================================================
// Routes — الأدمن (عرض الصفحات - حرة بدون حماية سطر الدالة)
// ====================================================
app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', adminLimiter, (req, res) => {
    const token = req.headers['x-admin-token'] || req.query.token;

    if (!token) {
        return res.redirect('/admin-login');
    }

    const tokenData = activeTokens.get(token);
    if (!tokenData || tokenData.expiresAt < Date.now()) {
        activeTokens.delete(token);
        return res.redirect('/admin-login');
    }

    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
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
// Routes — الـ API للأدمن (محمية بـ verifyAdmin بشكل صارم)
// ====================================================

// ====================================================
// Routes — الـ API للأدمن (محمية بـ verifyAdmin بشكل صارم)
// ====================================================

app.post('/api/admin/login', adminLimiter, (req, res) => {
    try {
        const { password } = req.body;
        const securePass = process.env.ADMIN_PASSWORD;

        if (!securePass) {
            return res.status(500).json({ success: false, error: 'السيرفر غير مهيأ' });
        }

        if (!password || String(password) !== String(securePass)) {
            return res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة' });
        }

        // ولّد token عشوائي مؤقت — مش كلمة السر الأصلية ✅
        const sessionToken = crypto.randomBytes(32).toString('hex');
        
        // احفظه في الذاكرة مع وقت انتهاء 8 ساعات
        activeTokens.set(sessionToken, {
            createdAt: Date.now(),
            expiresAt: Date.now() + (8 * 60 * 60 * 1000)
        });

        return res.json({ success: true, token: sessionToken });

    } catch (err) {
        return res.status(500).json({ success: false, error: 'خطأ داخلي' });
    }
});

// 2. راوت جلب المخزون والجدول
app.get('/api/admin/inventory', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const products = await Product.find({ isActive: true })
            .select('productName category region price codes updatedAt فئة اسم المنتج سعر منطقة');

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

// 3. راوت تعديل بيانات منتج معين
app.put('/api/admin/products/:id', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const { productName, price, region, category } = req.body;
        
        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            { 
                productName: productName.trim(), 
                price: parseFloat(price), 
                region, 
                category,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!updatedProduct) return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
        res.json({ success: true, message: '✅ تم تحديث بيانات البطاقة بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل في تحديث المنتج' });
    }
});

// 4. راوت حذف منتج بالكامل (Soft Delete)
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
// 🌐 1. راوت جلب المنتجات العام لزوار المتجر (لمنع فشل التحميل)
// ====================================================
app.get('/api/products', adminLimiter, async (req, res) => {
    try {
        const products = await Product.find({ isActive: true });
        
        const formattedProducts = products.map(p => ({
            id:             p._id,
            productName:    p.productName || p["اسم المنتج"],
            category:       p.category || p["فئة"],
            region:         p.region || p["منطقة"],
            price:          p.price || p["سعر"],
            available:      p.codes ? p.codes.filter(c => c.status === 'available').length : 0
        }));

        res.json({ success: true, products: formattedProducts });
    } catch (err) {
        console.error('Public Products Error:', err);
        res.status(500).json({ success: false, error: 'فشل في تحميل المنتجات' });
    }
});

app.post('/api/admin/add-codes', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const { productName, price, region, category, codes } = req.body;

        // Validation
        if (!productName || !price || !region || !category) {
            return res.status(400).json({ success: false, message: '❌ يرجى ملء جميع الحقول' });
        }
        if (!Array.isArray(codes) || codes.length === 0) {
            return res.status(400).json({ success: false, message: '❌ لازم كود واحد على الأقل' });
        }
        if (codes.length > 500) {
            return res.status(400).json({ success: false, message: '❌ الحد الأقصى 500 كود' });
        }

        // تنظيف الأكواد
        const cleanCodes = codes
            .map(c => String(c).trim())
            .filter(c => c.length > 0 && c.length <= 200)
            .map(value => ({ value, status: 'available' }));

        if (cleanCodes.length === 0) {
            return res.status(400).json({ success: false, message: '❌ الأكواد فاضية بعد التنظيف' });
        }

        // ابحث عن منتج موجود
        let product = await Product.findOne({
            productName: productName.trim(),
            category: category.toLowerCase(),
            region: region.toLowerCase()
        });

        if (product) {
            product.codes.push(...cleanCodes);
            product.updatedAt = new Date();
            await product.save();
        } else {
            product = await Product.create({
                productName: productName.trim(),
                category:    category.toLowerCase(),
                region:      region.toLowerCase(),
                price:       parseFloat(price),
                codes:       cleanCodes,
                isActive:    true
            });
        }

        return res.json({
            success: true,
            message: `✅ تم إضافة ${cleanCodes.length} كود للمنتج "${productName}"`,
            totalStock: product.codes.filter(c => c.status === 'available').length
        });

    } catch (err) {
        console.error('Failed to add codes:', err);
        res.status(500).json({ success: false, error: 'فشل في إضافة الأكواد' });
    }
});

// ====================================================
// 🚀 4. تشغيل السيرفر والربط الديناميكي مع بورت ريندر
// ====================================================
const FINAL_PORT = process.env.PORT || 5850;
app.listen(FINAL_PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر شغال ومثالي تماماً على بورت ${FINAL_PORT}`);
});