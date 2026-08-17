// ======================================================
// محرك تسعير المتجر (Pricing Engine)
// ------------------------------------------------------
// سعر البيع يُحسب بـ «ربح ثابت حسب طبقة سعر الشراء» (الافتراضي):
//   سعر شراء أقل من 50   → ربح 5
//   سعر شراء 50–99       → ربح 10
//   سعر شراء 100–199     → ربح 15
//   سعر شراء 200 أو أكثر → ربح 20
// ويُقرَّب سعر البيع دائماً لعشرة أو نصف عشرة (0 أو 5).
//
// تُضبط الحدود وقيم الربح عبر متغيرات البيئة (اختياري):
//   PROFIT_TIER_UNDER_50 = 5
//   PROFIT_TIER_UNDER_100 = 10
//   PROFIT_TIER_UNDER_200 = 15
//   PROFIT_TIER_200_PLUS = 20
//
// كما يبقى دعم النسبة المئوية (هامش الربح) كتجاوز اختياري:
//   ترتيب تحديد الهامش لمنتج: تجاوز المنتج > الفئة > المزود > DEFAULT_PROFIT_MARGIN
//   وفي حال عدم ضبط أي هامش يُطبَّق ربح الطبقات تلقائياً.
// ======================================================

const DEFAULT_MARGIN = Number.parseFloat(process.env.DEFAULT_PROFIT_MARGIN);
const PRICE_MAX_CHANGE_RATIO = Number.parseFloat(process.env.PRICE_MAX_CHANGE_RATIO);

/**
 * طبقات الربح الثابت (قابلة للضبط من البيئة).
 * تُحسب حسب سعر الشراء (السعر الأساسي).
 */
const PROFIT_TIERS = [
    { max: 50, profit: effectiveNumber(process.env.PROFIT_TIER_UNDER_50, 5) },
    { max: 100, profit: effectiveNumber(process.env.PROFIT_TIER_UNDER_100, 10) },
    { max: 200, profit: effectiveNumber(process.env.PROFIT_TIER_UNDER_200, 15) },
    { max: Infinity, profit: effectiveNumber(process.env.PROFIT_TIER_200_PLUS, 20) }
];

/**
 * الربح الثابت المناسب لسعر شراء معيّن.
 * @returns {number|null} الربح، أو null عند مدخل غير صالح
 */
function tierProfit(basePrice) {
    const base = Number(basePrice);
    if (!Number.isFinite(base) || base <= 0) return null;
    for (const tier of PROFIT_TIERS) {
        if (base < tier.max) return tier.profit;
    }
    return PROFIT_TIERS[PROFIT_TIERS.length - 1].profit;
}

function effectiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * توحيد إدخال هامش الربح إلى مضاعف (multiplier):
 *   1.15  → 1.15  (مضاعف +15%)
 *   15    → 1.15  (نسبة مئوية +15%)
 *   0.30  → 1.30  (كسر نسبي +30%)
 * يعيد null عند قيمة غير صالحة.
 */
function normalizeMargin(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.endsWith('%')) {
            const percent = Number.parseFloat(trimmed);
            return Number.isFinite(percent) && percent > 0 ? 1 + percent / 100 : null;
        }
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    if (parsed < 1) return 1 + parsed;
    if (parsed > 10) return 1 + parsed / 100;
    return parsed;
}

/**
 * تقريب سعر إلى رقم صحيح ينتهي بـ 0 أو 5 (بدون كسور وأرقام مثل 1/2/3/4).
 * مثال: 71 → 70، 73 → 75، 88 → 90.
 */
function roundWhole(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.round(parsed / 5) * 5;
}

/**
 * الهامش الافتراضي لفئة محددة عبر CATEGORY_MARGIN_<KEY>.
 */
function categoryMargin(category) {
    if (!category) return null;
    const value = Number.parseFloat(process.env[`CATEGORY_MARGIN_${category.toUpperCase()}`]);
    return Number.isFinite(value) && value >= 1 ? value : null;
}

/**
 * تحديد هامش الربح للمنتج/المزود.
 * يعيد null عند عدم ضبط أي هامش (حينها يُطبَّق ربح الطبقات الثابت).
 */
function getMarginForProduct(product, provider) {
    if (product?.profitMarginOverride) {
        const normalized = normalizeMargin(product.profitMargin);
        if (normalized !== null && normalized >= 1) return normalized;
    }
    const byCategory = categoryMargin(product?.category || provider?.defaultCategory);
    if (byCategory) return byCategory;
    if (provider?.margin) {
        const normalized = normalizeMargin(provider.margin);
        if (normalized !== null && normalized >= 1) return normalized;
    }
    if (Number.isFinite(DEFAULT_MARGIN) && DEFAULT_MARGIN > 0) return DEFAULT_MARGIN;
    return null;
}

/**
 * تقريب إلى أعلى رقم ينتهي بـ 0 أو 5 (لا يقل أبداً عن القيمة).
 * مثال: 11 → 15، 62 → 65، 88 → 90.
 */
function ceilWhole(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.ceil(parsed / 5) * 5;
}

/**
 * حساب سعر البيع.
 * - إن وُجد هامش ربح (تجاوز يدوي) يُطبَّق كنسبة مئوية/مضاعف.
 * - وإلا يُضاف ربح ثابت حسب طبقة سعر الشراء (tierProfit).
 * يُقرَّب سعر البيع دائماً لأقرب 0/5 دون أن يقل عن سعر الشراء.
 * @returns {number|null} سعر البيع، أو null عند إدخال غير صالح
 */
function computeSellingPrice({ basePrice, margin }) {
    const base = Number(basePrice);
    if (basePrice == null || !Number.isFinite(base) || base <= 0) return null;

    let raw;
    if (margin !== null && margin !== undefined && margin !== '') {
        const ratio = normalizeMargin(margin);
        if (ratio === null || ratio < 1) return null;
        raw = base * ratio;
    } else {
        const profit = tierProfit(base);
        if (profit === null) return null;
        raw = base + profit;
    }

    const nearest = roundWhole(raw);
    // لا نبيع بدون ربح: إن حذف التقريب الربح، قرّب لأعلى
    if (nearest <= base) return ceilWhole(raw);
    return nearest;
}

/**
 * نسبة التغير بين السعر الجديد والقديم (لسعر الأساس لدى المزود).
 */
function priceChangeRatio(newBase, oldBase) {
    const current = Number(newBase);
    const previous = Number(oldBase);
    if (!Number.isFinite(current) || current <= 0) return null;
    if (!Number.isFinite(previous) || previous <= 0) return null;
    return current / previous;
}

/**
 * هل السعر الجديد مريب لدرجة تمنع تحديثه تلقائياً؟
 * (حماية من أخطاء المزود/انقطاع الخدمة — يحتفظ بالسعر القديم ويرسل تنبيهاً)
 */
function isSuspicious(newBase, oldBase, maxChangeRatio = PRICE_MAX_CHANGE_RATIO) {
    const current = Number(newBase);
    if (!Number.isFinite(current) || current <= 0) return true;
    const ratio = priceChangeRatio(current, oldBase);
    if (ratio === null) return false;
    return ratio > effectiveNumber(maxChangeRatio, 4);
}

module.exports = {
    computeSellingPrice,
    getMarginForProduct,
    priceChangeRatio,
    isSuspicious,
    categoryMargin,
    normalizeMargin,
    roundWhole,
    ceilWhole,
    tierProfit
};
