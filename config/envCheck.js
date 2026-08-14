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
 * المتغيرات الاختيارية (Stripe/Telegram/...) تُسجَّل كتنبيه فقط.
 */
function validateEnv() {
    const missingRequired = REQUIRED_VARS
        .filter(({ name }) => !process.env[name])
        .map(({ name, hint }) => `${name} (${hint})`);

    if (missingRequired.length > 0) {
        console.warn('\n⚠️  متغيرات أساسية ناقصة في بيئة التشغيل:');
        missingRequired.forEach((missing) => console.warn(`   - ${missing}`));
        console.warn('   تحقق من ملف .env أو من إعدادات الاستضافة.\n');
    }

    const optionalWarnings = [];
    if (!process.env.SITE_URL) {
        optionalWarnings.push('SITE_URL غير مضبوط — sitemap.xml سيرجع 503 حتى يُحدد');
    }
    if (!process.env.STRIPE_SECRET_KEY) {
        optionalWarnings.push('STRIPE_SECRET_KEY غير مضبوط — بوابة Stripe غير مفعلة');
    }
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
        optionalWarnings.push('TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID غير مضبوطين — تنبيهات Telegram غير مفعلة');
    }
    if (!process.env.JWT_USER_SECRET) {
        optionalWarnings.push('JWT_USER_SECRET غير مضبوط — سجلات مستخدمين غير آمنة في الإنتاج');
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