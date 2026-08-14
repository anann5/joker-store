const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const adminRoutes = require('./routes/adminRoutes');
const storeRoutes = require('./routes/storeRoutes');
const userRoutes = require('./routes/userRoutes');
const { verifyAdminToken } = require('./controllers/authController');
const { logSecurityEvent } = require('./middleware/securityLogger');
const csrfProtection = require('./middleware/csrf');
const authController = require('./controllers/authController');
const { validate, contactSchema } = require('./middleware/validate');
const seoController = require('./controllers/seoController');

const app = express();
app.set('trust proxy', 1);

// فرض HTTPS عند الحاجة فقط.
// - على Render (وضع الإنتاج): يتوفر `x-forwarded-proto: https` من الـ Load Balancer، فيُبقي الطلبات.
// - محلياً في التطوير: نُعطّل التوجيه إما بـ NODE_ENV=development أو بـ FORCE_HTTPS=0 حتى يعمل http مباشرة.
const forceHttps = process.env.FORCE_HTTPS !== '0' &&
    process.env.NODE_ENV === 'production';

app.use((req, res, next) => {
    if (forceHttps && req.headers['x-forwarded-proto'] !== 'https' && req.headers['x-forwarded-proto'] !== 'https,http') {
        return res.redirect(301, `https://${req.get('host')}${req.url}`);
    }
    next();
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // Strict script policy: no 'unsafe-inline'. All JS is external
            // (admin bootstrap was moved to public/admin-boot.js, socket.io client
            // is served locally from node_modules/socket.io/client-dist).
            scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://www.gstatic.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://www.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'self'"],
            frameAncestors: ["'self'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: null,
            ...(forceHttps ? { upgradeInsecureRequests: [] } : {})
        }
    },
    // HSTS يُفعّل فقط عند فرض HTTPS (الإنتاج). محلياً في التطوير يبقى معطّلاً
    // حتى لا يفرض المتصفح https على localhost ويحجب الصفحة.
    hsts: forceHttps ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
    noSniff: true,
    frameguard: { action: 'deny' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '10kb' }));
app.disable('x-powered-by');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Math.max(120, Number.parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 300),
    message: 'عدد طلبات كبير جداً، يرجى المحاولة لاحقاً.'
});
app.use('/api/', limiter);
app.use(cookieParser());

// لا تخزين مؤقت لأي استجابة في مسارات الأدمن (بيانات حساسة)
app.use('/api/admin', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

app.use((req, res, next) => {
    const sanitize = (obj) => {
        if (obj && typeof obj === 'object') {
            for (const key in obj) {
                if (key.startsWith('$') || key.includes('.')) delete obj[key];
                else if (typeof obj[key] === 'object') sanitize(obj[key]);
                else if (typeof obj[key] === 'string' && ['__proto__', 'constructor', 'prototype'].includes(key)) {
                    delete obj[key];
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
// عميل socket.io يُخدم محلياً (تطابق الإصدار مع الخادم + لا اعتماد على CDN خارجي)
app.use('/socket.io', express.static(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const authenticateAdminPage = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1] || req.cookies['admin_token'];
    if (!token) return res.redirect('/login.html');
    authController.verifyAdminToken(req, res, next, '/login.html');
};

app.get('/admin', authenticateAdminPage, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

app.get('/admin.js', verifyAdminToken, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'private', 'admin.js'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'image', 'logo.png'));
});

app.get('/health', (req, res) => {
    res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/robots.txt', seoController.robotsTxt);
app.get('/sitemap.xml', seoController.sitemapXml);
app.get('/api/products/schema/:productId', seoController.productSchema);

app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/faq', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'faq.html'));
});

// مسار عميق للمنتجات: تُخدم صفحة الواجهة (SPA) لفتح تفاصيل المنتج مباشرة.
// يُقبل فقط معرفات المنتج الصالحة (24 خانة سداسية)، وكل ما عدا ذلك يُترك للمسارات الثابتة
// (الأصول مثل /products/script.js أو الصور تُخدم عادياً).
app.get('/product/:productId', (req, res, next) => {
    if (!/^[a-fA-F0-9]{24}$/.test(req.params.productId)) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/csrf-token', csrfProtection.issueToken);

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'عدد رسائل الاتصال كبير جداً، يرجى المحاولة لاحقاً.'
});

app.post('/api/contact', contactLimiter, validate(contactSchema), (req, res) => {
    logSecurityEvent('CONTACT_MESSAGE', `Contact message received from ${req.body.email}`, req);
    res.json({
        success: true,
        message: 'تم استلام الرسالة بنجاح. سنقوم بالرد عليك قريباً.'
    });
});

app.post('/api/admin/logout', authController.logout);

app.use('/api/admin', (req, res, next) => {
    if (req.path === '/login' || req.path === '/logout' || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return next();
    }
    return csrfProtection.validate(req, res, next);
});
app.use('/api/admin', adminRoutes);
app.use('/api', storeRoutes);
app.use('/api', userRoutes);

app.use((req, res) => {
    logSecurityEvent('UNDEFINED_ROUTE', `Attempted access to undefined route: ${req.method} ${req.originalUrl}`, req);
    if (req.accepts('html')) {
        return res.status(404).type('html').send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>الصفحة غير موجودة</title><style>body{font-family:Arial,sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;} .card{background:#111827;border:1px solid #334155;border-radius:16px;padding:32px;max-width:520px;text-align:center;} a{color:#38bdf8;text-decoration:none;} </style></head><body><div class="card"><h1>الصفحة غير موجودة</h1><p>الصفحة التي تبحث عنها غير متاحة أو تم نقلها.</p><a href="/">العودة للصفحة الرئيسية</a></div></body></html>`);
    }
    res.status(404).json({ success: false, message: 'الصفحة غير موجودة' });
});

app.use((err, req, res, next) => {
    console.error(err);
    if (err.status >= 500 || err.status === 401 || err.status === 403) {
        logSecurityEvent('SERVER_ERROR', `${err.message || 'Internal Server Error'} - ${req.method} ${req.originalUrl}`, req);
    }
    const status = err.status || 500;
    res.status(status).json({
        success: false,
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

module.exports = app;
