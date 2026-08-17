// ======================================================
// محرك أفضل سعر عبر المزودين (Best Price Engine)
// ------------------------------------------------------
// أهدافه:
//   1) توحيد اسم المنتج (تطبيع) حتى تتطابق نفس السلعة عند مزودين مختلفين
//      حتى لو اختلف شكل الاسم: "PUBG 100 UC" ⇔ "pubg 100 uc" ⇔ "ببجي 100"
//   2) بناء مفتاح مجموعة (groupKey) = الفئة + المنطقة + الاسم الموحّد
//   3) ترتيب عروض المجموعة من الأرخص إلى الأغلى ليُعتمد الأرخص
//      في المتجر وتُحفظ البقية كخيارات بديلة للتسليم (fallback)
// ======================================================

// تشكيل الحروف العربية والحروف غير الضرورية للتمييز بين السلع
const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640]/g;

/**
 * تطبيع اسم منتج لتوحيد الصيغ المختلفة عبر المزودين.
 * - يحوّل إلى أحرف صغيرة
 * - يزيل التشكيل العربي والرموز غير الأبجدية الرقمية
 * - يوحّد المسافات
 * @returns {string} الاسم الموحّد (قد يكون فارغاً)
 */
function normalizeName(value) {
    return String(value == null ? '' : value)
        .normalize('NFKC')
        .toLowerCase()
        .replace(ARABIC_DIACRITICS, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * بناء مفتاح المجموعة الذي يحدد أن عدة منتجات من مزودين هي نفس السلعة.
 * المفتاح = الفئة :: المنطقة :: الاسم الموحّد.
 * @returns {string|null} المفتاح، أو null إن لم تتوفر معلومات كافية
 */
function buildGroupKey({ category, region, name }) {
    const normalized = normalizeName(name);
    if (!normalized) return null;
    return [String(category || 'other').trim(), String(region || 'global').trim(), normalized].join('::');
}

/**
 * ترتيب عروض مجموعة من الأرخص إلى الأغلى.
 * @param {Array<{ id: string, basePrice: number }>} members
 * @returns {Array} أعضاء مرتّبة تصاعدياً بالسعر (ثم بالمعرّف للحسم عند التساوي)
 */
function rankGroup(members) {
    return [...members]
        .filter(member => Number(member.basePrice) > 0)
        .sort((a, b) => (Number(a.basePrice) - Number(b.basePrice)) || String(a.id).localeCompare(String(b.id)));
}

module.exports = {
    normalizeName,
    buildGroupKey,
    rankGroup
};