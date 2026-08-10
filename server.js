const dotenv = require('dotenv');
dotenv.config();

const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/database');
const app = require('./app');
const { syncInventoryInternal } = require('./controllers/productController');
const { cleanupOldLogsInternal } = require('./controllers/logController');

connectDB();

const server = http.createServer(app);

// WebSocket for real-time notifications
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {
    console.log(`🔌 WebSocket client connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`🔌 WebSocket client disconnected: ${socket.id}`);
    });
});

// Make io accessible to routes
app.set('io', io);

const AUTO_SYNC_INTERVAL = 6 * 60 * 60 * 1000;
setInterval(async () => {
    try {
        console.log('🔄 جاري البدء في مراقبة وتحديث الأسعار من المزودين...');
        const result = await syncInventoryInternal();
        if (result.success) {
            console.log(`✅ تم تحديث ${result.count} منتج بناءً على الأسعار الجديدة لهوامش الربح.`);
        } else {
            console.error('⚠️ فشل التحديث التلقائي للأسعار:', result.error);
        }
    } catch (error) {
        console.error('❌ خطأ فادح في مهمة تحديث الأسعار:', error);
    }
}, AUTO_SYNC_INTERVAL);

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
server.listen(FINAL_PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر شغال ومثالي على بورت ${FINAL_PORT}`);
});
