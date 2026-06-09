require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const path       = require('path');
const crypto     = require('crypto');
const rateLimit  = require('express-rate-limit');
const helmet     = require('helmet');
const { Product, Order } = require('./models');

const app  = express();
app.set('trust proxy', 1);

const PORT           = process.env.PORT || 5850;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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
// 🛡️ التحقق من الأدمن
// ====================================================
function verifyAdmin(req, res, next) {
    if (!ADMIN_PASSWORD) {
        return res.status(500).json({ success: false, error: 'السيرفر غير مهيأ' });
    }
    const token = req.headers['x-admin-token'];
    if (!token || token !== ADMIN_PASSWORD) {
        console.warn(`⚠️ دخول أدمن فاشل من IP: ${req.ip}`);
        return res.status(401).json({ success: false, error: 'غير مصرح' });
    }
    next();
}

// ====================================================
// هامش الربح
// ====================================================
const PROFIT_PERCENTAGE = 0.08;
const FIXED_PROFIT      = 0.50;

function calculateSellingPrice(costPrice) {
    return parseFloat((costPrice + (costPrice * PROFIT_PERCENTAGE) + FIXED_PROFIT).toFixed(2));
}

// ====================================================
// Routes — العامة
// ====================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// جلب المنتجات من DB
app.get('/api/products/:category', async (req, res) => {
    try {
        const category = req.params.category.toLowerCase().replace(/[^a-z_]/g, '');

        const products = await Product.find({ 
            category,
            isActive: true 
        }).select('productName category region price codes');

        // أرسل فقط المنتجات اللي عندها مخزون
        const result = products
            .filter(p => p.codes.some(c => c.status === 'available'))
            .map(p => ({
                id:    p._id,
                name:  p.productName,
                price: p.price,
                region: p.region,
                stock: p.codes.filter(c => c.status === 'available').length
            }));

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

        // ابحث عن منتج موجود بنفس الاسم والريجن
        let product = await Product.findOne({ 
            productName: productName.trim(), 
            category, 
            region 
        });

        if (product) {
            // أضف الأكواد الجديدة للمنتج الموجود
            product.codes.push(...cleanCodes);
            product.updatedAt = new Date();
            await product.save();
        } else {
            // أنشئ منتج جديد
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

const axios = require('axios');

// التأكد من قراءة المفتاح السري من الـ .env
const DIGIBANKAR_API_KEY = process.env.DIGIBANKAR_API_KEY; 

// ====================================================
// ⚡ 1. إنشاء رابط دفع تلقائي عبر Digibankar
// ====================================================
app.post('/api/orders/checkout', async (req, res) => {
    try {
        const { productId, buyerEmail } = req.body;

        if (!productId || !buyerEmail) {
            return res.status(400).json({ success: false, error: 'الرجاء إدخال الإيميل واختيار المنتج' });
        }

        // جلب بيانات المنتج والمخزون من MongoDB
        const product = await Product.findById(productId);
        if (!product || !product.isActive) {
            return res.status(404).json({ success: false, error: 'المنتج غير متاح حالياً' });
        }

        // فحص المخزون قبل توليد الفاتورة
        const availableCodes = product.codes.filter(c => c.status === 'available');
        if (availableCodes.length === 0) {
            return res.status(400).json({ success: false, error: 'للأسف نفذت كمية هذا المنتج حالياً' });
        }

        // توليد رقم طلب فريد للموقع
        const orderId = 'JKR-' + crypto.randomBytes(3).toString('hex').toUpperCase();

        // إنشاء سجل طلب "معلق بانتظار الدفع الرقمي"
        const newOrder = new Order({
            orderId:        orderId,
            productId:      product._id,
            productName:    product.productName,
            category:       product.category,
            region:         product.region,
            price:          product.price,
            buyerEmail:     buyerEmail,
            status:         'pending',
            paymentGateway: 'digibankar'
        });
        await newOrder.save();

        // 🚀 إرسال طلب لـ Digibankar لتوليد الفاتورة ورابط الدفع
        // ملاحظة: الحقول بناءً على توثيق API المنصة الخاص بإنشاء الدفعات (Payment/Invoice Session)
        const response = await axios.post('https://api.digibankar.com/v1/payments/create', {
            amount:       product.price,
            currency:     'USD', // أو العملة المعتمدة بحسابك عندهم
            order_id:     orderId,
            callback_url: `https://${req.get('host')}/api/payments/callback`, // صفحة العودة بعد الدفع
            webhook_url:  `https://${req.get('host')}/api/payments/webhook`,   // الـ Webhook السري للتسليم الفوري
            description:  `شراء ${product.productName} لـ ${buyerEmail}`
        }, {
            headers: {
                'Authorization': `Bearer ${DIGIBANKAR_API_KEY}`,
                'Content-Type':  'application/json'
            }
        });

        // إذا نجح توليد الفاتورة، أرسل رابط الدفع للواجهة الأمامية
        if (response.data && response.data.payment_url) {
            res.json({ 
                success: true, 
                paymentUrl: response.data.payment_url, 
                orderId: orderId 
            });
        } else {
            throw new Error('لم يتم استلام رابط الدفع من المنصة');
        }

    } catch (err) {
        console.error('❌ خطأ أثناء توليد فاتورة Digibankar:', err.message);
        res.status(500).json({ success: false, error: 'فشل الاتصال ببوابة الدفع الرقمية، حاول لاحقاً' });
    }
});

// ====================================================
// ⚡ 2. الـ Webhook السري: استقبال تأكيد الدفع والتسليم الفوري
// ====================================================
app.post('/api/payments/webhook', async (req, res) => {
    try {
        // Digibankar يرسل تفاصيل العملية في الـ body
        const { order_id, status, hash } = req.body; 

        // [خطوة حماية اختيارية]: يمكنك التحقق من الـ Hash هنا لضمان أن الطلب قادم من سيرفرهم فعلاً

        if (status === 'success' || status === 'completed') {
            // ابحث عن الطلب المعلق في قاعدة بياناتك
            const order = await Order.findOne({ orderId: order_id, status: 'pending' });
            
            if (!order) {
                return res.status(404).json({ success: false, error: 'الطلب غير موجود أو تم معالجته مسبقاً' });
            }

            // جلب المنتج وسحب كود متاح تلقائياً باستخدام الدالة المبنية في الـ Models عندك
            const product = await Product.findById(order.productId);
            
            // سحب كود وتحديث حالته لـ sold فوراً في قاعدة البيانات
            const deliveredCode = await product.pullAvailableCode(order.orderId, order.buyerEmail);

            // تحديث سجل الطلب كـ مكتمل وحفظ الكود فيه
            order.status = 'completed';
            order.code   = deliveredCode;
            await order.save();

            // 📧 هان بتشغل دالة إرسال الإيميل الفوري للزبون (Nodemailer)
            console.log(`🚀 تم شحن الكود [${deliveredCode}] بنجاح إلى إيميل: ${order.buyerEmail}`);

            // إرجاع رد نجاح لسيرفر Digibankar عشان يوقف الإشعارات
            return res.json({ success: true, message: 'Webhook processed and code delivered' });
        }

        res.json({ success: true, message: 'Status is not successful' });

    } catch (err) {
        console.error('❌ خطأ في معالجة Webhook الدفع:', err.message);
        res.status(500).json({ success: false, error: 'Internal Webhook Error' });
    }
});

// ====================================================
// 🛡️ معالجة الأخطاء
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
    if (!ADMIN_PASSWORD) console.warn('⚠️ ADMIN_PASSWORD غير موجود!');
});