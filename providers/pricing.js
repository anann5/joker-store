// ======================================================
// محرك هوامش الربح (Pricing Engine)
// ------------------------------------------------------
// سعر البيع = السعر الأساسي (بعملة المتجر) × هامش الربح
//
// ترتيب تحديد الهامش لمنتج:
//   1) هامش مخصص للمنتج (profitMarginOverride=true)  ← يلتزم به دائماً
//   2) هامش افتراضي للفئة:  CATEGORY_MARGIN_STEAM=1.15
//   3) هامش افتراضي للمزود:  PROVIDER_<n>_MARGIN
//   4) هامش عام:  DEFAULT_PROFIT_MARGIN (افتراضي 1.10)
// ======================================================

const DEFAULT_MARGIN = Number.parseFloat(process.env.DEFAULT_PROFIT_MARGIN);
const PRICE_MAX_CHANGE_RATIO = Number.parseFloat(process.env.PRICE_MAX_CHANGE_RATIO);

function effectiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
 * تحديد هامش الربح الصحيح لمنتج/مزود.
 */
function getMarginForProduct(product, provider) {
    if (product?.profitMarginOverride && Number(product.profitMargin) >= 1) {
        return Number(product.profitMargin);
    }
    const byCategory = categoryMargin(product?.category || provider?.defaultCategory);
    if (byCategory) return byCategory;
    if (provider?.margin) return provider.margin;
    return effectiveNumber(DEFAULT_MARGIN, 1.10);
}

/**
 * حساب سعر البيع من السعر الأساسي والهامش.
 * @returns {number|null} سعر مدوّر، أو null عند إدخال غير صالح
 */
function computeSellingPrice({ basePrice, margin }) {
    const base = Number(basePrice);
    const ratio = Number(margin);
    if (basePrice == null || !Number.isFinite(base) || base <= 0) return null;
    if (!Number.isFinite(ratio) || ratio < 1) return null;
    return Math.round((base * ratio + Number.EPSILON) * 100) / 100;
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
    categoryMargin
};
