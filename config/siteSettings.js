// إعدادات الموقع العامة المكشوفة للواجهة (أرقام الدفع، روابط التواصل)
// ⚠️ لا تضع أرقاماً أو إحصائيات وهمية — القيم الفارغة تُخفي العنصر في الواجهة.

module.exports = {
    payment: {
        // أرقام حسابات الدفع — تُضبط في .env؛ تبقى فارغة (ويُخفى خيار الدفع) إن لم تُضبط
        jawwalNumber: process.env.JAWWAL_PAY_NUMBER || '',
        palpayNumber: process.env.PALPAY_NUMBER || '',
        refaktNumber: process.env.REFAKT_NUMBER || ''
    },
    currency: {
        // عملة المتجر (رمز العملة + رمز العرض) — تُعرض للواجهة لعرض الأسعار
        code: (process.env.STORE_CURRENCY || 'ILS').toUpperCase(),
        symbol: process.env.STORE_CURRENCY_SYMBOL || '₪'
    },
    social: {
        // روابط التواصل — تُضبط في .env؛ تبقى فارغة (ويُخفى الرابط) إن لم تُضبط
        whatsapp: process.env.WHATSAPP_NUMBER || '',
        telegram: process.env.TELEGRAM_LINK || '',
        instagram: process.env.INSTAGRAM_LINK || '',
        tiktok: process.env.TIKTOK_LINK || ''
    }
};
