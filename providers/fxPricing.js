const { Product } = require('../models');
const currency = require('./currency');
const pricing = require('./pricing');

// ======================================================
// أسعار الدولار التلقائية (FX Pricing)
// ------------------------------------------------------
// المنتجات التي عليها autoPrice=true وpriceUsd>0:
//   التحويل = priceUsd × سعر صرف عملة المنتج (priceSourceCurrency) → ILS اليومي
//   - إذا كان الناتج أقل من 50 ₪: يُضاف 5 ₪ ربح.
//   - إذا كان 50 ₪ أو أكثر: يُضاف 15% على سعر المنتج.
//   - السعر النهائي يُقرَّب لأعلى إلى أقرب عدد صحيح (بلا كسور).
//   مثال: 10 × 3.098 = 30.98 → +5 → 35.98 → 36
// - يمكن تجاوز القاعدة بنسبة مئوية عبر profitMarginOverride + profitMargin.
// - تُحدَّث تلقائياً عند بدء التشغيل وكل FX_PRICE_REFRESH_HOURS ساعة.
// - تُحدَّث أيضاً عند فتح المتجر إذا مرّ FX_PRICE_STALE_HOURS على آخر تحديث.
// - الدفع يعيد الحساب بسعر الصرف الحالي كمرجع نهائي.
// ======================================================

const REFRESH_HOURS = Math.max(1, Number.parseInt(process.env.FX_PRICE_REFRESH_HOURS, 10) || 6);
const STALE_HOURS = Math.max(1, Number.parseInt(process.env.FX_PRICE_STALE_HOURS, 10) || 12);
const MIN_RUN_INTERVAL_MS = 60 * 1000;
const SMALL_PRICE_THRESHOLD = Math.max(1, Number.parseFloat(process.env.FX_SMALL_PRICE_THRESHOLD) || 50);
const SMALL_PRICE_PROFIT = Math.max(0, Number.parseFloat(process.env.FX_SMALL_PRICE_PROFIT) || 5);
const LARGE_PRICE_MARGIN = (Math.max(0, Number.parseFloat(process.env.FX_LARGE_PRICE_MARGIN_PERCENT) || 15)) / 100;

const STALE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

let lastRunAt = 0;
let lastStaleCheckAt = 0;
let lastRate = null;
let inflight = null;
let started = false;

function normalizeCurrencyCode(value) {
    const code = String(value || 'USD').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : 'USD';
}

/**
 * سعر تحويل عملة واحدة إلى الشيكل.
 */
async function getRateToIls(currencyCode) {
    const code = normalizeCurrencyCode(currencyCode);
    if (code === 'ILS') return 1;
    return currency.getRate(code, 'ILS');
}

/**
 * أسعار التحويل لكل عملات المنتجات التلقائية (مفتاحها رمز العملة).
 * @returns {Promise<Map<string, number>>}
 */
async function getRatesForProducts(products) {
    const codes = [...new Set((products || [])
        .filter(product => product && product.autoPrice)
        .map(product => normalizeCurrencyCode(product.priceSourceCurrency)))];

    const entries = await Promise.all(codes.map(async code => {
        try {
            return [code, await getRateToIls(code)];
        } catch (_err) {
            return [code, null];
        }
    }));
    return new Map(entries);
}

/**
 * السعر النهائي بالشيكل بعد الصرف:
 * - أقل من 50 ₪: +5 ₪
 * - 50 ₪ وأكثر: +15%
 * ثم تقريب لأعلى إلى أقرب عدد صحيح.
 * مثال: 10 × 3.098 = 30.98 → +5 → 35.98 → 36.
 */
function computeIlsPrice(amount, rate, product = null) {
    const value = Number(amount);
    const fx = Number(rate);
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (!Number.isFinite(fx) || fx <= 0) return 0;

    const converted = value * fx;
    const overrideMargin = product && product.profitMarginOverride
        ? pricing.normalizeMargin(product.profitMargin)
        : null;

    let raw;
    if (overrideMargin !== null && overrideMargin >= 1) {
        raw = converted * overrideMargin;
    } else if (converted < SMALL_PRICE_THRESHOLD) {
        raw = converted + SMALL_PRICE_PROFIT;
    } else {
        raw = converted * (1 + LARGE_PRICE_MARGIN);
    }

    return Math.ceil(raw - 1e-9);
}

async function getCurrentRate() {
    const rate = await currency.getRate('USD', 'ILS');
    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('سعر صرف الدولار غير متاح');
    }
    lastRate = rate;
    return rate;
}

/**
 * تحديث أسعار كل المنتجات ذات التسعير التلقائي.
 * @param {{force?: boolean, rate?: number}} options
 */
async function refreshAutoPrices({ force = false, rate = null } = {}) {
    if (inflight) return inflight;
    if (!force && lastRunAt && Date.now() - lastRunAt < MIN_RUN_INTERVAL_MS) {
        return { success: true, skipped: true, rate: lastRate, updated: 0 };
    }

    inflight = (async () => {
        const products = await Product.find({ autoPrice: true, priceUsd: { $gt: 0 } })
            .select('_id price priceUsd priceSourceCurrency profitMargin profitMarginOverride')
            .lean();

        if (products.length === 0) {
            lastRunAt = Date.now();
            return { success: true, updated: 0, checked: 0 };
        }

        const codes = [...new Set(products.map(product => normalizeCurrencyCode(product.priceSourceCurrency)))];
        const forcedUsdRate = Number.isFinite(Number(rate)) && Number(rate) > 0 ? Number(rate) : null;
        const rateEntries = await Promise.all(codes.map(async code => {
            if (code === 'USD' && forcedUsdRate) return [code, forcedUsdRate];
            try {
                return [code, await getRateToIls(code)];
            } catch (_err) {
                return [code, null];
            }
        }));
        const rates = new Map(rateEntries);

        const now = new Date();
        const operations = products
            .filter(product => Number(rates.get(normalizeCurrencyCode(product.priceSourceCurrency))) > 0)
            .map(product => {
                const code = normalizeCurrencyCode(product.priceSourceCurrency);
                const fxRate = rates.get(code);
                return {
                    updateOne: {
                        filter: { _id: product._id },
                        update: {
                            $set: {
                                price: computeIlsPrice(product.priceUsd, fxRate, product),
                                priceCurrency: 'ILS',
                                lastFxRate: fxRate,
                                lastFxSyncAt: now
                            }
                        }
                    }
                };
            });

        if (operations.length > 0) {
            await Product.bulkWrite(operations, { ordered: false });
        }
        lastRunAt = Date.now();
        lastRate = forcedUsdRate || rates.get('USD') || lastRate;
        return { success: true, updated: operations.length, checked: products.length, rates: Object.fromEntries(rates) };
    })().finally(() => {
        inflight = null;
    });

    return inflight;
}

async function refreshIfStale() {
    if (lastStaleCheckAt && Date.now() - lastStaleCheckAt < STALE_CHECK_INTERVAL_MS) {
        return { success: true, skipped: true, updated: 0 };
    }
    lastStaleCheckAt = Date.now();
    const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
    const stale = await Product.exists({
        autoPrice: true,
        priceUsd: { $gt: 0 },
        $or: [{ lastFxSyncAt: null }, { lastFxSyncAt: { $lt: cutoff } }]
    });
    if (!stale) return { success: true, skipped: true, updated: 0 };
    return refreshAutoPrices({ force: true });
}

/**
 * السعر النهائي بالشيكل لمنتج (يُستخدم عند إنشاء الطلب).
 * يرجع price المحفوظ إذا لم يكن المنتج تلقائياً أو تعذّر السعر.
 */
function resolveUnitPrice(product, rates) {
    if (!product || !product.autoPrice || !(Number(product.priceUsd) > 0)) {
        return Number(product && product.price) || 0;
    }

    const code = normalizeCurrencyCode(product.priceSourceCurrency);
    const rawRate = rates instanceof Map
        ? rates.get(code)
        : (typeof rates === 'number' && code === 'USD' ? rates : null);
    const fx = Number(rawRate);

    return Number.isFinite(fx) && fx > 0
        ? computeIlsPrice(product.priceUsd, fx, product)
        : Number(product.price) || 0;
}

function start() {
    if (started) return;
    started = true;
    setTimeout(() => {
        refreshIfStale().catch(err => console.error('[fx] فشل التحديث الأولي:', err.message));
    }, 20 * 1000);
    setInterval(() => {
        refreshAutoPrices({ force: true }).catch(err => console.error('[fx] فشل تحديث الأسعار:', err.message));
    }, REFRESH_HOURS * 60 * 60 * 1000);
}

module.exports = {
    REFRESH_HOURS,
    STALE_HOURS,
    computeIlsPrice,
    getCurrentRate,
    getRateToIls,
    getRatesForProducts,
    normalizeCurrencyCode,
    refreshAutoPrices,
    refreshIfStale,
    resolveUnitPrice,
    start
};
