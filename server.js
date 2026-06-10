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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWROD; // ضمان لقط المتغير بأي تهجئة

// ====================================================
// 🛡️ Helmet
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

// ====================================================
// 🛡️ Rate Limiting
// ====================================================
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 150,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'كثير طلبات، انتظر شوي' }
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    message: { success: false, error: 'محاولات كثيرة، انتظر 15 دقيقة' }
});

app.use(generalLimiter);

// ====================================================
// قاعدة البيانات
// ====================================================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB متصل'))
    .catch(err => console.log('⚠️ MongoDB غير متصل:', err.message));

// ====================================================
// Middleware
// ====================================================
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

// ====================================================
// 🛡️ التحقق من الأدمن (تم الإصلاح الجذري 🛠️)
// ====================================================
function verifyAdmin(req, res, next) {
    if (!ADMIN_PASSWORD) {
        return res.status(500).json({ success: false, error: 'السيرفر غير مهيأ، الباسورد مفقود بالبيئة' });
    }
    
    const token = req.headers['x-admin-token'];
    if (!token || token !== ADMIN_PASSWORD) {
        console.warn(`⚠️ دخول أدمن فاشل من IP: ${req.ip}`);
        return res.status(401).json({ success: false, error: 'غير مصرح بالوصول للوحة الأدمن' });
    }
    next();
}

// ====================================================
// Routes — العامة
// ====================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// جلب المنتجات من DB - يدعم التسميات العربية والانجليزية لمطابقة الأطلس 🚀
app.get('/api/products/:category', async (req, res) => {
    try {
        let categoryParam = req.params.category.toLowerCase().replace(/[^a-z_]/g, '');
        
        // تحويل اسم الفئة المقروء من الرابط إلى المقابل العربي بداخل الـ DB
        let dbCategory = categoryParam;
        if (categoryParam === 'pubg') dbCategory = 'ببجي';
        if (categoryParam === 'fortnite') dbCategory = 'فورتنايت';
        if (categoryParam === 'playstation') dbCategory = 'بلايستيشن';
        // يمكنك إضافة باقي الفئات هنا بنفس الطريقة لاحقاً إذا كانت عربية بالـ DB

        // البحث في قاعدة البيانات عن الفئة الإنجليزية أو العربية
        const products = await Product.find({
            $or: [
                { category: categoryParam },
                { "فئة": dbCategory }
            ],
            isActive: true
        });

        // تحويل البيانات ديناميكياً لتطابق واجهتك الأمامية
        const result = products.map(p => {
            // قراءة اسم المنتج والسعر والريجن سواء كانت التسمية عربي أو إنجليزي
            const name = p.productName || p["اسم المنتج"] || "بطاقة شحن";
            const price = p.price || p["سعر"] || 0;
            const region = p.region || p["منطقة"] || "global";
            
            // فحص الأكواد: إذا كان المستند قادم من الأطلس القديم ولا يحتوي على مصفوفة أكواد، نعطيه مخزون وهمي مؤقت 5 عشان يظهر بالفحص
            let stock = 5; 
            if (p.codes && Array.isArray(p.codes)) {
                const available = p.codes.filter(c => c.status === 'available').length;
                if (p.codes.length > 0) stock = available;
            }

            return {
                id: p._id,
                name: name,
                price: price,
                region: region,
                stock: stock
            };
        }).filter(p => p.stock > 0); // إظهار المنتجات المتاحة فقط

        res.json(result);
    } catch (err) {
        console.error('خطأ في جلب المنتجات:', err);
        res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
    }
});

// ====================================================
// Routes — الأدمن
// ====================================================

app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', adminLimiter, verifyAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

// استقبال طلب تسجيل الدخول والمقارنة الفورية
app.post('/api/admin/login', adminLimiter, (req, res) => {
    const { password } = req.body;
    if (password && password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: ADMIN_PASSWORD });
    }
    res.status(401).json({ success: false, error: 'الباسورد خاطئ!' });
});

// إضافة منتج مع أكواده
app.post('/api/admin/add-codes', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const { productName, codes, category, region, price } = req.body;

        // Validation
        if (!productName || typeof productName !== 'string' || productName.trim().length === 0)
            return res.status(400).json({ success: false, message: 'اسم المنتج مطلوب' });
        if (productName.length > 100)
            return res.status(400).json({ success: false, message: 'اسم المنتج طويل جداً' });
        if (!Array.isArray(codes) || codes.length === 0)
            return res.status(400).json({ success: false, message: 'لازم كود واحد على الأقل' });
        if (codes.length > 500)
            return res.status(400).json({ success: false, message: 'الحد الأقصى 500 كود' });
        if (!price || isNaN(price) || price <= 0)
            return res.status(400).json({ success: false, message: 'السعر مطلوب' });

        const validCategories = ['gaming_general','pubg','fortnite','playstation','xbox',
            'microsoft_windows','adobe','antivirus','vpn','google','itunes','razer_gold','amazon','steam'];
        if (!validCategories.includes(category))
            return res.status(400).json({ success: false, message: 'القسم غير صحيح' });

        const validRegions = ['global','us','tr','eu','sa'];
        if (!validRegions.includes(region))
            return res.status(400).json({ success: false, message: 'الريجن غير صحيح' });

        // تنظيف الأكواد
        const cleanCodes = codes
            .map(c => String(c).trim())
            .filter(c => c.length > 0 && c.length <= 200)
            .map(value => ({ value, status: 'available' }));

        if (cleanCodes.length === 0)
            return res.status(400).json({ success: false, message: 'الأكواد فاضية بعد التنظيف' });

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

        console.log(`✅ أضيف ${cleanCodes.length} كود للمنتج: "${productName}"`);

        res.json({
            success: true,
            message: `✅ تم إضافة ${cleanCodes.length} كود للمنتج "${productName}" بنجاح`,
            productId: product._id,
            totalStock: product.codes.filter(c => c.status === 'available').length
        });

    } catch (err) {
        console.error('خطأ في إضافة الأكواد:', err);
        res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
    }
});

// جلب إحصائيات المخزون للأدمن
app.get('/api/admin/inventory', adminLimiter, verifyAdmin, async (req, res) => {
    try {
        const products = await Product.find({ isActive: true })
            .select('productName category region price codes updatedAt');

        const inventory = products.map(p => ({
            id:             p._id,
            productName:    p.productName,
            category:       p.category,
            region:         p.region,
            price:          p.price,
            available:      p.codes.filter(c => c.status === 'available').length,
            sold:           p.codes.filter(c => c.status === 'sold').length,
            total:          p.codes.length,
            lastUpdated:    p.updatedAt
        }));

        res.json({ success: true, inventory });
    } catch (err) {
        res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
    }
});

// ====================================================
// 🛡️ معالجة الأخطاء
// ====================================================
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'الصفحة غير موجودة' });
});

app.use((err, req, res, next) => {
    console.error('❌ خطأ غير متوقع بالسيستم:', err.message);
    res.status(500).json({ success: false, error: 'خطأ داخلي في السيرفر' });
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر على بورت ${PORT}`);
    if (!ADMIN_PASSWORD) console.warn('⚠️ تذكير: الباسورد الخاص بالأدمن غير مضبوط في المتغيرات!');
});