// ======================================================
//  ⚙️ عملة المتجر وعملة العرض (تُضبط من /api/site-config)
//  العملة الرسمية هي عملة المتجر، ويُعرض الدولار بسعر الصرف اليومي.
// ======================================================

const PREF_KEY = 'joker_display_currency';
const SUPPORTED_DISPLAY = ['ILS', 'USD'];
const CURRENCY_SYMBOLS = { ILS: '₪', USD: '$' };

let storeCode = 'ILS';
let storeSymbol = '₪';
let ilsPerUsd = null;
let rateUpdatedAt = null;
let preferredCode = readPreference();
let displayCode = storeCode;

function readPreference() {
    try {
        const stored = localStorage.getItem(PREF_KEY);
        return SUPPORTED_DISPLAY.includes(stored) ? stored : null;
    } catch (_err) {
        return null;
    }
}

function isAvailable(currencyCode) {
    if (!SUPPORTED_DISPLAY.includes(currencyCode)) return false;
    if (currencyCode === storeCode) return true;
    return Number.isFinite(ilsPerUsd) && ilsPerUsd > 0;
}

function formatAmount(value, currencyCode) {
    const numeric = Number(value);
    const safe = Number.isFinite(numeric) ? numeric : 0;
    const rounded = Math.round((safe + Number.EPSILON) * 100) / 100;

    if (currencyCode === 'USD') {
        return `$${rounded.toFixed(2)}`;
    }

    const hasFraction = Math.abs(rounded - Math.round(rounded)) > 0.0001;
    const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: hasFraction ? 2 : 0,
        maximumFractionDigits: 2
    }).format(rounded);
    return `${formatted} ${CURRENCY_SYMBOLS[currencyCode] || storeSymbol}`;
}

function convertFromStore(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    if (displayCode === storeCode) return numeric;
    if (!Number.isFinite(ilsPerUsd) || ilsPerUsd <= 0) return numeric;
    if (storeCode === 'ILS' && displayCode === 'USD') return numeric / ilsPerUsd;
    if (storeCode === 'USD' && displayCode === 'ILS') return numeric * ilsPerUsd;
    return numeric;
}

/**
 * ضبط عملة المتجر وإعدادات سعر الصرف من /api/site-config.
 * @param {object|string} config إعدادات العملة أو رمز العملة (للتوافق).
 * @param {string} [maybeSymbol] رمز العملة عند تمرير رمز نصي.
 */
export function setCurrency(config, maybeSymbol) {
    if (config && typeof config === 'object') {
        if (typeof config.code === 'string' && config.code.trim()) storeCode = config.code.trim().toUpperCase();
        if (typeof config.symbol === 'string' && config.symbol.trim()) storeSymbol = config.symbol.trim();
        const rate = Number(config.ilsPerUsd);
        ilsPerUsd = Number.isFinite(rate) && rate > 0 ? rate : null;
        rateUpdatedAt = config.rateUpdatedAt || null;
    } else {
        if (typeof config === 'string' && config.trim()) storeCode = config.trim().toUpperCase();
        if (typeof maybeSymbol === 'string' && maybeSymbol.trim()) storeSymbol = maybeSymbol.trim();
    }

    if (!CURRENCY_SYMBOLS[storeCode] && storeSymbol) {
        CURRENCY_SYMBOLS[storeCode] = storeSymbol;
    }
    displayCode = isAvailable(preferredCode) ? preferredCode : storeCode;
}

export function getCurrency() {
    return { code: storeCode, symbol: storeSymbol, ilsPerUsd, rateUpdatedAt };
}

export function getDisplayCurrency() {
    return {
        code: displayCode,
        symbol: CURRENCY_SYMBOLS[displayCode] || storeSymbol,
        storeCode,
        storeSymbol,
        ilsPerUsd,
        rateUpdatedAt,
        available: SUPPORTED_DISPLAY.filter(isAvailable),
        isConverted: displayCode !== storeCode
    };
}

/**
 * تغيير عملة العرض وحفظ التفضيل. لا يعيد تحميل الصفحة.
 * @returns {boolean} false إذا كانت العملة غير متاحة (مثلاً بلا سعر صرف).
 */
export function setDisplayCurrency(currencyCode) {
    const code = String(currencyCode || '').toUpperCase();
    if (!isAvailable(code)) return false;
    displayCode = code;
    preferredCode = code;
    try {
        localStorage.setItem(PREF_KEY, code);
    } catch (_err) {
        // التخزين المحلي غير متاح — يبقى التغيير للجلسة الحالية.
    }
    return true;
}

/**
 * سعر المنتج بعملة العرض المختارة (قد يكون تقريبياً للدولار).
 */
export function formatPrice(value) {
    return formatAmount(convertFromStore(value), displayCode);
}

/**
 * مبلغ معاملة (سلة/دفع/فاتورة) بعملة المتجر الرسمية دائماً.
 */
export function formatStorePrice(value) {
    return formatAmount(value, storeCode);
}
