const express = require('express');
const fs = require('fs');
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
const stripeController = require('./controllers/stripeController');
const { getSafeBaseHost } = require('./controllers/helpers');
const { Product } = require('./models');
const siteSettings = require('./config/siteSettings');

const app = express();
app.set('trust proxy', 1);

// فرض HTTPS عند الحاجة فقط.
// - على Render (وضع الإنتاج): يتوفر `x-forwarded-proto: https` من الـ Load Balancer، فيُبقي الطلبات.
// - محلياً في التطوير: نُعطّل التوجيه إما بـ NODE_ENV=development أو بـ FORCE_HTTPS=0 حتى يعمل http مباشرة.
const forceHttps = process.env.FORCE_HTTPS !== '0' &&
    process.env.NODE_ENV === 'production';

app.use((req, res, next) => {
    if (forceHttps && req.headers['x-forwarded-proto'] !== 'https' && req.headers['x-forwarded-proto'] !== 'https,http') {
        // نستخدم نطاقاً آمناً (SITE_URL الثابت أو Host منظّف) — يمنع حقن الروابط عبر Host header
        const host = getSafeBaseHost(req);
        if (host) return res.redirect(301, `https://${host}${req.url}`);
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

// Webhook Stripe: يُسجَّل قبل express.json للحصول على النص الخام (RAW)
// للتحقق من توقيع HMAC ومنع استدعاءات مزيفة.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeController.stripeWebhook);

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
    // مفاتيح خطرة: تُحذف مهما كان نوع قيمتها (لم تكن تُحذف إلا عند كونها سلسلة)
    const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    const sanitize = (obj) => {
        // Object.keys يعبر الخصائص الخاصة فقط (لا السلسلة البرمجية الموروثة)
        if (obj && typeof obj === 'object') {
            for (const key of Object.keys(obj)) {
                if (key.startsWith('$') || key.includes('.') || DANGEROUS_KEYS.has(key)) {
                    delete obj[key];
                    continue;
                }
                const value = obj[key];
                if (value && typeof value === 'object') {
                    try {
                        sanitize(value);
                    } catch (_e) {
                        // تجاهل الكائنات غير القابلة للتعديل بأمان
                    }
                }
            }
        }
    };
    sanitize(req.body);
    sanitize(req.params);
    sanitize(req.query);
    next();
});

// أصل الموقع الكامل (بروتوكول + مضيف): يفضّل SITE_URL الثابت (مصدر واحد للحقيقة)،
// وإلا يُبنى من بروتوكول الطلب ومضيفه الآمن.
const getPublicOrigin = (req) => {
    const siteUrl = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
    if (siteUrl) return siteUrl;
    return `${req.protocol}://${getRequestHost(req)}`;
};

// مضيف الطلب الخام بعد تنظيفه (لا يتأثر بـ SITE_URL) — يُستخدم في hreflang
// لضمان التبادلية بين نسخ اللغات على نفس الأصل الذي وُجدت عليه الصفحة.
const getRequestHost = (req) => String((req && req.get && req.get('host')) || '').replace(/[^a-zA-Z0-9.:[\]-]/g, '');

// الصفحة الرئيسية: حقن وسوم SEO مطلقة (canonical/hreflang) حسب أصل الطلب
// حتى تكون صالحة لدى فاحص Lighthouse وأدوات مشرفي المواقع (لا روابط نسبية).
const homePageHandler = (req, res, next) => {
    const origin = getPublicOrigin(req);
    // hreflang تُبنى دائماً من أصل الطلب نفسه لضمان التبادلية
    // (الزاحف يفتح كل نسخة لغة ويتأكد أنها تشير إليه بدورها).
    const hreflangOrigin = `${req.protocol}://${getRequestHost(req)}`;
    try {
        const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
        res.type('html').send(html
            .replace('<link rel="canonical" href="/">', `<link rel="canonical" href="${origin}/">`)
            .replace('<link rel="alternate" hreflang="ar" href="/?lang=ar">', `<link rel="alternate" hreflang="ar" href="${hreflangOrigin}/?lang=ar">`)
            .replace('<link rel="alternate" hreflang="en" href="/?lang=en">', `<link rel="alternate" hreflang="en" href="${hreflangOrigin}/?lang=en">`)
            .replace('<link rel="alternate" hreflang="x-default" href="/">', `<link rel="alternate" hreflang="x-default" href="${hreflangOrigin}/">`));
    } catch (err) {
        next(err);
    }
};
app.get('/', homePageHandler);
app.use(express.static(path.join(__dirname, 'public')));
// عميل socket.io يُخدم محلياً (تطابق الإصدار مع الخادم + لا اعتماد على CDN خارجي).
// يُخفى تحت /vendor بدلاً من /socket.io لأن خادم Socket.IO (بإعداد serveClient:false)
// يعترض أي طلب يبدأ بـ /socket.io ويرد 400 — فكان العميل يُحمَّل فاشلاً دائماً.
app.use('/vendor/socket.io', express.static(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist')));

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

/**
 * تهريب قيمة نصية ديناميكية لإدراجها بأمان داخل HTML (يمنع حقن الوسوم).
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * جعل كائن JSON آمناً داخل وسم <script> (يستبدل < بـ \u003c
 * حتى لا يُغلق الوسم مبكراً بقيمة ديناميكية).
 */
function safeJsonLd(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * إزالة وسوم SEO العامة المكررة (title/canonical/description/robots/og/twitter)
 * من صفحة الواجهة قبل حقن وسوم المنتج، حتى لا يتكرر أي وسم في صفحة /product/:id.
 */
function stripDuplicateSeoTags(html) {
    const patterns = [
        /<title\b[^>]*>.*?<\/title>/gi,
        /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi,
        /<link\b[^>]*\bhreflang=["'][^"']+["'][^>]*>/gi,
        /<meta\b[^>]*\bname=["']description["'][^>]*>/gi,
        /<meta\b[^>]*\bname=["']robots["'][^>]*>/gi,
        /<meta\b[^>]*\bproperty=["']og:(?:type|title|description|image|url|site_name)["'][^>]*>/gi,
        /<meta\b[^>]*\bname=["']twitter:(?:card|title|description|image)["'][^>]*>/gi
    ];
    return patterns.reduce((out, pattern) => out.replace(pattern, ''), html);
}

/**
 * بناء كتلة وسوم SEO (title/description/canonical/og/twitter/JSON-LD)
 * لمنتج واحد، تُحقن مباشرة بعد <head> في صفحة /product/:id.
 * كل قيمة ديناميكية تُهرب عبر escapeHtml.
 */
function buildProductSeoMeta(product, queryLang, productId, origin, hreflangOrigin = origin) {
    const lang = queryLang === 'en' ? 'en' : 'ar';
    const nameSource = product.productName || {};
    const descSource = product.description || {};
    const nameFallback = 'Joker Store';
    const arName = String(nameSource.ar || nameSource.en || nameFallback);
    const enName = String(nameSource.en || nameSource.ar || nameFallback);
    const name = lang === 'en' ? enName : arName;
    const arDesc = String(descSource.ar || descSource.en || 'لا يوجد وصف متاح حالياً لهذا المنتج.');
    const enDesc = String(descSource.en || descSource.ar || 'No description is available for this product at the moment.');
    const description = lang === 'en' ? enDesc : arDesc;

    const baseUrl = String(origin || process.env.SITE_URL || '').replace(/\/+$/, '');
    const hreflangBase = String(hreflangOrigin || '').replace(/\/+$/, '');
    const canonical = `${baseUrl}/product/${productId}`;
    const productPage = `${hreflangBase}/product/${productId}`;
    const imageSource = product.image && String(product.image) ? String(product.image) : '/image/logo.png';
    // تحويل الصورة إلى رابط مطلق عند توفر أصل صالح (لا تُترك روابط نسبية في og:image/JSON-LD)
    const absoluteImage = imageSource.includes('://')
        ? imageSource
        : (baseUrl ? `${baseUrl}${imageSource.startsWith('/') ? '' : '/'}${imageSource}` : imageSource);
    const price = Number(product.price) || 0;

    const schema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name,
        image: absoluteImage,
        description,
        sku: String(productId),
        offers: {
            '@type': 'Offer',
            priceCurrency: siteSettings.currency.code,
            price,
            availability: 'https://schema.org/InStock',
            url: canonical
        }
    };
    if (Number(product.rating) > 0) {
        schema.aggregateRating = {
            '@type': 'AggregateRating',
            ratingValue: Number(product.rating),
            reviewCount: Number(product.reviewsCount) || 0
        };
    }

    const jsonLd = safeJsonLd(schema);

    return `
        <meta name="robots" content="index, follow">
        <title>${escapeHtml(name)} | Joker Store</title>
        <meta name="description" content="${escapeHtml(description)}">
        <link rel="canonical" href="${escapeHtml(canonical)}">
        <link rel="alternate" hreflang="ar" href="${escapeHtml(`${productPage}?lang=ar`)}">
        <link rel="alternate" hreflang="en" href="${escapeHtml(`${productPage}?lang=en`)}">
        <link rel="alternate" hreflang="x-default" href="${escapeHtml(productPage)}">
        <meta property="og:type" content="product">
        <meta property="og:title" content="${escapeHtml(name)}">
        <meta property="og:description" content="${escapeHtml(description)}">
        <meta property="og:image" content="${escapeHtml(absoluteImage)}">
        <meta property="og:url" content="${escapeHtml(canonical)}">
        <meta property="og:site_name" content="Joker Store">
        <meta name="twitter:card" content="summary">
        <meta name="twitter:title" content="${escapeHtml(name)}">
        <meta name="twitter:description" content="${escapeHtml(description)}">
        <meta name="twitter:image" content="${escapeHtml(absoluteImage)}">
        <script type="application/ld+json">${jsonLd}</script>
    `;
}

// مسار عميق للمنتجات: تُخدم صفحة الواجهة (SPA) لفتح تفاصيل المنتج مباشرة.
// عند وجود المنتج تُحقن وسوم SEO للزاحفين (title/description/canonical/og/twitter/JSON-LD)
// مع بقاء index.html تُقدم كما هي ليعمل عرض الواجهة التفاعلي كالمعتاد.
// يُقبل فقط معرفات المنتج الصالحة (24 خانة سداسية)، وكل ما عدا ذلك يُترك للمسارات الثابتة
// (الأصول مثل /products/script.js أو الصور تُخدم عادياً).
app.get('/product/:productId', async (req, res, next) => {
    const { productId } = req.params;
    if (!/^[a-fA-F0-9]{24}$/.test(productId)) {
        return next();
    }

    let product;
    try {
        product = await Product.findById(productId)
            .select('productName description price category region image rating reviewsCount isActive');
    } catch (_err) {
        return next();
    }
    if (!product || !product.isActive) {
        return next();
    }

    let html;
    try {
        html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    } catch (err) {
        return next(err);
    }

    // إزالة وسوم SEO العامة المكررة ثم حقن وسوم المنتج حتى لا يتكرر title/canonical/og
    html = stripDuplicateSeoTags(html);

    const headMatch = html.match(/<head[^>]*>/i);
    if (!headMatch) {
        return res.type('html').send(html);
    }

    const metaBlock = buildProductSeoMeta(
        product,
        req.query.lang,
        productId,
        getPublicOrigin(req),
        `${req.protocol}://${getRequestHost(req)}`
    );
    const injected = html.slice(0, headMatch.index + headMatch[0].length)
        + metaBlock
        + html.slice(headMatch.index + headMatch[0].length);

    res.type('html').send(injected);
});

// حدّ تفصيلي لتوليد توكنات CSRF: يمنع إغراق خريطة الذاكرة csrfTokens بتوكنات وهمية
const csrfTokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'عدد طلبات توليد توكن الحماية كبير جداً، يرجى المحاولة لاحقاً.'
});

app.get('/api/csrf-token', csrfTokenLimiter, csrfProtection.issueToken);

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
        return res.status(404).type('html').sendFile(path.join(__dirname, 'public', '404.html'));
    }
    res.status(404).json({ success: false, message: 'الصفحة غير موجودة' });
});

app.use((err, req, res, next) => {
    const status = err.status || 500;
    const isProd = process.env.NODE_ENV === 'production';
    // سجل منسق ومصفي: لا نطبع كائن الخطأ الكامل (قد يحتوي بيانات حساسة) بل ملخصاً قصيراً
    console.error(`${new Date().toISOString()} [${status}] ${req.method} ${req.originalUrl}: ${err.message || err.name || 'Internal Server Error'}`);
    if (status >= 500 || status === 401 || status === 403) {
        logSecurityEvent('SERVER_ERROR', `${err.message || 'Internal Server Error'} - ${req.method} ${req.originalUrl}`, req);
    }
    res.status(status).json({
        success: false,
        // في الإنتاج لا نكشف لمحة داخلية عن أخطاء الخادم (5xx) للعملاء
        message: (status >= 500 && isProd) ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
        ...(!isProd && { stack: err.stack })
    });
});

module.exports = app;
