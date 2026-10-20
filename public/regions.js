/**
 * المناطق (Regions) — وحدة مشتركة للواجهة.
 * ------------------------------------------------------------------
 * - توحّد أي قيمة منطقة قادمة من الخادم (TR / Turkey / تركيا → tr)
 * - توفّر الاسم والأيقونة/العلم لكل منطقة
 * - تُستخدم في فلترة المنتجات وشارات البطاقات في script.js
 *
 * ملاحظة: يجب أن تبقى متوافقة مع providers/regions.js على الخادم.
 */

export const REGION_ORDER = [
    'global', 'us', 'tr', 'ae', 'sa', 'eu', 'vn', 'cn', 'gb',
    'iq', 'jo', 'eg', 'kw', 'qa', 'om', 'bh', 'ps',
    'in', 'id', 'my', 'ph', 'pk', 'ru', 'br', 'ca', 'au', 'mx',
    'de', 'fr', 'es', 'it', 'nl', 'pl'
];

const REGION_META = {
    global: { ar: 'عالمي', en: 'Global', flag: '' },
    us: { ar: 'أمريكي', en: 'American', flag: 'us.png' },
    tr: { ar: 'تركي', en: 'Turkish', flag: 'tr.png' },
    ae: { ar: 'إماراتي', en: 'Emirati', flag: 'ae.png' },
    sa: { ar: 'سعودي', en: 'Saudi', flag: 'sa.png' },
    vn: { ar: 'فيتنامي', en: 'Vietnamese', flag: 'vn.png' },
    cn: { ar: 'صيني', en: 'Chinese', flag: 'cn.png' },
    eu: { ar: 'أوروبي', en: 'European', flag: '' },
    gb: { ar: 'بريطاني', en: 'British', flag: '' },
    iq: { ar: 'عراقي', en: 'Iraqi', flag: '' },
    jo: { ar: 'أردني', en: 'Jordanian', flag: '' },
    eg: { ar: 'مصري', en: 'Egyptian', flag: '' },
    kw: { ar: 'كويتي', en: 'Kuwaiti', flag: '' },
    qa: { ar: 'قطري', en: 'Qatari', flag: '' },
    om: { ar: 'عماني', en: 'Omani', flag: '' },
    bh: { ar: 'بحريني', en: 'Bahraini', flag: '' },
    ps: { ar: 'فلسطيني', en: 'Palestinian', flag: '' },
    in: { ar: 'هندي', en: 'Indian', flag: '' },
    id: { ar: 'إندونيسي', en: 'Indonesian', flag: '' },
    my: { ar: 'ماليزي', en: 'Malaysian', flag: '' },
    ph: { ar: 'فلبيني', en: 'Filipino', flag: '' },
    pk: { ar: 'باكستاني', en: 'Pakistani', flag: '' },
    ru: { ar: 'روسي', en: 'Russian', flag: '' },
    br: { ar: 'برازيلي', en: 'Brazilian', flag: '' },
    ca: { ar: 'كندي', en: 'Canadian', flag: '' },
    au: { ar: 'أسترالي', en: 'Australian', flag: '' },
    mx: { ar: 'مكسيكي', en: 'Mexican', flag: '' },
    de: { ar: 'ألماني', en: 'German', flag: '' },
    fr: { ar: 'فرنسي', en: 'French', flag: '' },
    es: { ar: 'إسباني', en: 'Spanish', flag: '' },
    it: { ar: 'إيطالي', en: 'Italian', flag: '' },
    nl: { ar: 'هولندي', en: 'Dutch', flag: '' },
    pl: { ar: 'بولندي', en: 'Polish', flag: '' }
};

const ALIASES = {
    global: 'global', worldwide: 'global', world: 'global', all: 'global', any: 'global',
    'region free': 'global', 'كل المناطق': 'global', 'جميع المناطق': 'global',

    us: 'us', usa: 'us', 'united states': 'us', 'united states of america': 'us',
    america: 'us', american: 'us', 'الولايات المتحدة': 'us',

    tr: 'tr', turkey: 'tr', turkiye: 'tr', turkish: 'tr', 'تركيا': 'tr', 'تركي': 'tr',

    ae: 'ae', uae: 'ae', 'u a e': 'ae', 'united arab emirates': 'ae',
    emirates: 'ae', emirati: 'ae', 'اماراتي': 'ae',

    sa: 'sa', ksa: 'sa', saudi: 'sa', 'saudi arabia': 'sa', 'سعودي': 'sa',
    eu: 'eu', europe: 'eu', 'european union': 'eu', european: 'eu', 'اوروبي': 'eu',
    vn: 'vn', vietnam: 'vn', 'viet nam': 'vn', vietnamese: 'vn', 'فيتنامي': 'vn',
    cn: 'cn', china: 'cn', 'mainland china': 'cn', chinese: 'cn', 'صيني': 'cn',
    gb: 'gb', uk: 'gb', 'united kingdom': 'gb', 'great britain': 'gb', britain: 'gb', england: 'gb',
    iq: 'iq', iraq: 'iq', jo: 'jo', jordan: 'jo', eg: 'eg', egypt: 'eg',
    kw: 'kw', kuwait: 'kw', qa: 'qa', qatar: 'qa', om: 'om', oman: 'om',
    bh: 'bh', bahrain: 'bh', ps: 'ps', palestine: 'ps',
    in: 'in', india: 'in', id: 'id', indonesia: 'id', my: 'my', malaysia: 'my',
    ph: 'ph', philippines: 'ph', pk: 'pk', pakistan: 'pk',
    ru: 'ru', russia: 'ru', br: 'br', brazil: 'br', ca: 'ca', canada: 'ca',
    au: 'au', australia: 'au', mx: 'mx', mexico: 'mx',
    de: 'de', germany: 'de', fr: 'fr', france: 'fr', es: 'es', spain: 'es',
    it: 'it', italy: 'it', nl: 'nl', netherlands: 'nl', pl: 'pl', poland: 'pl',

    'عالمي': 'global', 'الإمارات': 'ae', 'الامارات': 'ae',
    'السعودية': 'sa', 'فيتنام': 'vn', 'الصين': 'cn', 'أمريكا': 'us', 'امريكا': 'us',
    'أوروبا': 'eu', 'اوروبا': 'eu', 'العراق': 'iq', 'الأردن': 'jo', 'الاردن': 'jo',
    'مصر': 'eg', 'الكويت': 'kw', 'قطر': 'qa', 'عمان': 'om', 'البحرين': 'bh',
    'فلسطين': 'ps', 'الهند': 'in', 'ماليزيا': 'my', 'باكستان': 'pk',
    'روسيا': 'ru', 'البرازيل': 'br', 'كندا': 'ca', 'ألمانيا': 'de', 'المانيا': 'de',
    'فرنسا': 'fr', 'إسبانيا': 'es', 'اسبانيا': 'es', 'إيطاليا': 'it', 'ايطاليا': 'it',
    'هولندا': 'nl', 'بولندا': 'pl'
};

function normalizeKey(value) {
    const raw = value === null || value === undefined ? '' : value;
    return String(raw)
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

// نُطبّع مفاتيح الأسماء البديلة مرة واحدة حتى تتوافق مع normalizeKey
// (مثلاً "الإمارات" تُخزَّن كـ "الامارات").
const ALIAS_MAP = Object.create(null);
for (const [alias, code] of Object.entries(ALIASES)) {
    const key = normalizeKey(alias);
    if (key) ALIAS_MAP[key] = code;
}

/**
 * تحويل أي قيمة منطقة إلى رمز موحّد (tr/us/global...).
 * @param {*} value
 * @param {string} [fallback='global']
 * @returns {string}
 */
export function normalizeRegion(value, fallback = 'global') {
    const key = normalizeKey(value);
    if (!key) return fallback;
    if (ALIAS_MAP[key]) return ALIAS_MAP[key];
    const [first] = key.split(' ');
    if (ALIAS_MAP[first]) return ALIAS_MAP[first];
    if (/^[a-z]{2}$/.test(first)) return first;
    return fallback;
}

/**
 * بيانات عرض المنطقة (اسم عربي/إنجليزي + ملف العلم إن وُجد).
 * @param {string} code
 */
export function regionMeta(code) {
    const normalized = normalizeRegion(code, 'global');
    const meta = REGION_META[normalized];
    if (meta) return { code: normalized, ...meta };
    const label = normalized.toUpperCase();
    return { code: normalized, ar: label, en: label, flag: '' };
}

/**
 * اسم المنطقة حسب اللغة الحالية.
 * @param {string} code
 * @param {string} lang
 */
export function regionLabel(code, lang) {
    const meta = regionMeta(code);
    return (lang === 'en' ? meta.en : meta.ar) || meta.en;
}
