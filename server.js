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

// راوت تسجيل الدخول الآمن والمضمون
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
        return res.status(500).json({ success: false, error: 'خطأ داخلي في معالجة الطلب' });
    }
});

// ====================================================
// Routes — العامة
// ====================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/products/:category', async (req, res) => {
    try {
        let categoryParam = req.params.category.toLowerCase().replace(/[^a-z_]/g, '');
        let dbCategory = categoryParam;
        if (categoryParam === 'pubg') dbCategory = 'ببجي';
        if (categoryParam === 'fortnite') dbCategory = 'فورتنايت';
        if (categoryParam === 'playstation') dbCategory = 'بلايستيشن';

        const products = await Product.find({
            $or: [
                { category: categoryParam },
                { "فئة": dbCategory }
            ],
            isActive: true
        });

        const result = products.map(p => {
            const name = p.productName || p["اسم المنتج"] || "بطاقة شحن";
            const price = p.price || p["سعر"] || 0;
            const region = p.region || p["منطقة"] || "global";
            
            let stock = 0; 
            if (p.codes && Array.isArray(p.codes)) {
                stock = p.codes.filter(c => c.status === 'available').length;
            } else if (p["اسم المنتج"]) {
                stock = 5; // مخزون افتراضي للبيانات القديمة المباشرة بـ أطلس
            }

            return {
                id: p._id,
                name: name,
                price: price,
                region: region,
                stock: stock
            };
        }).filter(p => p.stock > 0);

        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
    }
});

// ====================================================
// Routes — الأدمن (الأساسية وتسجيل الدخول)
// ====================================================
app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', adminLimiter, verifyAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

app.post('/api/admin/login', adminLimiter, (req, res) => {
    const { password } = req.body;
    if (password && password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: ADMIN_PASSWORD });
    }
    res.status(401).json({ success: false, error: 'الباسورد خاطئ!' });
});

app.post('/api/admin/add-codes', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const { productName, codes, category, region, price } = req.body;

        if (!productName || typeof productName !== 'string' || productName.trim().length === 0)
            return res.status(400).json({ success: false, message: 'اسم المنتج مطلوب' });
        if (!Array.isArray(codes) || codes.length === 0)
            return res.status(400).json({ success: false, message: 'لازم كود واحد على الأقل' });
        if (!price || isNaN(price) || price <= 0)
            return res.status(400).json({ success: false, message: 'السعر مطلوب' });

        const cleanCodes = codes
            .map(c => String(c).trim())
            .filter(c => c.length > 0)
            .map(value => ({ value, status: 'available' }));

        let product = await Product.findOne({ 
            productName: productName.trim(), 
            category, 
            region 
        });

        if (product) {
            product.codes.push(...cleanCodes);
            product.updatedAt = new Date();
            await product.save();
        } else {
            product = await Product.create({
                productName: productName.trim(),
                category,
                region,
                price: parseFloat(price),
                codes: cleanCodes
            });
        }

        res.json({
            success: true,
            message: `✅ تم إضافة الأكواد للمنتج بنجاح`,
            totalStock: product.codes.filter(c => c.status === 'available').length
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'خطأ داخلي بالسيرفر' });
    }
});

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
// معالجة الأخطاء والتشغيل
// ====================================================
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'الصفحة غير موجودة' });
});

app.use((err, req, res, next) => {
    console.error('❌ خطأ:', err.message);
    res.status(500).json({ success: false, error: 'خطأ داخلي في السيرفر' });
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر على بورت ${PORT}`);
});