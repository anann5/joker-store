const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/database");
const adminRoutes = require("./routes/adminRoutes");
const storeRoutes = require("./routes/storeRoutes");
const userRoutes = require("./routes/userRoutes");
const rateLimit = require("express-rate-limit");
const { syncInventoryInternal, cleanupOldLogsInternal } = require("./controllers/adminController");
const { verifyAdminToken } = require("./controllers/authController");
const { logSecurityEvent } = require("./middleware/securityLogger");
const jwt = require("jsonwebtoken");

const app = express();

// 🔒 Force HTTPS
app.use((req, res, next) => {
    // فقط في بيئة الإنتاج (Production)، قم بإجبار التحويل إلى HTTPS
    if (process.env.NODE_ENV === 'production') {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, 'https://' + req.get('host') + req.url);
        }
    }
    next();
});

// 🛡️ Security Middlewares - Helmet with enhanced CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://www.gstatic.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://www.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'self'"],
            frameAncestors: ["'self'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: []
        },
    },
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
    noSniff: true,
    frameguard: { action: 'deny' }
}));

// 🚦 Rate Limiting - Global limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit to 100 requests per IP
    message: "عدد طلبات كبير جداً، يرجى المحاولة لاحقاً."
});
app.use("/api/", limiter);

// Parse JSON
app.use(express.json({ limit: "10kb" }));

// Cookie parser
app.use(cookieParser());

// Sanitize inputs (prevent NoSQL injection)
app.use((req, res, next) => {
    const sanitize = (obj) => {
        if (obj && typeof obj === "object") {
            for (const key in obj) {
                if (key.startsWith("$") || key.includes(".")) delete obj[key];
                else if (typeof obj[key] === "object") sanitize(obj[key]);
                // Sanitize string values to prevent prototype pollution
                else if (typeof obj[key] === "string") {
                    // Remove potential prototype pollution attempts
                    if (key === "__proto__" || key === "constructor" || key === "prototype") {
                        delete obj[key];
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

// Database Connection
connectDB();

// 📂 Static Files — ONLY 'public' folder is exposed publicly
// private/ (containing admin.html, admin.js) is NOT exposed — only served via protected /admin route
app.use(express.static(path.join(__dirname, 'public')));

// 🌐 Routes
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});
// 🔒 Middleware للصفحة الكاملة — توجيه متصفح غير الموثّقين
const authenticateAdminPage = (req, res, next) => {
    const token = req.cookies['admin_token'];
    if (!token) {
        return res.redirect('/login.html');
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.redirect('/login.html');
        }
        req.admin = decoded;
        next();
    });
};

app.get("/admin", authenticateAdminPage, (req, res) => {
    res.sendFile(path.join(__dirname, "private", "admin.html"));
});

app.get("/admin.js", verifyAdminToken, (req, res) => {
    res.sendFile(path.join(__dirname, "private", "admin.js"));
});

app.get("/login.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

// API routes
app.use("/api/admin", adminRoutes);
app.use("/api", storeRoutes);
app.use("/api", userRoutes);

// Catch-all for undefined routes (Express 5 compatible)
app.use((req, res) => {
    logSecurityEvent('UNDEFINED_ROUTE', `Attempted access to undefined route: ${req.method} ${req.originalUrl}`, req);
    res.status(404).json({
        success: false,
        message: 'الصفحة غير موجودة'
    });
});

// Generic error handler
app.use((err, req, res, next) => {
    console.error(err);
    
    // تسجيل الأخطاء الحرجة في السجل الأمني
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

// ⏳ Price monitoring (runs every 6 hours)
const AUTO_SYNC_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
setInterval(async () => {
    try {
        console.log("🔄 جاري البدء في مراقبة وتحديث الأسعار من المزودين...");
        const result = await syncInventoryInternal();
        if (result.success) {
            console.log(`✅ تم تحديث ${result.count} منتج بناءً على الأسعار الجديدة لهوامش الربح.`);
        } else {
            console.error("⚠️ فشل التحديث التلقائي للأسعار:", result.error);
        }
    } catch (error) {
        console.error("❌ خطأ فادح في مهمة تحديث الأسعار:", error);
    }
}, AUTO_SYNC_INTERVAL);

// 🧹 Cleanup logs (runs daily)
const DAILY_INTERVAL = 24 * 60 * 60 * 1000;
setInterval(async () => {
    try {
        console.log("🧹 جاري فحص وتنظيف السجلات القدبدة...");
        const result = await cleanupOldLogsInternal();
        if (result.success && result.count > 0) {
            console.log(`✅ تم حذف ${result.count} سجل قديم مر عليها أكثر من شهر.`);
        }
    } catch (error) {
        console.error("❌ خطأ فادح في مهمة تنظيف السجلات:", error);
    }
}, DAILY_INTERVAL);

const FINAL_PORT = process.env.PORT || 5850;
app.listen(FINAL_PORT, "0.0.0.0", () => {
    console.log(`🚀 السيرفر شغال ومثالي على بورت ${FINAL_PORT}`);
});
