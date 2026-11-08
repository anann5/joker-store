const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const adminRoutes = require('./routes/adminRoutes');
const storeRoutes = require('./routes/storeRoutes');
const userRoutes = require('./routes/userRoutes');
const { verifyAdminToken } = require('./controllers/authController');
const { logSecurityEvent } = require('./middleware/securityLogger');
const csrfProtection = require('./middleware/csrf');
const { clientIpMiddleware, rateLimitKey } = require('./middleware/clientIp');
const authController = require('./controllers/authController');
const { validate, contactSchema } = require('./middleware/validate');
const seoController = require('./controllers/seoController');
const { getSafeBaseHost } = require('./controllers/helpers');
const { Product } = require('./models');
const siteSettings = require('./config/siteSettings');
const uploadController = require('./controllers/uploadController');
const objectStorage = require('./services/objectStorage');
const logger = require('./config/logger');
const { requestContext } = require('./middleware/requestContext');
const paymentRoutes = require('./routes/paymentRoutes');
const { isDeliverable } = require('./services/inventory');
const packageJson = require('./package.json');

// إصدار الويب (الخطة A): يتغيّر فقط عندما تتغيّر ملفات الواجهة الأساسية،
// حتى يطلب التطبيق إعادة التحميل عند تغيير الهيكل — لا عند كل نشر خلفي.
// 1) تجاوز صريح عبر APP_WEB_VERSION (للاستخدام اليدوي على Render)
// 2) وإلا بصمة SHA-256 لأهم ملفات الواجهة (مخزنة مرة عند الإقلاع)
function computeWebVersion() {
    const override = String(process.env.APP_WEB_VERSION || '').trim();
    if (override) return override;
    const files = ['script.js', 'script.min.js', 'style.css', 'style.min.css', 'ui.js', 'ui.min.js', 'index.html', 'app-update.js'];
    const hash = crypto.createHash('sha256');
    for (const file of files) {
        try {
            hash.update(file);
            hash.update(fs.readFileSync(path.join(__dirname, 'public', file)));
        } catch (_err) {
            // ملف غائب (مثل .min قبل البناء) — يُتجاوز دون كسر البصمة
        }
    }
    return `web-${hash.digest('hex').slice(0, 12)}`;
}
const WEB_VERSION = computeWebVersion();

// نطاقات بوابات الدفع (إن وُجدت) — تُضاف إلى CSP فقط للبوابات المهيّأة.
// يدعم قائمة مفصولة بفاصلة لبوابات متعددة (JawwalPay + PalPay).
// لا نفتح سياسة الموقع لمزوّد غير مستخدم، ولا نسمح بأي نطاق عشوائي عشوائي.
const paymentGatewayOrigins = (() => {
    const origins = new Set();
    const collect = (raw) => {
        for (const part of String(raw || '').split(',')) {
            const value = part.trim();
            if (!value) continue;
            try { origins.add(new URL(value).origin); } catch (_err) { /* يُتجاوز غير الصالح */ }
        }
    };
    collect(process.env.PAYMENT_GATEWAY_ORIGIN);
    // نطاقات مخصصة لبوابات فلسطين عند توفرها
    collect(process.env.JAWWALPAY_ORIGIN);
    collect(process.env.PALPAY_ORIGIN);
    return [...origins];
})();

const app = express();
app.set('trust proxy', 1);

// فرض HTTPS عند الحاجة فقط.
// - على Render (وضع الإنتاج): يتوفر `x-forwarded-proto: https` من الـ Load Balancer، فيُبقي الطلبات.
// - محلياً في التطوير: نُعطّل التوجيه إما بـ NODE_ENV=development أو بـ FORCE_HTTPS=0 حتى يعمل http مباشرة.
const forceHttps = process.env.FORCE_HTTPS !== '0' &&
    process.env.NODE_ENV === 'production';

app.use((req, res, next) => {
    if (forceHttps && req.headers['x-forwarded-proto'] !== 'https' && req.headers['x-forwarded-proto'] !== 'https,http') {
        const hostHeader = String(req.get('host') || '');
        const isLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(hostHeader);
        if (isLocalhost) return next();
        // نستخدم نطاقاً آمناً (SITE_URL الثابت أو Host منظّف) — يمنع حقن الروابط عبر Host header
        const host = getSafeBaseHost(req);
        if (host) return res.redirect(302, `https://${host}${req.url}`);
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
            // نطاقات القياس المسموح بها: تُحمَّل فقط بعد موافقة الكوكيز (consent.js)،
            // لكن يجب أن تسمح بها السياسة وإلا حجبها المتصفح عند التفعيل.
            scriptSrc: [
                "'self'",
                'https://cdnjs.cloudflare.com',
                'https://www.gstatic.com',
                'https://cdn.jsdelivr.net',
                'https://www.googletagmanager.com',
                'https://www.google-analytics.com',
                'https://connect.facebook.net',
                ...paymentGatewayOrigins
            ],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://www.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: (() => {
                // api.github.com: فحص إصدار التطبيق من GitHub Releases (app-update.js / download.html)
                const list = [
                    "'self'",
                    'https://cdn.jsdelivr.net',
                    'https://api.github.com',
                    'https://www.google-analytics.com',
                    'https://analytics.google.com',
                    'https://region1.google-analytics.com',
                    'https://stats.g.doubleclick.net',
                    'https://connect.facebook.net',
                    'https://www.facebook.com',
                    ...paymentGatewayOrigins
                ];
                try {
                    // أصل الموقع يُشتق من SITE_URL بدل نطاق مكتوب يدوياً،
                    // حتى لا تتقادم قيمة WebSocket/الأصل عند تغيير النطاق.
                    const siteOrigin = new URL(String(process.env.SITE_URL || '').trim()).origin;
                    if (siteOrigin && !list.includes(siteOrigin)) {
                        list.push(siteOrigin);
                        // Socket.IO يعمل عبر wss على نفس الأصل
                        const wsHost = new URL(siteOrigin).host;
                        if (wsHost && !list.includes(`wss://${wsHost}`)) list.push(`wss://${wsHost}`);
                    }
                } catch (_) {}
                // السماح لـ localhost أثناء التطوير
                if (!forceHttps) {
                    list.push('http://localhost:10000', 'http://127.0.0.1:10000', 'ws://localhost:10000', 'ws://127.0.0.1:10000');
                }
                return [...new Set(list)];
            })(),
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", 'https://assets.mixkit.co'],
            frameSrc: ["'self'", ...paymentGatewayOrigins],
            frameAncestors: ["'self'"],
            baseUri: ["'self'"],
            formAction: ["'self'", ...paymentGatewayOrigins],
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

// helmet v8 أزال ميدلوير Permissions-Policy (فتجاهل الخيار بصمت)، لذا نضبط الترويسة يدوياً:
// تعطيل الوصول للكاميرا/الميكروفون/الموقع/USB مع السماح بالدفع لنفس الأصل فقط.
app.use((req, res, next) => {
    const paymentAllowance = paymentGatewayOrigins.length ? ` ${paymentGatewayOrigins.join(' ')}` : '';
    res.setHeader('Permissions-Policy', `camera=(), microphone=(), geolocation=(), payment=(self${paymentAllowance}), usb=()`);
    next();
});

// الحد العام صغير لحماية الطلبات العادية، لكن استيراد CSV يرسل الملف كـ JSON
// داخل { csvData } وقد يتجاوز 10KB بسهولة. نستخدم محللاً أكبر لهذا المسار فقط
// قبل المحلل العام، وإلا رُفض الطلب بـ 413 قبل أن يصل إلى المتحكم.
const jsonSmall = express.json({ limit: '10kb' });
const jsonImport = express.json({ limit: '2mb' });
// webhook بوابة الدفع يحتاج الجسم الخام (Buffer) للتحقق من التوقيع،
// وصفحة المحاكاة ترسل نموذج HTML عادياً (urlencoded).
const rawWebhook = express.raw({ type: '*/*', limit: '256kb' });
const urlEncodedSmall = express.urlencoded({ extended: false, limit: '10kb' });
app.use((req, res, next) => {
    if (req.method === 'POST' && req.path === '/api/admin/inventory/import') {
        return jsonImport(req, res, next);
    }
    if (req.method === 'POST' && req.path === '/api/payments/webhook') {
        return rawWebhook(req, res, next);
    }
    if (req.method === 'POST' && req.path === '/api/payments/mock/complete') {
        return urlEncodedSmall(req, res, next);
    }
    return jsonSmall(req, res, next);
});
app.disable('x-powered-by');

// قبل أي rate limiter: يحدد IP الزائر الحقيقي (CF-Connecting-IP) بدل IP الوكيل المشترك.
app.use(clientIpMiddleware);

// معرّف طلب + سجل وصول منظّم (X-Request-Id يعود للعميل للدعم الفني)
app.use(requestContext);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Math.max(120, Number.parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 300),
    keyGenerator: rateLimitKey,
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
        // مخطط منظمة/موقع (Schema.org) لأنواع نتائج البحث الغنية على الصفحة الرئيسية
        const orgId = `${origin}/#organization`;
        const homeJsonLd = safeJsonLd({
            '@context': 'https://schema.org',
            '@graph': [
                {
                    '@type': 'Organization',
                    '@id': orgId,
                    name: 'Joker Store',
                    url: origin,
                    logo: `${origin}/image/logo.png`,
                    contactPoint: {
                        '@type': 'ContactPoint',
                        contactType: 'customer service',
                        url: `${origin}/contact`,
                        availableLanguage: ['Arabic', 'English']
                    }
                },
                {
                    '@type': 'WebSite',
                    name: 'Joker Store',
                    url: origin,
                    inLanguage: ['ar', 'en'],
                    publisher: { '@id': orgId }
                }
            ]
        });
        const category = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 60) : '';
        const categoryQuery = category ? `?category=${encodeURIComponent(category)}` : '';
        const categoryLangQuery = lang => `${categoryQuery}${categoryQuery ? '&' : '?'}lang=${lang}`;
        res.type('html').send(html
            .replace('<link rel="canonical" href="/">', `<link rel="canonical" href="${origin}/${categoryQuery}">`)
            .replace('<link rel="alternate" hreflang="ar" href="/?lang=ar">', `<link rel="alternate" hreflang="ar" href="${hreflangOrigin}/${categoryLangQuery('ar')}">`)
            .replace('<link rel="alternate" hreflang="en" href="/?lang=en">', `<link rel="alternate" hreflang="en" href="${hreflangOrigin}/${categoryLangQuery('en')}">`)
            .replace('<link rel="alternate" hreflang="x-default" href="/">', `<link rel="alternate" hreflang="x-default" href="${hreflangOrigin}/${categoryQuery}">`)
            .replace('<meta property="og:image" content="/image/logo.png">', `<meta property="og:image" content="${origin}/image/logo.png">`)
            .replace('</head>', `<script type="application/ld+json">${homeJsonLd}</script></head>`));
    } catch (err) {
        next(err);
    }
};
// ضغط الاستجابات (gzip/brotli) لتقليل حجم النقل — قبل homePageHandler ليُضغط HTML أيضاً
app.use(compression());

app.get('/', homePageHandler);

// في الإنتاج: نخدم النسخ المضغوطة/المصغّرة الجاهزة إن وُجدت (style.min.css / script.min.js).
// الملفات المصدرية تبقى كما هي للتطوير، وإن غاب ملف .min يعمل الموقع طبيعياً بلا أي كسر.
const MINIFIED_ASSETS = {
    '/style.css': '/style.min.css',
    '/script.js': '/script.min.js',
    '/ui.js': '/ui.min.js'
};
app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production' || process.env.SERVE_MINIFIED === '0') return next();
    const target = MINIFIED_ASSETS[req.path];
    if (!target) return next();
    if (!fs.existsSync(path.join(__dirname, 'public', target.slice(1)))) return next();
    req.url = req.url.replace(req.path, target);
    next();
});

// تقديم WebP تلقائياً إذا كان المتصفح يدعمه وملف .webp موجود
app.use((req, res, next) => {
    const accept = req.headers.accept || '';
    if (accept.includes('image/webp') && req.path.endsWith('.png')) {
        const webpPath = path.join(__dirname, 'public', req.path.replace(/\.png$/i, '.webp'));
        if (fs.existsSync(webpPath)) {
            req.url = req.url.replace(/\.png$/i, '.webp');
        }
    }
    next();
});

// صور المتجر المرفوعة: تُخدم من R2 عبر الخادم عند تفعيله، وإلا من القرص المحلي.
app.get('/uploads/:filename', uploadController.servePublicUpload);

// Cache headers للملفات الثابتة
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(filePath)) {
            // الصور نادراً ما تتغيّر — كاش طويل
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        } else {
            // HTML/JS/CSS/JSON: وحدات الـ ES تُحمَّل بلا بصمة إصدار، لذا نُلزم المتصفح
            // بالتحقق من الحداثة (ETag → 304 رخيصة) بدل خدمة نسخة قديمة حتى ٧ أيام.
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));
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

app.get('/admin-style.css', verifyAdminToken, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'private', 'admin-style.css'));
});

// صفحات استعادة كلمة المرور (لا فهرسة — لا تحتوي محتوى عاماً)
app.get('/forgot-password', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
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
    // RENDER_GIT_COMMIT يوفره Render — يسمح بالتأكد من الإصدار المنشور فعلاً.
    const commit = String(process.env.RENDER_GIT_COMMIT || '').slice(0, 7);
    // حالة الاتصال بقاعدة البيانات (1 = متصل) دون كشف أي تفاصيل حساسة.
    let mongoose = null;
    try {
        mongoose = require('mongoose');
    } catch (_error) {
        mongoose = null;
    }
    const dbState = mongoose ? mongoose.connection.readyState : 0;
    const database = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
    const memory = process.memoryUsage();
    // حالة البريد (بدون كشف أسرار): true فقط إن وُجدت مفاتيح الإرسال
    const emailConfigured = Boolean(
        String(process.env.BREVO_API_KEY || '').trim()
        && String(process.env.MAIL_FROM || '').trim()
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({
        success: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
        ...(commit ? { commit } : {}),
        version: packageJson.version,
        uptimeSeconds: Math.round(process.uptime()),
        checks: {
            database,
            // readyState=1 يعني اتصالاً فعلياً بقاعدة البيانات
            databaseReady: dbState === 1,
            // البريد لا يعطّل الموقع إن غاب — فقط التأكيدات/الكوود لا تُرسل
            emailConfigured
        },
        memoryMb: {
            rss: Math.round(memory.rss / 1024 / 1024),
            heapUsed: Math.round(memory.heapUsed / 1024 / 1024)
        }
    });
});

// إصدار الويب للواجهة/التطبيق (الخطة A): التطبيق يقارن هذه القيمة
// بآخر قيمة رأها ويعرض شريط "يتوفر تحديث" لإعادة التحميل عند تغيير الهيكل.
app.get('/api/app/web-version', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const commit = String(process.env.RENDER_GIT_COMMIT || '').slice(0, 7);
    res.json({
        success: true,
        webVersion: WEB_VERSION,
        ...(commit ? { commit } : {}),
        version: packageJson.version
    });
});

app.get('/robots.txt', seoController.robotsTxt);
app.get('/sitemap.xml', seoController.sitemapXml);
app.get('/api/products/schema/:productId', seoController.productSchema);
app.get('/api/products/faq-schema', seoController.faqSchema);
app.get('/api/products/breadcrumb/:productId', seoController.breadcrumbSchema);

// صفحات HTML عبر sendFile: منع التخزين المؤقت لضمان ظهور التحديثات فوراً
app.use((req, res, next) => {
    if (/^\/(about|track|invoice|support|privacy|terms|contact|offers|faq|login|forgot-password|reset-password|notifications)(\.html)?\/?$/.test(req.path)) {
        res.setHeader('Cache-Control', 'no-cache');
    }
    next();
});

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

app.get('/track', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'track.html'));
});

app.get('/invoice', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'invoice.html'));
});

app.get('/support', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'support.html'));
});

app.get('/offers', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'offers.html'));
});

app.get('/notifications', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'notifications.html'));
});

app.get('/faq', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'faq.html'));
});

app.get('/download', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'download.html'));
});

app.get('/gift/:token', (req, res, next) => {
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(req.params.token || ''))) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'public', 'gift.html'));
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
 * يُرجع رابط صورة صالحاً للـSEO. يقبل الروابط المطلقة، ويصلح المسارات القديمة
 * مثل /steam.png → /image/steam.png، ويعود لشعار المتجر إذا كان الملف غير موجود.
 */
function resolveProductImage(image, baseUrl) {
    const raw = String(image || '').trim();
    if (/^https?:\/\//i.test(raw)) return raw;

    let local = raw;
    if (!local) {
        local = '/image/logo.png';
    } else if (!local.startsWith('/image/') && !local.startsWith('/uploads/')) {
        local = `/image/${path.basename(local)}`;
    }

    // صور /uploads/ تُخزَّن في R2 عند تفعيله، فلا يمكن التحقق من وجودها على القرص.
    const isRemoteUpload = local.startsWith('/uploads/') && objectStorage.isEnabled();
    if (!isRemoteUpload) {
        const diskPath = path.join(__dirname, 'public', local.replace(/^\/+/, ''));
        if (!fs.existsSync(diskPath)) local = '/image/logo.png';
    }
    return baseUrl ? `${baseUrl}${local}` : local;
}

/**
 * حالة التوفر الفعلية: الخارجي بلا مخزون معروف يُعد متوفراً،
 * والمحلي يُحسب من الأكواد المتاحة.
 */
function getProductAvailability(product) {
    let stock = null;
    if (product.availableStock !== null && product.availableStock !== undefined) {
        const value = Number(product.availableStock);
        if (Number.isFinite(value)) stock = value;
    } else if (product.isExternal) {
        if (product.providerStock === null || product.providerStock === undefined) {
            return 'https://schema.org/InStock';
        }
        stock = Number(product.providerStock);
    } else if (Array.isArray(product.codes)) {
        stock = product.codes.filter(code => code && code.status === 'available').length;
    }
    return stock !== null && Number.isFinite(stock) && stock <= 0
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock';
}

/**
 * هل النص وصف افتراضي/فارغ؟ (نفس منطق الواجهة تقريباً)
 * @param {unknown} value
 * @returns {boolean}
 */
function isDefaultProductDescription(value) {
    const normalized = String(value ?? '')
        .replace(/[\u064B-\u0652\u0670]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.،,!:؛;]+$/u, '')
        .toLowerCase();
    if (!normalized) return true;
    const defaults = new Set([
        'لا يوجد وصف متاح حاليا لهذا المنتج',
        'لا يوجد وصف متاح لهذا المنتج',
        'لا يوجد وصف',
        'no description is available for this product at the moment',
        'no description available for this product at the moment',
        'no description available',
        'no description'
    ]);
    return defaults.has(normalized) || normalized.length < 2;
}

/**
 * وصف SEO بديل وغني عندما لا يملك المنتج وصفاً حقيقياً.
 * @param {string} name
 * @param {'ar'|'en'} lang
 * @returns {string}
 */
function buildFallbackProductDescription(name, lang) {
    if (lang === 'en') {
        return `Buy ${name} from Joker Store — a 100% genuine digital code with instant delivery after payment confirmation and a full refund guarantee.`;
    }
    return `اشترِ ${name} من Joker Store — كود رقمي أصلي مضمون 100% مع توصيل فوري بعد تأكيد الدفع وضمان استرجاع كامل.`;
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
    const rawArDesc = String(descSource.ar || descSource.en || '');
    const rawEnDesc = String(descSource.en || descSource.ar || '');
    const arDesc = isDefaultProductDescription(rawArDesc)
        ? buildFallbackProductDescription(arName, 'ar')
        : rawArDesc;
    const enDesc = isDefaultProductDescription(rawEnDesc)
        ? buildFallbackProductDescription(enName, 'en')
        : rawEnDesc;
    const description = lang === 'en' ? enDesc : arDesc;

    const baseUrl = String(origin || process.env.SITE_URL || '').replace(/\/+$/, '');
    const hreflangBase = String(hreflangOrigin || '').replace(/\/+$/, '');
    const canonical = `${baseUrl}/product/${productId}`;
    const productPage = `${hreflangBase}/product/${productId}`;
    // تحويل الصورة إلى رابط مطلق مع التحقق من وجود الملف (يمنع og:image المكسور)
    const absoluteImage = resolveProductImage(product.image, baseUrl);
    const price = Number(product.price);
    const hasValidPrice = Number.isFinite(price) && price > 0;
    const availability = getProductAvailability(product);

    const schema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name,
        image: absoluteImage,
        description,
        sku: String(productId),
        offers: hasValidPrice ? {
            '@type': 'Offer',
            priceCurrency: siteSettings.currency.code,
            price,
            availability,
            url: canonical
        } : undefined
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
            .select('productName description price category region image rating reviewsCount isActive isExternal providerStock codes.status');
    } catch (_err) {
        return next();
    }
    if (!product || !product.isActive || !isDeliverable(product)) {
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
    keyGenerator: rateLimitKey,
    message: 'عدد طلبات توليد توكن الحماية كبير جداً، يرجى المحاولة لاحقاً.'
});

app.get('/api/csrf-token', csrfTokenLimiter, csrfProtection.issueToken);

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: rateLimitKey,
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
app.use('/api', paymentRoutes);
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
    // سجل منظّم يحذف الحقول الحساسة تلقائياً، مع إرسال الأخطاء 5xx للمراقبة الخارجية.
    const context = {
        requestId: req.id,
        method: req.method,
        route: String(req.originalUrl || '').split('?')[0],
        status,
        userId: req.user?.userId || req.admin?.userId
    };
    if (status >= 500) {
        logger.reportError(err, context);
    } else {
        logger.warn('request_error', { ...context, err: logger.serializeError(err) });
    }
    if (status >= 500 || status === 401 || status === 403) {
        logSecurityEvent('SERVER_ERROR', `${err.message || 'Internal Server Error'} - ${req.method} ${req.originalUrl}`, req);
    }
    res.status(status).json({
        success: false,
        // في الإنتاج لا نكشف لمحة داخلية عن أخطاء الخادم (5xx) للعملاء
        message: (status >= 500 && isProd) ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
        requestId: req.id,
        ...(!isProd && { stack: err.stack })
    });
});

module.exports = app;
