const dotenv = require('dotenv');
dotenv.config();

const REQUIRED_VARS = [
    { name: 'MONGODB_URI', hint: 'اتصال قاعدة بيانات MongoDB' },
    { name: 'JWT_SECRET', hint: 'مفتاح توقيع JWT للأدمن' },
    { name: 'ADMIN_PASSWORD_HASH', hint: 'تجزئة bcrypt لكلمة مرور الأدمن' }
];

/**
 * تحقق من المتغيرات الأساسية عند الإقلاع.
 * يعرض تحذيراً واضحاً للمتغيرات المطلوبة الناقصة بدل فشل غامض لاحقاً.
 * المتغيرات الاختيارية (Telegram/Email/Push/...) تُسجَّل كتنبيه فقط.
 */
function validateEnv() {
    const isProduction = process.env.NODE_ENV === 'production';
    const missingRequired = REQUIRED_VARS
        .filter(({ name }) => !process.env[name])
        .map(({ name, hint }) => `${name} (${hint})`);

    // في الإنتاج لا يُسمح بالرجوع إلى JWT_SECRET لتوقيع جلسات المستخدمين:
    // فصل المفتاحين يمنع أي تداخل بين صلاحيات الأدمن والمستخدمين.
    if (isProduction && !process.env.JWT_USER_SECRET) {
        missingRequired.push('JWT_USER_SECRET (مفتاح توقيع جلسات المستخدمين — إلزامي في الإنتاج)');
    }

    if (missingRequired.length > 0) {
        console.warn('\n⚠️  متغيرات أساسية ناقصة في بيئة التشغيل:');
        missingRequired.forEach((missing) => console.warn(`   - ${missing}`));
        console.warn('   تحقق من ملف .env أو من إعدادات الاستضافة.\n');
    }

    const optionalWarnings = [];
    if (!process.env.SITE_URL) {
        optionalWarnings.push('SITE_URL غير مضبوط — sitemap.xml سيرجع 503 حتى يُحدد');
    }
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
        optionalWarnings.push('TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID غير مضبوطين — تنبيهات Telegram غير مفعلة');
    }
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        optionalWarnings.push('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY غير مضبوطين — إشعارات Web Push غير مفعلة');
    }

    if (optionalWarnings.length > 0) {
        console.warn('ℹ️  تنبيهات اختيارية:');
        optionalWarnings.forEach((warning) => console.warn(`   - ${warning}`));
        console.warn('');
    }

    return {
        missingRequired,
        optionalWarnings
    };
}

module.exports = { validateEnv, REQUIRED_VARS };