// ======================================================
// حساب المخزون المتاح — مصدر واحد للحقيقة بين العرض والشراء
// ------------------------------------------------------
// القاعدة: لا نبيع منتجاً خارجياً لا نعرف مخزونه.
//   providerStock = null / undefined  → غير معروف ⇒ يُعامل كغير متوفر
//   providerStock = 0                 → نافد فعلاً
//   providerStock > 0                 → الكمية المتاحة عند المزوّد
//
// هذا يمنع الحالة السابقة التي كان فيها المنتج الخارجي بلا مزوّد مهيّأ
// يظهر «متاحاً» ويُقبل طلبه ثم يتعذّر تسليمه بعد استلام المال.
// ======================================================

function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

/**
 * الكمية المعروضة للعميل.
 * المنتجات المحلية تُحسب من الأكواد غير المستهلكة، والخارجية من مخزون المزوّد.
 */
function computeAvailableStock(product) {
    if (!product) return 0;

    if (product.isExternal) {
        const stock = toFiniteNumber(product.providerStock);
        if (stock === null || stock <= 0) return 0;
        return Math.floor(stock);
    }

    const codes = Array.isArray(product.codes) ? product.codes : [];
    return codes.filter(code => code && code.status === 'available').length;
}

/**
 * هل يمكن تنفيذ الكمية المطلوبة فعلياً من هذا المنتج؟
 * تُستخدم عند إنشاء الطلب كحاجز أخير حتى لو تجاوز العميل الواجهة.
 */
function hasEnoughStock(product, quantity) {
    const qty = Math.max(0, Math.floor(toFiniteNumber(quantity) || 0));
    if (!product || qty <= 0) return false;
    return computeAvailableStock(product) >= qty;
}

/**
 * هل يظهر هذا المنتج في المتجر أصلاً؟
 * نفس قاعدة withDeliverableStock لكن على كائن جاهز:
 *   - المحلي: يظهر دائماً (نقص المخزون يُعرض «نفد» لا إخفاء)
 *   - الخارجي: يظهر فقط إذا كان مخزون المزوّد معروفاً وموجباً
 */
function isDeliverable(product) {
    if (!product) return false;
    if (!product.isExternal) return true;
    return computeAvailableStock(product) > 0;
}

/**
 * يضيف شرط «قابل للتسليم» إلى استعلامات واجهة المتجر:
 * المنتجات المحلية تمر دائماً (تُفحص أكوادها عند العرض/الطلب)،
 * والخارجية تظهر فقط إذا كان مخزون المزوّد معروفاً وموجباً.
 *
 * يُستخدم في كل استعلامات العرض والبحث والخرائط حتى لا يظهر منتج
 * خارجي بلا مزوّد ولا مخزون — بدل عرضه «غير متوفر».
 */
function withDeliverableStock(filter = {}) {
    const clause = {
        $or: [
            { isExternal: { $ne: true } },
            { providerStock: { $gt: 0 } }
        ]
    };
    const existingAnd = Array.isArray(filter.$and) ? filter.$and : [];
    return { ...filter, $and: [...existingAnd, clause] };
}

module.exports = {
    computeAvailableStock,
    hasEnoughStock,
    isDeliverable,
    withDeliverableStock
};
