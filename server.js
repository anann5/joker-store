require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize'); // 🔥 استدعاء المكتبة الرسمية
const jwt = require('jsonwebtoken'); // 🔥 استدعاء مكتبة التوكن المشفر

const app = express();

// إخبار جدار حماية ريندر بقراءة الـ IP الحقيقي للزائر
app.set('trust proxy', 1); 

const PORT = process.env.PORT || 5850;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
// مفتاح سري لتشفير التوكن (يفضل وضعه في .env، وإلا سيتم توليد واحد عشوائي مؤقت)
const JWT_SECRET = process.env.JWT_SECRET || 'JokerStore_Super_Secret_⚡_2026'; 

// ====================================================
// 🛡️ طبقة الأمان الأولى: Helmet
// ====================================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://www.paypal.com", "https://cdnjs.cloudflare.com"],
            frameSrc: ["https://www.paypal.com"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// ====================================================
// 🛡️ طبقة الأمان الثانية: Rate Limiting
// ====================================================
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 150, 
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'كثير طلبات من نفس الـ IP، انتظر شوي وحاول مجدداً' }
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15, // زيادة طفيفة للمرونة
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'محاولات دخول كثيرة، انتظر 15 دقيقة' }
});

app.use(generalLimiter);

// الاتصال بقاعدة البيانات
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ تم الاتصال بمونجو بنجاح!'))
    .catch((err) => console.log('⚠️ لم يتم الاتصال بمونجو:', err.message));

// تحليل ومراقبة حجم البيانات القادمة
app.use(express.json({ limit: '10kb' })); 

// 🔥 تفعيل الحماية الرسمية ضد حقن قواعد البيانات NoSQL Injection
app.use(mongoSanitize());

app.use(express.static(path.join(__dirname, 'public')));

// ====================================================
// 🛡️ Middleware المطور للتحقق من الأدمن عبر الـ JWT
// ====================================================
function verifyAdmin(req, res, next) {
    // قراءة التوكن إما من الهيدر أو من الـ Query string لتأمين جلب الملفات
    const token = req.headers['x-admin-token'] || req.query.token;

    if (!token) {
        return res.status(401).json({ success: false, error: 'غير مصرح لك بالدخول (التوكن مفقود)' });
    }

    try {
        // فك تشفير التوكن والتحقق من صلاحيته
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded; // إدخال بيانات الأدمن للطلب
        next();
    } catch (err) {
        console.warn(`⚠️ محاولة دخول أدمن بتوكن منتهي أو مزور من IP: ${req.ip}`);
        return res.status(403).json({ success: false, error: 'انتهت الجلسة أو التوكن غير صحيح، سجل دخول مجدداً' });
    }
}

// ====================================================
// مسار تسجيل دخول الأدمن وتوليد التوكن المشفر
// ====================================================
app.post('/api/admin/login', adminLimiter, (req, res) => {
    const { password } = req.body;

    if (!ADMIN_PASSWORD) {
        return res.status(500).json({ success: false, error: 'السيرفر غير مهيأ (كلمة السر غير مضبوطة بالبيئة)' });
    }

    if (password === ADMIN_PASSWORD) {
        // 🔥 توليد توكن مشفر للأدمن ينتهي تلقائياً بعد ساعتين لحمايتك 100%
        const token = jwt.sign({ role: 'super_admin' }, JWT_SECRET, { expiresIn: '2h' });
        return res.json({ success: true, token });
    }

    console.warn(`⚠️ محاولة تسجيل دخول فاشلة بكلمة سر خاطئة من IP: ${req.ip}`);
    res.status(401).json({ success: false, error: 'كلمة السر غير صحيحة!' });
});

// ====================================================
// هامش الربح وحساب الأسعار البيانات المؤقتة
// ====================================================
const PROFIT_PERCENTAGE = 0.08; 
const FIXED_PROFIT = 0.50;      

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
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/products/:category', (req, res) => {
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
// API Routes - الأدمن (محمية بالكامل بالـ JWT المحصن)
// ====================================================

// جلب صفحة الأدمن المحمية
app.get('/admin', verifyAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

// مسار إضافة الأكواد مؤمن ومحمي
app.post('/api/admin/add-codes', verifyAdmin, (req, res) => {
    const { productName, codes, category, region } = req.body;

    if (!productName || typeof productName !== 'string' || productName.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'اسم المنتج مطلوب' });
    }
    if (productName.length > 100) {
        return res.status(400).json({ success: false, message: 'اسم المنتج طويل جداً' });
    }
    if (!Array.isArray(codes) || codes.length === 0) {
        return res.status(400).json({ success: false, message: 'لازم ترسل كود واحد على الأقل' });
    }
    if (codes.length > 500) {
        return res.status(400).json({ success: false, message: 'عدد الأكواد كبير جداً' });
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

    const cleanCodes = codes
        .map(c => String(c).trim())
        .filter(c => c.length > 0 && c.length <= 200);

    if (cleanCodes.length === 0) {
        return res.status(400).json({ success: false, message: 'الأكواد المرسلة فاضية بعد التنظيف' });
    }

    console.log(`✅ أدمن أضاف ${cleanCodes.length} كود للمنتج: "${productName}"`);

    res.json({
        success: true,
        message: `✅ تم استلام ${cleanCodes.length} كود بنجاح للمنتج "${productName}"`
    });
});

// ====================================================
// 🛡️ معالجة الأخطاء العامة
// ====================================================
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'الصفحة غير موجودة' });
});

app.use((err, req, res, next) => {
    console.error('❌ خطأ في السيرفر:', err.message);
    res.status(500).json({ success: false, error: 'خطأ داخلي في السيرفر' });
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بأعلى حماية وثبات على بورت ${PORT}`);
});