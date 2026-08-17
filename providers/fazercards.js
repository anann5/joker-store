// ======================================================
// محول FazerCards (Adapter خاص)
// ------------------------------------------------------
// FazerCards سرعات API ذات كتالوج هرمي (فئات ← عروض) وشراء
// غير متزامن (وضع طلب ثم جلب النتيجة حتى اكتمال الترميز).
// هذه الطبقة تحوّل ذلك كله إلى نفس الواجهة الموحّدة
// (fetchCatalog / fetchBalance / purchaseItem / normalizeItem)
// حتى يعمل معها محرك المزامنة ومحرك أفضل سعر دون تغيير.
//
// الأطراف:
//   GET  <base>/giftcards             → فئات بطاقات الهدايا
//   GET  <base>/giftcards/cards       → عروض بطاقة (card_id, price_usd, stock)
//   GET  <base>/gamekeys              → فئات مفاتيح الألعاب (game_id, region)
//   GET  <base>/gamekeys/keys         → مفاتيح (key_id, price_usd, stock)
//   POST <base>/giftcards/order       → { category_id, card_id, quantity }
//   POST <base>/gamekeys/order        → { game_id, key_id, quantity }
//   GET  <base>/orders/:id            → حالة الطلب حتى completed والترميز
//   GET  <base>/balance               → { ok, balance, currency }
// المصادقة: X-API-Key: KEY
// ======================================================

const axios = require('axios');
const { buildGroupKey } = require('./bestPrice');

const TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.PROVIDER_TIMEOUT_MS, 10) || 15000);
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 20;

const STORE_CATEGORIES = new Set([
    'gaming_general', 'pubg', 'fortnite', 'playstation', 'xbox',
    'microsoft_windows', 'adobe', 'antivirus', 'vpn', 'google',
    'itunes', 'razer_gold', 'amazon', 'steam'
]);

const STORE_REGIONS = new Set(['global', 'us', 'tr', 'eu', 'sa']);

const KIND_GIFT_CARD = 'gift_card';
const KIND_GAME_KEY = 'game_key';

function authHeaders(provider) {
    if (!provider.apiKey) return {};
    const header = provider.apiKeyHeader || 'X-API-Key';
    return { [header]: provider.apiKey };
}

async function getJson(provider, url) {
    const response = await axios.get(url, {
        headers: authHeaders(provider),
        timeout: TIMEOUT_MS
    });
    return response.data;
}

async function postJson(provider, url, body, extraHeaders = {}) {
    const response = await axios.post(url, body, {
        headers: { 'Content-Type': 'application/json', ...authHeaders(provider), ...extraHeaders },
        timeout: TIMEOUT_MS
    });
    return response.data;
}

function parseMoney(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * قراءة مصفوفة عناصر (فئات أو عروض) مع التنقل عبر cursor (الترسيم).
 */
async function walkCursor(provider, url, arrayField, params = {}) {
    const all = [];
    let cursor = null;
    const seenCursors = new Set();

    for (;;) {
        const query = new URLSearchParams(params);
        query.set('limit', '50');
        if (cursor) query.set('cursor', cursor);

        const data = await getJson(provider, `${url}?${query.toString()}`);
        const items = Array.isArray(data?.[arrayField]) ? data[arrayField] : [];
        all.push(...items);

        const meta = data?.meta || {};
        if (!meta.has_more || !meta.next_cursor) break;
        if (seenCursors.has(meta.next_cursor)) break;
        seenCursors.add(meta.next_cursor);
        cursor = meta.next_cursor;
    }

    return all;
}

/**
 * خرائط اسم/منصة سلعة FazerCards إلى قسم المتجر المسموح.
 */
function inferCategory(name, provider) {
    const lower = String(name || '').toLowerCase();
    const mapping = provider.categoryMapping || {};

    if (mapping[lower]) return mapping[lower];

    if (lower.includes('steam')) return 'steam';
    if (lower.includes('playstation') || lower.includes('psn')) return 'playstation';
    if (lower.includes('xbox')) return 'xbox';
    if (lower.includes('google play')) return 'google';
    if (lower.includes('itunes') || lower.includes('apple') || lower.includes('app store')) return 'itunes';
    if (lower.includes('razer')) return 'razer_gold';
    if (lower.includes('amazon')) return 'amazon';
    if (lower.includes('pubg') || lower.includes('unknown cash')) return 'pubg';
    if (lower.includes('fortnite') || lower.includes('v-bucks') || lower.includes('vbucks')) return 'fortnite';
    if (lower.includes('microsoft') || lower.includes('windows')) return 'microsoft_windows';
    if (lower.includes('adobe')) return 'adobe';
    if (lower.includes('antivirus')) return 'antivirus';

    return provider.defaultCategory || 'gaming_general';
}

/**
 * خرائط منطقة FazerCards إلى منطقة المتجر المسموحة (إلا توجد خارج القائمة المسموحة).
 */
function inferRegion(rawRegion, provider) {
    const raw = String(rawRegion || '').trim().toLowerCase();
    if (!raw) return provider.defaultRegion || 'global';
    const mapped = provider.regionMapping?.[raw] || raw;
    return STORE_REGIONS.has(mapped) ? mapped : (provider.defaultRegion || 'global');
}

/**
 * بناء وصف عنصر موحّد من عرض FazerCards.
 */
function toUnifiedItem(kind, categoryId, name, offer, extra = {}) {
    const price = parseMoney(offer.price_usd);
    const stock = Number.isFinite(Number(offer.stock)) ? Number(offer.stock) : null;
    return {
        id: `${kind}:${categoryId}:${offer.card_id || offer.key_id}`,
        name: {
            ar: name || offer.name || '',
            en: offer.name || name || ''
        },
        price,
        currency: 'USD',
        stock: Number.isFinite(stock) ? stock : null,
        region: extra.region || null,
        image: '',
        description: { ar: '', en: '' }
    };
}

/**
 * جلب الكتالوج الكامل: بطاقات الهدايا + مفاتيح الألعاب.
 * @returns {Promise<Array>} عناصر أولية (تُطبع لاحقاً عبر normalizeItem)
 */
async function fetchCatalog(provider) {
    const items = [];

    const giftCategories = await walkCursor(provider, `${provider.baseUrl}/giftcards`, 'items');
    for (const category of giftCategories) {
        if (!category?.category_id) continue;
        const offers = await walkCursor(
            provider,
            `${provider.baseUrl}/giftcards/cards`,
            'offers',
            { category_id: category.category_id }
        );
        for (const offer of offers) {
            if (offer?.card_id && offer.price_usd != null) {
                items.push(toUnifiedItem(KIND_GIFT_CARD, category.category_id, category.name, offer));
            }
        }
    }

    const gameCategories = await walkCursor(provider, `${provider.baseUrl}/gamekeys`, 'items');
    for (const category of gameCategories) {
        if (!category?.game_id) continue;
        const keys = await walkCursor(
            provider,
            `${provider.baseUrl}/gamekeys/keys`,
            'keys',
            { game_id: category.game_id }
        );
        for (const key of keys) {
            if (key?.key_id && key.key_id !== '' && key.price_usd != null) {
                items.push(toUnifiedItem(KIND_GAME_KEY, category.game_id, category.name, key, {
                    region: category.region
                }));
            }
        }
    }

    return items;
}

/**
 * تطبيع عنصر أولي من فئة FazerCards إلى الشكل الداخلي الموحّد
 * (نفس حقول النموذج العام: groupKey للربط مع المزودين الآخرين).
 */
function normalizeItem(provider, item) {
    const kind = String(item.id || '').startsWith(`${KIND_GIFT_CARD}:`) ? KIND_GIFT_CARD : KIND_GAME_KEY;
    const name = item.name?.en || item.name?.ar || '';
    const category = inferCategory(name, provider);
    const region = kind === KIND_GAME_KEY
        ? inferRegion(item.region, provider)
        : (provider.defaultRegion || 'global');

    return {
        ...item,
        region,
        category: STORE_CATEGORIES.has(category) ? category : (provider.defaultCategory || 'gaming_general'),
        groupKey: buildGroupKey({ category, region, name })
    };
}

/**
 * جلب الرصيد.
 */
async function fetchBalance(provider) {
    try {
        const data = await getJson(provider, `${provider.baseUrl}/balance`);
        const balance = parseMoney(data?.balance);
        return {
            name: provider.name,
            status: balance == null ? 'غير متصل' : 'متصل',
            balance: balance ?? 0,
            currency: data?.currency || provider.currency,
            error: balance == null ? 'استجابة رصيد غير صالحة' : undefined
        };
    } catch (err) {
        return {
            name: provider.name,
            status: 'غير متصل',
            balance: 0,
            currency: provider.currency,
            error: err.message
        };
    }
}

/**
 * تحليل المعرّف الخارجي إلى نوع الطلب ومعرفاته.
 * الصيغة: gift_card:<category_id>:<card_id> | game_key:<game_id>:<key_id>
 */
function parseExternalId(externalId) {
    const parts = String(externalId || '').split(':');
    if (parts.length !== 3) {
        throw new Error(`معرّف خارجي غير صالح: ${externalId}`);
    }
    const kind = parts[0];
    if (kind !== KIND_GIFT_CARD && kind !== KIND_GAME_KEY) {
        throw new Error(`نوع غير مدعوم: ${kind}`);
    }
    return { kind, categoryId: parts[1], offerId: parts[2] };
}

function buildOrderBody(kind, parsed, quantity) {
    if (kind === KIND_GIFT_CARD) {
        return { category_id: parsed.categoryId, card_id: parsed.offerId, quantity };
    }
    return { game_id: parsed.categoryId, key_id: parsed.offerId, quantity };
}

function orderEndpoint(kind) {
    return kind === KIND_GIFT_CARD ? '/giftcards/order' : '/gamekeys/order';
}

/**
 * استخراج الأكواد من استجابة الطلب المكتمل (صيغ متعددة).
 */
function extractOrderCodes(order) {
    const candidates = [];
    const payload = order?.payload || order;

    if (Array.isArray(payload?.codes)) candidates.push(...payload.codes);
    if (typeof payload?.code === 'string' && payload.code.trim()) candidates.push(payload.code);
    if (typeof payload?.pin === 'string' && payload.pin.trim()) candidates.push(payload.pin);

    if (Array.isArray(payload?.items)) {
        for (const item of payload.items) {
            if (typeof item?.code === 'string') candidates.push(item.code);
            else if (typeof item?.pin === 'string') candidates.push(item.pin);
            else if (typeof item === 'string') candidates.push(item);
        }
    }

    return candidates.filter(code => typeof code === 'string' && code.trim());
}

/**
 * الشراء من FazerCards (غير متزامن):
 * 1) يضع الطلب ثم 2) يستقصي /orders/:id حتى completed ثم 3) يقرأ الأكواد.
 */
async function purchaseItem(provider, { externalId, quantity, basePrice }) {
    const parsed = parseExternalId(externalId);
    const body = buildOrderBody(parsed.kind, parsed, quantity);

    const orderData = await postJson(provider, `${provider.baseUrl}${orderEndpoint(parsed.kind)}`, body, {
        'Idempotency-Key': `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    });

    const orderId = orderData?.order?.id || orderData?.order_id;
    if (!orderId) {
        throw new Error(`FazerCards لم يرجّع رقم طلب: ${JSON.stringify(orderData || {}).slice(0, 200)}`);
    }

    let lastOrder = null;
    for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt += 1) {
        if (attempt > 1) {
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        }
        lastOrder = await getJson(provider, `${provider.baseUrl}/orders/${orderId}`).then(d => d?.order || d);

        const status = String(lastOrder?.status || '').toLowerCase();
        if (status === 'completed') break;
        if (status === 'failed' || status === 'refunded' || status === 'cancelled') {
            throw new Error(`فشل الطلب ${orderId} (${status})`);
        }
    }

    const codes = extractOrderCodes(lastOrder);
    if (String(lastOrder?.status || '').toLowerCase() !== 'completed') {
        throw new Error(`انتهت مدة انتظار اكتمال الطلب ${orderId}`);
    }
    if (codes.length !== quantity) {
        throw new Error(`FazerCards لم يسلّم العدد المطلوب للأكواد (${codes.length}/${quantity})`);
    }

    const costPrice = parseMoney(lastOrder?.payload?.price_usd ?? lastOrder?.price_usd) ?? parseMoney(basePrice);
    return { codes, costPrice: costPrice != null ? costPrice * quantity : (Number(basePrice) || 0) * quantity };
}

module.exports = {
    fetchCatalog,
    normalizeItem,
    fetchBalance,
    purchaseItem,
    parseExternalId,
    extractOrderCodes,
    inferCategory,
    _internal: { getJson, postJson }
};