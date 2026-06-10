require('dotenv').config();
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
    const securePass = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWROD;
    
    if (!token || !securePass || token !== securePass) {
        return res.status(401).json({ success: false, error: 'غير مصرح بالوصول للوحة الأدمن' });
    }
    next();
}

// ====================================================
// Routes — الأدمن (عرض الصفحات - حرة بدون حماية سطر الدالة)
// ====================================================
app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// هذا الرابط يعرض الصفحة فقط! الحماية بتصير جوة الصفحة بالـ JS لما يطلب البيانات
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

// ====================================================
// Routes — الـ API للأدمن (محمية بـ verifyAdmin بشكل صارم)
// ====================================================

// 1. راوت تسجيل الدخول
app.post('/api/admin/login', adminLimiter, (req, res) => {
    try {
        const { password } = req.body;
        const securePass = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWROD;

        if (!securePass) {
            return res.status(500).json({ success: false, error: 'خطأ: كلمة مرور الأدمن غير معرفة بالسيرفر' });
        }

        if (password && String(password) === String(securePass)) {
            return res.json({ success: true, token: securePass });
        }
        
        return res.status(401).json({ success: false, error: 'الباسورد خاطئ!' });
    } catch (err) {
        console.error('Login Route Error:', err);
        return res.status(500).json({ success: false, error: 'خطأ داخلي في السيرفر' });
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
            available:      p.codes ? p.codes.filter(c => c.status === 'available').length : 5,
            total:          p.codes ? p.codes.length : 5,
            lastUpdated:    p.updatedAt || new Date()
        }));

        res.json({ success: true, inventory });
    } catch (err) {
        res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
    }
});

// 3. راوت تعديل منتج
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

// 4. راوت حذف منتج
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
// ✨ الإضافات الجديدة: نظام ميزات الـ CRUD للأدمن ✨
// ====================================================

// 1. راوت تعديل بيانات منتج معين (سعر، اسم، ريجن)
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

// 2. راوت حذف منتج بالكامل من الواجهة (Soft Delete لسلامة البيانات القديمة)
app.delete('/api/admin/products/:id', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
        
        // تحويله لـ غير نشط لكي يختفي فوراً من الموقع والأدمن
        product.isActive = false;
        await product.save();

        res.json({ success: true, message: '🗑️ تم حذف المنتج بنجاح من العرض' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل في حذف المنتج' });
    }
});

// ====================================================
// ➕ الراوت المطور: نظام إضافة الكروت والمخزون للأدمن (يدعم الموديل القديم والجديد)
// ====================================================
app.post('/api/admin/add-codes', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const { productName, price, region, category, codes } = req.body;

        if (!productName || !price || !region || !category || !codes || !Array.isArray(codes)) {
            return res.status(400).json({ success: false, message: '❌ يرجى ملء جميع الحقول بشكل صحيح' });
        }

        // تحويل مصفوفة الأكواد النصية إلى الصيغة المطلوبة داخل الـ Schema
        const codesObjects = codes.map(code => ({
            code: code.trim(),
            status: 'available'
        }));

        // بناء المستند ليطابق الحقول العربية القديمة والحقول الإنجليزية الجديدة لضمان الحفظ بدون كراش
        const productData = {
            // الحقول بالإنجليزية
            productName: productName.trim(),
            category: category.toLowerCase(),
            region: region.toLowerCase(),
            price: parseFloat(price),
            codes: codesObjects,
            isActive: true,
            updatedAt: new Date(),

            // الحقول بالعربية (دعم للموديل القديم والصفحة الرئيسية للمتجر)
            "اسم المنتج": productName.trim(),
            "فئة": category.toLowerCase(),
            "منطقة": region.toLowerCase(),
            "سعر": parseFloat(price)
        };

        const product = new Product(productData);
        await product.save();

        res.json({ success: true, message: '✅ تم حفظ الكرت والأكواد بنجاح في المخزن!' });
    } catch (err) {
        console.error('❌ خطأ تفصيلي أثناء حفظ الكرت بالداتابيز:', err);
        res.status(500).json({ success: false, message: '❌ فشل في حفظ البيانات بالسيرفر - تحقق من حقول الـ Schema' });
    }
});