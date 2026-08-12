const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI || !process.env.MONGODB_URI.startsWith('mongodb')) {
            throw new Error('MONGODB_URI مفقود أو غير صحيح في ملف .env');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB متصل');

        // فحص جاهزية المتغيرات الأساسية لإبلاغ المطور
        const services = {
            "حماية الأدمن": !!process.env.ADMIN_PASSWORD_HASH,
            "توقيع الجلسات": !!process.env.JWT_SECRET,
            "إشعارات تلجرام": !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
        };
        
        console.log('🛡️ حالة الخدمات الأساسية:');
        Object.entries(services).forEach(([name, status]) => {
            console.log(`${status ? '✅' : '❌'} ${name}: ${status ? 'جاهز' : 'غير معرف في .env'}`);
        });

    } catch (err) {
        console.error('⚠️ MongoDB غير متصل:', err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
