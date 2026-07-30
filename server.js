const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const connectDB = require("./config/database");
const adminRoutes = require("./routes/adminRoutes");
const storeRoutes = require("./routes/storeRoutes");
const rateLimit = require("express-rate-limit"); // يتطلب تثبيت: npm install express-rate-limit
const { syncInventoryInternal, cleanupOldLogsInternal } = require("./controllers/adminController");

const app = express();

// 🛡️ Security Middlewares
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://www.gstatic.com", "https://www.google.com"],
            styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://www.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:", "http://localhost:5850"],
            connectSrc: ["'self'", "http://localhost:5850", "ws://localhost:5850", "http://127.0.0.1:*"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [], // تعطيل الإجبار على HTTPS أثناء العمل محلياً
        },
    },
}));

// 🚦 Rate Limiting: حماية ضد الإغراق وهجمات التخمين
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // حد أقصى 100 طلب من نفس الـ IP
    message: "عدد طلبات كبير جداً، يرجى المحاولة لاحقاً."
});
app.use("/api/", limiter);

app.use(express.json({ limit: "10kb" }));

// Sanitize inputs
app.use((req, res, next) => {
    const sanitize = (obj) => {
        if (obj && typeof obj === "object") {
            for (const key in obj) {
                if (key.startsWith("$") || key.includes(".")) delete obj[key];
                else if (typeof obj[key] === "object") sanitize(obj[key]);
            }
        }
    };
    sanitize(req.body); sanitize(req.params); sanitize(req.query);
    next();
});

// Database Connection
connectDB();

// 📂 ملفات الواجهة (Static Files)
app.use(express.static(path.join(__dirname, 'public')));
// السماح بالوصول للملفات الموجودة في المجلد الرئيسي أيضاً
app.use(express.static(__dirname));

// 🌐 توجيه المسارات الأساسية لضمان عدم ظهور "Cannot GET"
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/login.html", (req, res) => { // Explicit route for login.html
    res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/admin.html", (req, res) => { // Explicit route for admin.html
    res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "login.html"));
});

// 🌐 Routes
app.use("/api/admin", adminRoutes);
app.use("/api", storeRoutes);

// ⏳ أتمتة مراقبة الأسعار: تعمل كل 6 ساعات تلقائياً
const AUTO_SYNC_INTERVAL = 6 * 60 * 60 * 1000; // 6 ساعات بالملي ثانية
setInterval(async () => {
    console.log("🔄 جاري البدء في مراقبة وتحديث الأسعار من المزودين...");
    const result = await syncInventoryInternal();
    if (result.success) {
        console.log(`✅ تم تحديث ${result.count} منتج بناءً على الأسعار الجديدة لهوامش الربح.`);
    } else {
        console.error("⚠️ فشل التحديث التلقائي للأسعار:", result.error);
    }
}, AUTO_SYNC_INTERVAL);

// 🧹 تنظيف تلقائي للسجلات: يعمل مرة كل 24 ساعة لحذف السجلات الأقدم من شهر
const DAILY_INTERVAL = 24 * 60 * 60 * 1000;
setInterval(async () => {
    console.log("🧹 جاري فحص وتنظيف السجلات القديمة...");
    const result = await cleanupOldLogsInternal();
    if (result.success && result.count > 0) {
        console.log(`✅ تم حذف ${result.count} سجل قديم مر عليها أكثر من شهر.`);
    }
}, DAILY_INTERVAL);

const FINAL_PORT = process.env.PORT || 5850;
app.listen(FINAL_PORT, "0.0.0.0", () => {
    console.log(`🚀 السيرفر شغال ومثالي على بورت ${FINAL_PORT}`);
});