require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();

// 🔥 حرج جداً لـ Render: يخبر جدار الحماية بقراءة الـ IP الحقيقي للزائر وليس الـ Proxy
app.set('trust proxy', 1); 

const PORT = process.env.PORT || 5850;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ====================================================
// 🛡️ طبقة الأمان الأولى: Helmet (حماية HTTP Headers)
// ====================================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", 
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'",
                "https://www.paypal.com",
                "https://cdnjs.cloudflare.com"],
            frameSrc: ["https://www.paypal.com"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// ====================================================
// 🛡️ طبقة الأمان الثانية: Rate Limiting (منع الهجمات)
// ====================================================

// حد عام لكل الموقع
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 150, 
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'كثير طلبات من نفس الـ IP، انتظر شوي وحاول مجدداً' }
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'محاولات دخول كثيرة، انتظر 15 دقيقة' }
});

const purchaseLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, error: 'طلبات شراء كثيرة، انتظر شوي' }
});

app.use(generalLimiter);

// ====================================================
// الإعدادات وقاعدة البيانات
// ====================================================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ تم الاتصال بمونجو بنجاح!'))
    .catch((err) => console.log('⚠️ لم يتم الاتصال بمونجو:', err.message));

// 1. أولاً: السيرفر يقرأ ويحلل بيانات الـ JSON القادمة من المستخدم
app.use(express.json({ limit: '10kb' })); 

// 2. ثانياً 🔥 (الترتيب الصحيح): كود الحماية المخصص يشتغل فوراً بعد تحليل الـ JSON لتنظيف الـ req.body بنجاح
app.use((req, res, next) => {
    const sanitizeObject = (obj) => {
        if (obj && typeof obj === 'object') {
            for (const key in obj) {
                // إذا كان المفتاح يبدأ بـ $ أو يحتوي على نقطة (محاولة حقن NoSQL)، يتم حذفه فوراً
                if (key.startsWith('$') || key.includes('.')) {
                    delete obj[key];
                } else if (typeof obj[key] === 'object') {
                    sanitizeObject(obj[key]); // تنظيف الكائنات المتداخلة
                }
            }
        }
    };
    
    sanitizeObject(req.body);
    sanitizeObject(req.params);
    sanitizeObject(req.query); 
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ====================================================
// 🛡️ Middleware التحقق من هوية الأدمن
// ====================================================
function verifyAdmin(req, res, next) {
    if (!ADMIN_PASSWORD) {
        console.error('❌ خطأ: ADMIN_PASSWORD غير موجود في ملف .env!');
        return res.status(500).json({ success: false, error: 'السيرفر غير مهيأ بشكل صحيح' });
    }

    const token = req.headers['x-admin-token'];

    if (!token || token !== ADMIN_PASSWORD) {
        console.warn(`⚠️ محاولة دخول أدمن فاشلة من IP: ${req.ip} في ${new Date().toISOString()}`);
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالدخول' });
    }

    next();
}

// ====================================================
// هامش الربح وحساب الأسعار
// ====================================================
const PROFIT_PERCENTAGE = 0.08; // 8%
const FIXED_PROFIT = 0.50;      // نصف دولار ثابت

const mockSupplierData = {
    steam: [
        { id: "ST-10", name: "Steam Gift Card 10$ Global", costPrice: 9.20 },
        { id: "ST-20", name: "Steam Gift Card 20$ Global", costPrice: 18.40 },
        { id: "ST-50", name: "Steam Gift Card 50$ Global", costPrice: 46.00 }
    ],
    pubg: [
        { id: "PB-60",  name: "PUBG Mobile 60 UC",  costPrice: 0.80 },
        { id: "PB-325", name: "PUBG Mobile 325 UC", costPrice: 3.90 },
        { id: "PB-660", name: "PUBG Mobile 660 UC", costPrice: 7.75 }
    ],
    fortnite: [
        { id: "FT-1000", name: "Fortnite 1000 V-Bucks", costPrice: 7.90 },
        { id: "FT-2800", name: "Fortnite 2800 V-Bucks", costPrice: 19.90 }
    ],
    playstation: [
        { id: "PS-10", name: "PlayStation Store 10$ US", costPrice: 9.60 },
        { id: "PS-20", name: "PlayStation Store 20$ US", costPrice: 19.30 }
    ]
};

function calculateSellingPrice(costPrice) {
    let finalPrice = costPrice + (costPrice * PROFIT_PERCENTAGE) + FIXED_PROFIT;
    return parseFloat(finalPrice.toFixed(2));
}

// ====================================================
// API Routes - العامة
// ====================================================

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// جلب المنتجات حسب القسم
app.get('/api/products/:category', (req, res) => {
    // تنظيف المدخل من أي رموز خطرة
    const category = req.params.category.toLowerCase().replace(/[^a-z_]/g, '');

    if (!mockSupplierData[category]) {
        return res.json([]);
    }

    const clientProducts = mockSupplierData[category].map(product => ({
        id: product.id,
        name: product.name,
        price: calculateSellingPrice(product.costPrice)
    }));

    res.json(clientProducts);
});

// ====================================================
// API Routes - الأدمن (محمية)
// ====================================================

// صفحة الأدمن — محمية ومنقولة خارج public
app.get('/admin', adminLimiter, verifyAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

// إضافة أكواد جديدة
app.post('/api/admin/add-codes', adminLimiter, verifyAdmin, (req, res) => {
    const { productName, codes, category, region } = req.body;

    // ======= Validation =======
    if (!productName || typeof productName !== 'string' || productName.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'اسم المنتج مطلوب' });
    }
    if (productName.length > 100) {
        return res.status(400).json({ success: false, message: 'اسم المنتج طويل جداً (أكثر من 100 حرف)' });
    }
    if (!Array.isArray(codes) || codes.length === 0) {
        return res.status(400).json({ success: false, message: 'لازم ترسل كود واحد على الأقل' });
    }
    if (codes.length > 500) {
        return res.status(400).json({ success: false, message: 'عدد الأكواد كثير جداً (الحد الأقصى 500)' });
    }

    const validCategories = [
        'gaming_general', 'pubg', 'fortnite', 'playstation', 'xbox',
        'microsoft_windows', 'adobe', 'antivirus', 'vpn', 'google',
        'itunes', 'razer_gold', 'amazon'
    ];
    if (!validCategories.includes(category)) {
        return res.status(400).json({ success: false, message: 'القسم المختار غير صحيح' });
    }

    const validRegions = ['global', 'us', 'tr', 'eu', 'sa'];
    if (!validRegions.includes(region)) {
        return res.status(400).json({ success: false, message: 'الريجن غير صحيح' });
    }

    // تنظيف الأكواد من أي مسافات زيادة
    const cleanCodes = codes
        .map(c => String(c).trim())
        .filter(c => c.length > 0 && c.length <= 200); // كود أقصاه 200 حرف

    if (cleanCodes.length === 0) {
        return res.status(400).json({ success: false, message: 'الأكواد المرسلة فاضية بعد التنظيف' });
    }

    // ======= هنا يجي كود الحفظ في قاعدة البيانات لاحقاً =======
    // مؤقتاً: تأكيد النجاح
    console.log(`✅ أدمن أضاف ${cleanCodes.length} كود للمنتج: "${productName}" | القسم: ${category} | الريجن: ${region}`);

    res.json({
        success: true,
        message: `✅ تم استلام ${cleanCodes.length} كود بنجاح للمنتج "${productName}"`
    });
});

// ====================================================
// 🛡️ معالجة الأخطاء العامة (آخر شي دايماً)
// ====================================================

// منع ظهور مسارات غير موجودة
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'الصفحة غير موجودة' });
});

// معالج أخطاء السيرفر
app.use((err, req, res, next) => {
    console.error('❌ خطأ في السيرفر:', err.message);
    // لا ترسل تفاصيل الخطأ للزبون في البيئة الحقيقية
    res.status(500).json({ success: false, error: 'خطأ داخلي في السيرفر' });
});

// ====================================================
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على بورت ${PORT}`);
    if (!ADMIN_PASSWORD) {
        console.warn('⚠️ تحذير: ADMIN_PASSWORD غير موجود في .env — لوحة الأدمن غير محمية!');
    }
});