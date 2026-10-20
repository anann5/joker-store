/**
 * تطبيع المناطق (Regions) — مصدر واحد للحقيقة بين المزوّدين والواجهة.
 * ----------------------------------------------------------------------
 * مشكلة الواقع: كل مزوّد يرسل المنطقة بصيغة مختلفة
 *   "TR" / "Turkey" / "Türkiye" / "تركيا" / "us-east" / "United States"
 * فنوحّدها إلى رمز قصير ثابت (tr, us, ae, ...) حتى:
 *   1) تتجمّع نفس السلعة من مزوّدين مختلفين في نفس المنطقة (bestPrice)
 *   2) تعمل فلترة الواجهة بدقة
 *   3) يمكن لكل مزوّد تحديد المناطق التي يدعمها (PROVIDER_n_REGIONS)
 */

const REGION_ALIASES = Object.create(null);

/**
 * توحيد شكل المفتاح قبل البحث: حروف صغيرة، بلا تشكيل/همزات، بلا رموز.
 */
function normalizeKey(value) {
    return String(value == null ? '' : value)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u064B-\u0655\u0670\u06D6-\u06ED]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[_\-.()[\]/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function register(code, aliases) {
    REGION_ALIASES[code] = code;
    for (const alias of aliases) {
        const key = normalizeKey(alias);
        if (key) REGION_ALIASES[key] = code;
    }
}

register('global', ['global', 'worldwide', 'world', 'all', 'any', 'region free', 'عالمي', 'كل المناطق', 'جميع المناطق']);
register('us', ['us', 'usa', 'united states', 'united states of america', 'america', 'american', 'امريكا', 'امريكي', 'الولايات المتحدة']);
register('tr', ['tr', 'turkey', 'turkiye', 'turkish', 'تركيا', 'تركي']);
register('ae', ['ae', 'uae', 'u a e', 'united arab emirates', 'emirates', 'emirati', 'الامارات', 'اماراتي']);
register('sa', ['sa', 'ksa', 'saudi', 'saudi arabia', 'السعوديه', 'سعودي']);
register('eu', ['eu', 'europe', 'european union', 'european', 'اوروبا', 'اوروبي']);
register('vn', ['vn', 'vietnam', 'viet nam', 'vietnamese', 'فيتنام', 'فيتنامي']);
register('cn', ['cn', 'china', 'mainland china', 'chinese', 'الصين', 'صيني']);
register('gb', ['gb', 'uk', 'united kingdom', 'great britain', 'britain', 'england', 'بريطانيا']);
register('iq', ['iq', 'iraq', 'العراق']);
register('jo', ['jo', 'jordan', 'الاردن']);
register('eg', ['eg', 'egypt', 'مصر']);
register('kw', ['kw', 'kuwait', 'الكويت']);
register('qa', ['qa', 'qatar', 'قطر']);
register('om', ['om', 'oman', 'عمان']);
register('bh', ['bh', 'bahrain', 'البحرين']);
register('ps', ['ps', 'palestine', 'فلسطين']);
register('in', ['in', 'india', 'الهند']);
register('id', ['id', 'indonesia', 'اندونيسيا']);
register('my', ['my', 'malaysia', 'ماليزيا']);
register('ph', ['ph', 'philippines', 'الفلبين']);
register('pk', ['pk', 'pakistan', 'باكستان']);
register('ru', ['ru', 'russia', 'روسيا']);
register('br', ['br', 'brazil', 'البرازيل']);
register('ca', ['ca', 'canada', 'كندا']);
register('au', ['au', 'australia', 'استراليا']);
register('mx', ['mx', 'mexico', 'المكسيك']);
register('de', ['de', 'germany', 'المانيا']);
register('fr', ['fr', 'france', 'فرنسا']);
register('es', ['es', 'spain', 'اسبانيا']);
register('it', ['it', 'italy', 'ايطاليا']);
register('nl', ['nl', 'netherlands', 'هولندا']);
register('pl', ['pl', 'poland', 'بولندا']);

/**
 * تحويل أي قيمة منطقة إلى رمز موحّد.
 * @param {*} value - القيمة الخام من المزوّد أو الطلب
 * @param {string} [fallback='global'] - القيمة عند التعذّر
 * @returns {string} رمز المنطقة (مثل tr/us/global)
 */
function normalizeRegion(value, fallback = 'global') {
    const key = normalizeKey(value);
    if (!key) return fallback;
    if (REGION_ALIASES[key]) return REGION_ALIASES[key];
    const first = key.split(' ')[0];
    if (REGION_ALIASES[first]) return REGION_ALIASES[first];
    if (/^[a-z]{2}$/.test(first)) return first;
    return fallback;
}

/**
 * قراءة قائمة مناطق مدعومة من متغيّر بيئة (مثل "tr,us,ae").
 * @returns {string[]|null} null يعني «كل المناطق مسموحة»
 */
function parseRegionList(value) {
    if (value == null) return null;
    const list = String(value)
        .split(',')
        .map(item => normalizeRegion(item, ''))
        .filter(Boolean);
    return list.length ? [...new Set(list)] : null;
}

/**
 * هل يدعم المزوّد هذه المنطقة؟ (بلا قائمة = يدعم الكل)
 */
function isRegionAllowed(provider, region) {
    const allowed = provider && Array.isArray(provider.regions) ? provider.regions : null;
    if (!allowed || allowed.length === 0) return true;
    return allowed.includes(normalizeRegion(region));
}

module.exports = { normalizeRegion, normalizeKey, parseRegionList, isRegionAllowed };
