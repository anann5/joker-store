const axios = require('axios');

// ======================================================
// محرك العملات (Currency Engine)
// ------------------------------------------------------
// - عملة المتجر الأساسية تُضبط عبر STORE_CURRENCY (افتراضي ILS = شيكل)
// - رمز العملة المعروض يُضبط عبر STORE_CURRENCY_SYMBOL (افتراضي ₪)
// - أسعار الصرف:
//     1) تجاوز يدوي:  FX_<FROM>_<TO>=value  (مثال FX_USD_ILS=3.75)
//     2) تلقائي:      خدمة open.er-api.com المجانية بأساس دولار مع كاش لمدة FX_CACHE_TTL_MIN
//     3) عند غياب أي سعر -> إلقاء خطأ واضح وعدم تصحيح السعر
// - ملاحظة: تُجلب الأسعار بأساس USD دائماً ثم تُسوّى، فمحرك التحويل مبني على الدولار
// ======================================================

const STORE_CURRENCY = (process.env.STORE_CURRENCY || 'ILS').toUpperCase();
const STORE_CURRENCY_SYMBOL = process.env.STORE_CURRENCY_SYMBOL || '₪';
const FX_CACHE_TTL_MS = Math.max(1, Number.parseInt(process.env.FX_CACHE_TTL_MIN, 10) || 60) * 60 * 1000;
const FX_API_URL = process.env.FX_API_URL || 'https://open.er-api.com/v6/latest/USD';

let cachedUsdRates = null;   // { CURRENCY: units per 1 USD }
let cachedAt = 0;
let inflightFetch = null;

/**
 * قراءة أسعار الصرف اليدوية من متغيرات البيئة FX_<FROM>_<TO>.
 * القيمة = عدد وحدات TO مقابل وحدة FROM واحدة.
 */
function manualRates() {
    const rates = {};
    for (const key of Object.keys(process.env)) {
        const match = /^FX_([A-Z]{3})_([A-Z]{3})$/.exec(key);
        if (!match) continue;
        const value = Number.parseFloat(process.env[key]);
        if (Number.isFinite(value) && value > 0) {
            rates[`${match[1]}_${match[2]}`] = value;
        }
    }
    return rates;
}

/**
 * تحويل سعر FX_<FROM>_<TO> يدوي إلى أسعار نسبية للدولار (USD base).
 * @returns {{ [currency]: number }} عدد وحدات العملة مقابل 1 دولار
 */
function manualRatesToUsdBase() {
    const manual = manualRates();
    const usdBase = { USD: 1 };
    for (const [pair, rate] of Object.entries(manual)) {
        const [from, to] = pair.split('_');
        if (from === 'USD') usdBase[to] = rate;
    }
    return usdBase;
}

async function fetchRatesFromApi() {
    const headers = {};
    if (process.env.FX_API_KEY) headers['Authorization'] = `Bearer ${process.env.FX_API_KEY}`;
    const response = await axios.get(FX_API_URL, { timeout: 15000, headers });
    const data = response.data || {};
    const rates = data.rates;
    if (!rates || typeof rates !== 'object') {
        throw new Error('استجابة خدمة أسعار الصرف غير صالحة');
    }

    // تسوية الأسعار إلى أساس الدولار (USD) لأن محرك التحويل مبني على الدولار.
    // بعض الخدمات تُرجع base_code مختلفاً (مثل ILS عند الطلب منها مباشرة).
    const baseCode = String(data.base_code || data.base || '').toUpperCase();
    if (baseCode && baseCode !== 'USD' && Number(rates.USD) > 0) {
        const usdPerBase = Number(rates.USD);
        const normalized = { USD: 1 };
        for (const [currency, rate] of Object.entries(rates)) {
            const numeric = Number(rate);
            if (Number.isFinite(numeric) && numeric > 0) {
                normalized[currency] = numeric / usdPerBase;
            }
        }
        return normalized;
    }
    return rates;
}

/**
 * جلب أسعار الصرف من الخدمة التلقائية مع كاش وتزامن للحماية من ازدحام الطلبات.
 */
async function getUsdRates() {
    if (cachedUsdRates && Date.now() - cachedAt < FX_CACHE_TTL_MS) {
        return cachedUsdRates;
    }
    if (!inflightFetch) {
        inflightFetch = fetchRatesFromApi()
            .then(rates => {
                cachedUsdRates = rates;
                cachedAt = Date.now();
                return rates;
            })
            .finally(() => {
                inflightFetch = null;
            });
    }
    return inflightFetch;
}

/**
 * سعر التحويل من عملة إلى أخرى.
 * @returns {Promise<number>} قيمة وحدة FROM بالعملة TO
 */
async function getRate(from, to) {
    const fromC = String(from).toUpperCase();
    const toC = String(to).toUpperCase();
    if (fromC === toC) return 1;

    const manual = manualRates()[`${fromC}_${toC}`];
    if (Number.isFinite(manual) && manual > 0) return manual;

    const usdBase = { ...manualRatesToUsdBase(), ...(cachedUsdRates || {}) };
    let rates = usdBase;
    if (!(fromC in rates) || !(toC in rates)) {
        try {
            rates = { ...usdBase, ...(await getUsdRates()) };
        } catch (err) {
            throw new Error(`لا يوجد سعر صرف متاح للتحويل ${fromC} → ${toC}: ${err.message}`);
        }
    }
    if (!(fromC in rates) || !(toC in rates)) {
        throw new Error(`لا يوجد سعر صرف متاح للتحويل ${fromC} → ${toC}`);
    }

    const amountUsd = fromC === 'USD' ? 1 : 1 / rates[fromC];
    return toC === 'USD' ? amountUsd : amountUsd * rates[toC];
}

/**
 * تحويل مبلغ من عملة إلى أخرى.
 */
async function convert(amount, from, to) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) {
        throw new Error(`مبلغ غير صالح للتحويل: ${amount}`);
    }
    const rate = await getRate(from, to);
    return numeric * rate;
}

/**
 * تقريب مبلغ مالي إلى منزلتين عشريتين.
 */
function roundMoney(value) {
    return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));
}

/**
 * مسح الكاش (يُستخدم عند طلب تحديث فوري لأسعار الصرف).
 */
function clearCache() {
    cachedUsdRates = null;
    cachedAt = 0;
}

async function status() {
    const manual = manualRates();
    let source = Object.keys(manual).length > 0 ? 'manual' : 'none';
    let updatedAt = cachedAt ? new Date(cachedAt).toISOString() : null;
    if (cachedUsdRates) source = source === 'manual' ? 'manual+api' : 'api';
    return {
        code: STORE_CURRENCY,
        symbol: STORE_CURRENCY_SYMBOL,
        storeCurrency: STORE_CURRENCY,
        source,
        updatedAt,
        manualOverrides: Object.keys(manual).length
    };
}

module.exports = {
    STORE_CURRENCY,
    STORE_CURRENCY_SYMBOL,
    convert,
    getRate,
    roundMoney,
    clearCache,
    status,
    _internal: { manualRates, getUsdRates }
};
