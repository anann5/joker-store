// إعدادات الموقع العامة المكشوفة للواجهة (أرقام الدفع، روابط التواصل، الإحصائيات)
// ⚠️ ضع القيم الحقيقية في .env أو املأها هنا مباشرة

function getNumber(envName, fallback) {
    const value = process.env[envName];
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
    payment: {
        // أرقام حسابات الدفع التي تظهر للمشتري في صفحة الدفع
        jawwalNumber: process.env.JAWWAL_PAY_NUMBER || '059XXXXXXX',
        palpayNumber: process.env.PALPAY_NUMBER || '9XXXXX'
    },
    social: {
        // روابط التواصل — ضع القيم الحقيقية في .env
        whatsapp: process.env.WHATSAPP_NUMBER || '',
        telegram: process.env.TELEGRAM_LINK || '',
        instagram: process.env.INSTAGRAM_LINK || '',
        tiktok: process.env.TIKTOK_LINK || ''
    },
    stats: {
        // إحصائيات المتجر المعروضة في الواجهة (قيم افتراضية تُستبدل ببيانات حقيقية)
        customers: getNumber('STAT_CUSTOMERS', 2500),
        orders: getNumber('STAT_ORDERS', 8500),
        deliveryMinutes: getNumber('STAT_DELIVERY_MIN', 10),
        supportHours: getNumber('STAT_SUPPORT_HOURS', 24)
    }
};
