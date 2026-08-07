const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('./config/database');
const app = require('./app');
const { syncInventoryInternal, cleanupOldLogsInternal } = require('./controllers/adminController');

connectDB();

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
        console.log('🧹 جاري فحص وتنظيف السجلات القدبدة...');
        const result = await cleanupOldLogsInternal();
        if (result.success && result.count > 0) {
            console.log(`✅ تم حذف ${result.count} سجل قديم مر عليها أكثر من شهر.`);
        }
    } catch (error) {
        console.error('❌ خطأ فادح في مهمة تنظيف السجلات:', error);
    }
}, DAILY_INTERVAL);

const FINAL_PORT = process.env.PORT || 5850;
app.listen(FINAL_PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر شغال ومثالي على بورت ${FINAL_PORT}`);
});
