const { Promotion, Product } = require('../models');

// تطبيع الكود: كبير + بدون مسافات + صيغة صحيحة (3-20: أحرف/أرقام/شرطات)
function normalizeCode(code) {
    if (!code || typeof code !== 'string') return null;
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Za-z0-9-]{3,20}$/.test(normalized)) return null;
    return normalized;
}

function findActivePromo(normalized) {
    return Promotion.findOne({
        code: normalized,
        isActive: true,
        expiresAt: { $gt: new Date() }
    });
}

// هل ينطبق العرض على هذا المنتج تحديداً (منتج أو قسم)؟
function promoMatchesProduct(promo, product) {
    if (!promo || !product) return false;
    const matchesProduct = promo.productId && String(promo.productId) === String(product._id);
    const matchesCategory = promo.category && promo.category === product.category;
    return Boolean(matchesProduct || matchesCategory);
}

// فحص قائمة منتجات كاملة مقابل عرض محمّل مسبقاً — لا يُسمح بالرفض إلا لكامل القائمة
function evaluateMatches(promo, products) {
    const list = Array.isArray(products) ? products : [];
    if (list.length === 0) return { ok: false, error: 'not_applicable' };
    for (const product of list) {
        if (!promoMatchesProduct(promo, product)) {
            return { ok: false, error: 'not_applicable' };
        }
    }
    return { ok: true, discountPercent: Number(promo.discountPercent) || 0 };
}

/**
 * تطبيق كود خصم على منتج معيّن (للتحقق الفردي من الواجهة).
 * @param {object} params - { code, productId }
 * @returns {Promise<{ok:boolean, error?} | {ok:true, discountPercent, finalUnitPrice}>}
 */
async function applyPromoCode({ code, productId } = {}) {
    const normalized = normalizeCode(code);
    if (!normalized) return { ok: false, error: 'invalid' };

    const promo = await findActivePromo(normalized);
    if (!promo) return { ok: false, error: 'invalid' };

    if (!productId || typeof productId !== 'string') {
        return { ok: false, error: 'not_applicable' };
    }

    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) return { ok: false, error: 'not_applicable' };

    if (!promoMatchesProduct(promo, product)) {
        return { ok: false, error: 'not_applicable' };
    }

    const discountPercent = Number(promo.discountPercent) || 0;
    const price = Number(product.price) || 0;
    const finalUnitPrice = Math.round(price * (100 - discountPercent) / 100 * 100) / 100;

    return { ok: true, discountPercent, finalUnitPrice };
}

/**
 * التحقق من تطبيق كود الخصم على مجموعة منتجات كاملة (السلة).
 * يُرفض العرض إذا لم ينطبق على كل منتج مميز في القائمة — يمنع الثغرة
 * التي كانت تخصم منتجات لا يغطيها الكود (الخلط بين منتجات مشمولة وغير مشمولة).
 * @param {object} params - { code, products } (مستندات المنتجات الجاهزة من السلة)
 * @returns {Promise<{ok:boolean, error?} | {ok:true, discountPercent}>}
 */
async function applyPromoCodeToProducts({ code, products } = {}) {
    const normalized = normalizeCode(code);
    if (!normalized) return { ok: false, error: 'invalid' };

    const promo = await findActivePromo(normalized);
    if (!promo) return { ok: false, error: 'invalid' };

    return evaluateMatches(promo, products);
}

/**
 * نسخة applyPromoCodeToProducts لاستقبال قائمة معرّفات من العميل
 * (تُستخدم في مسار /promotions/validate عند إرسال السلة كاملة).
 * التحقق من وجود العرض النشط أولاً لتفادي استعلامات غير ضرورية.
 * @param {object} params - { code, productIds }
 */
async function applyPromoCodeToProductIds({ code, productIds } = {}) {
    const normalized = normalizeCode(code);
    if (!normalized) return { ok: false, error: 'invalid' };

    const promo = await findActivePromo(normalized);
    if (!promo) return { ok: false, error: 'invalid' };

    const ids = (Array.isArray(productIds) ? productIds : [])
        .filter(id => typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id));
    if (ids.length === 0) return { ok: false, error: 'not_applicable' };

    const products = await Product.find({ _id: { $in: ids } });
    return evaluateMatches(promo, products);
}

// تقريب مبلغ إلى منزلتين عشريتين للعملة
function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

module.exports = {
    applyPromoCode,
    applyPromoCodeToProducts,
    applyPromoCodeToProductIds,
    promoMatchesProduct,
    round2
};
