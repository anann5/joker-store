require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('../models');
const currency = require('../providers/currency');

/**
 * تحويل أسعار المنتجات من الدولار إلى الشيكل (مرة واحدة).
 * ------------------------------------------------------------------
 * - يجلب سعر الصرف الحالي (USD → ILS) من خدمة أسعار الصرف تلقائياً.
 * - يحوّل price و basePrice لكل منتج لم يتم تحويله بعد (priceCurrency !== ILS).
 * - علامة التحويل تُكتب في حقل priceCurrency حتى لا تتكرر العملية.
 *
 * الاستخدام:  node scripts/convert_currency_ils.js
 */
async function convertCurrencyToILS() {
    if (currency.STORE_CURRENCY !== 'ILS') {
        console.warn(`⚠️ STORE_CURRENCY=${currency.STORE_CURRENCY} في .env — يجب أن يكون ILS أولاً.`);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ تم الاتصال بقاعدة البيانات');

    const rate = await currency.getRate('USD', 'ILS');
    console.log(`💱 سعر الصرف الحالي: 1 USD = ${rate.toFixed(4)} ILS`);

    const products = await Product.find({ priceCurrency: { $ne: 'ILS' } });
    if (products.length === 0) {
        console.log('ℹ️ لا توجد منتجات بحاجة للتحويل (تم التحويل مسبقاً).');
        process.exit(0);
    }

    let updated = 0;
    for (const product of products) {
        try {
            if (Number(product.price) > 0) {
                product.price = currency.roundMoney(Number(product.price) * rate);
            }
            if (Number(product.basePrice) > 0) {
                product.basePrice = currency.roundMoney(Number(product.basePrice) * rate);
                product.lastProviderPrice = product.basePrice;
            }
            product.priceCurrency = 'ILS';
            product.updatedAt = new Date();
            // eslint-disable-next-line no-await-in-loop -- تحويل تسلسلي متعمد لمنع سباقات الكتابة
            await product.save();
            updated++;
        } catch (err) {
            console.error(`❌ فشل تحويل المنتج ${product._id}: ${err.message}`);
        }
    }

    console.log(`✅ تم تحويل ${updated} منتج من أصل ${products.length} إلى الشيكل بسعر ${rate.toFixed(4)} ₪/USD.`);
    console.log('⚠️  ملاحظة: نفّذ هذا السكربت مرة واحدة فقط. الأسعار المستقبلية من المزودين ستُحوَّل تلقائياً.');
    process.exit(0);
}

convertCurrencyToILS().catch((err) => {
    console.error('❌ خطأ فادح:', err);
    process.exit(1);
});
