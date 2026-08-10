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

const app = express();
app.set('trust proxy', 1);

app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.get('host')}${req.url}`);
    }
    next();
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://www.gstatic.com', 'https://cdn.socket.io'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://www.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https://cdn.socket.io', 'wss://*', 'ws://*'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'self'"],
            frameAncestors: ["'self'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: []
        }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
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
    max: 100,
    message: 'عدد طلبات كبير جداً، يرجى المحاولة لاحقاً.'
});
app.use('/api/', limiter);
app.use(cookieParser());

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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const authenticateAdminPage = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1] || req.cookies['admin_token'];
    if (!token) return res.redirect('/login.html');
    authController.verifyAdminToken(req, res, next, '/login.html');
};

app.get('/admin', authenticateAdminPage, (req, res) => {
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

app.get('/api/csrf-token', csrfProtection.issueToken);
app.post('/api/contact', validate(contactSchema), (req, res) => {
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
