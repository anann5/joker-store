const dotenv = require('dotenv');
dotenv.config();

const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/database');
const { validateEnv } = require('./config/envCheck');
const app = require('./app');
const { syncInventoryInternal } = require('./controllers/productController');
const { cleanupOldLogsInternal } = require('./controllers/logController');
const { verifyAdminSocket } = require('./controllers/authController');
const registry = require('./providers/registry');

validateEnv();

connectDB();

const server = http.createServer(app);

// WebSocket for real-time admin notifications.
// - Same-origin only (CORS disabled for cross-origin).
// - Every socket must authenticate with the admin HttpOnly cookie
//   before it can join the 'admins' room or receive any event.
const io = new Server(server, {
    cors: { origin: false, methods: ['GET', 'POST'] },
    serveClient: false
});

io.use((socket, next) => {
    // Reject cross-origin handshakes (defense in depth).
    const { origin, host } = socket.handshake.headers;
    if (origin && host && origin !== `http://${host}` && origin !== `https://${host}`) {
        return next(new Error('cross-origin connections are not allowed'));
    }
    return verifyAdminSocket(socket, next);
});

io.on('connection', (socket) => {
    console.log(`🔌 WebSocket admin connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`🔌 WebSocket admin disconnected: ${socket.id}`);
    });
});

// Make io accessible to routes
app.set('io', io);

// مزامنة الأسعار تلقائياً من المزودين (الفترة بالساعات قابلة للضبط عبر SYNC_INTERVAL_HOURS)
// هذا يبقي المتجر "صاحياً" على تغيّرات الأسعار لدى المزودين.
const SYNC_INTERVAL_HOURS = Math.max(1, Number.parseInt(process.env.SYNC_INTERVAL_HOURS, 10) || 6);
const AUTO_SYNC_INTERVAL = SYNC_INTERVAL_HOURS * 60 * 60 * 1000;
const runPriceSync = async () => {
    try {
        console.log('🔄 جاري بدء مراقبة وتحديث الأسعار من المزودين...');
        const result = await syncInventoryInternal();
        if (result.success) {
            console.log(`✅ تم تحديث ${result.count} منتج بناءً على الأسعار الجديدة لهوامش الربح.`);
        } else {
            console.error('⚠️ فشل التحديث التلقائي للأسعار:', result.error);
        }
    } catch (error) {
        console.error('❌ خطأ فادح في مهمة تحديث الأسعار:', error);
    }
};

setInterval(runPriceSync, AUTO_SYNC_INTERVAL);

// مزامنة أولية بعد إقلاع السيرفر (إن وُجد مزودون معدّون) لضمان أسعار حديثة فوراً
const hasConfiguredProviders = registry.getProviders().length > 0;
if (hasConfiguredProviders) {
    const INITIAL_SYNC_DELAY = Math.max(10, Number.parseInt(process.env.INITIAL_SYNC_DELAY_SEC, 10) || 30) * 1000;
    setTimeout(() => {
        console.log(`🔄 مزامنة أولية بعد الإقلاع (${registry.getProviders().length} مزود)...`);
        runPriceSync();
    }, INITIAL_SYNC_DELAY);
}

const DAILY_INTERVAL = 24 * 60 * 60 * 1000;
setInterval(async () => {
    try {
        console.log('🧹 جاري فحص وتنظيف السجلات القديمة...');
        const result = await cleanupOldLogsInternal();
        if (result.success && result.count > 0) {
            console.log(`✅ تم حذف ${result.count} سجل قديم مر عليها أكثر من شهر.`);
        }
    } catch (error) {
        console.error('❌ خطأ فادح في مهمة تنظيف السجلات:', error);
    }
}, DAILY_INTERVAL);

const FINAL_PORT = process.env.PORT || 5850;
// الاستماع على '::' يجعل الخادم يتلقى الوصول عبر IPv6 (`localhost` → ::1) ويدعم IPv4 أيضاً.
server.listen(FINAL_PORT, '::', () => {
    console.log(`🚀 السيرفر شغال ومثالي على بورت ${FINAL_PORT}`);
});
