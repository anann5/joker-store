require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('../models');
const fxPricing = require('../providers/fxPricing');

/**
 * ترحيل أسعار المنتجات إلى التسعير التلقائي بالدولار.
 * ---------------------------------------------------
 * الأسعار الحالية في قاعدة البيانات كُتبت كدولار في لوحة الإدارة
 * (حقل "السعر (دولار)") لكنها كانت تُعرض وتُحصَّل كشيكل.
 * هذا السكربت:
 *   1. يعتبر price الحالي = priceUsd.
 *   2. يفعّل autoPrice.
 *   3. يحسب price بالشيكل بعد الصرف: +5₪ (أقل من 50) أو +15%، ثم تقريب لأعلى لعدد صحيح.
 *
 * التشغيل الآمن (معاينة فقط، لا يكتب شيئاً):
 *   node scripts/migrate_fx_pricing.js
 *
 * التطبيق الفعلي (السعر الحالي = سعر البيع بالدولار):
 *   node scripts/migrate_fx_pricing.js --apply
 *
 * أو إذا كان السعر الحالي يشمل هامشاً قديماً وتريد استرجاع التكلفة أولاً:
 *   node scripts/migrate_fx_pricing.js --apply --from-cost
 */
async function migrate() {
    const apply = process.argv.includes('--apply');
    const fromCost = process.argv.includes('--from-cost');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ تم الاتصال بقاعدة البيانات');

    const rate = await fxPricing.getCurrentRate();
    console.log(`💱 سعر الصرف الحالي: 1 USD = ${rate.toFixed(4)} ILS`);

    const products = await Product.find({
        $or: [{ autoPrice: { $ne: true } }, { priceUsd: { $lte: 0 } }]
    }).select('productName price priceUsd autoPrice profitMargin profitMarginOverride');

    if (products.length === 0) {
        console.log('ℹ️ لا توجد منتجات بحاجة للترحيل.');
        await mongoose.disconnect();
        return;
    }

    const rows = products.map(product => {
        const current = Number(product.priceUsd) > 0
            ? Number(product.priceUsd)
            : Number(product.price);
        const margin = Number(product.profitMargin) >= 1 ? Number(product.profitMargin) : 1.1;
        const usd = fromCost ? current / margin : current;
        const nextPrice = fxPricing.computeIlsPrice(usd, rate, product);
        return {
            id: String(product._id),
            name: product.productName?.ar || product.productName?.en || '',
            oldPrice: Number(product.price),
            priceUsd: usd,
            nextPrice
        };
    });

    console.log(`\n📋 المعاينة (${fromCost ? 'السعر الحالي ÷ الهامش = تكلفة USD' : 'price الحالي = USD'}):`);
    rows.forEach(row => {
        console.log(`- ${row.name} | ${row.oldPrice} USD → ${row.priceUsd.toFixed(2)} × ${rate.toFixed(4)} → ${row.nextPrice} ₪`);
    });

    if (!apply) {
        console.log('\nℹ️ معاينة فقط. أضف --apply لتطبيق التغييرات.');
        await mongoose.disconnect();
        return;
    }

    const now = new Date();
    let updated = 0;
    for (const row of rows) {
        // eslint-disable-next-line no-await-in-loop -- ترحيل تسلسلي متعمد
        const result = await Product.updateOne(
            { _id: row.id },
            {
                $set: {
                    priceUsd: row.priceUsd,
                    priceSourceCurrency: 'USD',
                    autoPrice: true,
                    price: row.nextPrice,
                    priceCurrency: 'ILS',
                    lastFxRate: rate,
                    lastFxSyncAt: now,
                    updatedAt: now
                }
            }
        );
        if (result.modifiedCount > 0) updated++;
    }

    console.log(`\n✅ تم ترحيل ${updated} منتج إلى التسعير التلقائي بالدولار.`);
    await mongoose.disconnect();
}

migrate().catch(async (err) => {
    console.error('❌ خطأ فادح:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
