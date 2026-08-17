// ======================================================
// سجل المزودين (Provider Registry)
// ------------------------------------------------------
// يُبنى سجل المزودين من متغيرات البيئة حتى يمكن إضافة أي
// مزود B2B جديد دون تعديل الكود:
//
//   PROVIDERS_COUNT=2
//   PROVIDER_1_NAME=SteamKeys
//   PROVIDER_1_ENABLED=true
//   PROVIDER_1_API_KEY=...
//   PROVIDER_1_BASE_URL=https://api.steamkeys.example
//   PROVIDER_1_ITEMS_URL=        (اختياري: افتراضي BASE_URL + /items)
//   PROVIDER_1_BALANCE_URL=      (اختياري: افتراضي BASE_URL + /balance)
//   PROVIDER_1_PURCHASE_URL=     (اختياري: افتراضي BASE_URL + /buy)
//   PROVIDER_1_AUTH_TYPE=bearer  (bearer | apikey-header | apikey-query | none)
//   PROVIDER_1_API_KEY_HEADER=Authorization
//   PROVIDER_1_CURRENCY=TRY      (عملة أسعار المزود)
//   PROVIDER_1_MARGIN=1.15       (هامش الربح الافتراضي لهذا المزود)
//   PROVIDER_1_ITEMS_PATH=data.items
//   PROVIDER_1_ID_FIELD=id
//   PROVIDER_1_PRICE_FIELD=price
//   PROVIDER_1_PRICE_CURRENCY_FIELD=currency
//   PROVIDER_1_NAME_AR_FIELD=name_ar
//   PROVIDER_1_NAME_EN_FIELD=name_en
//   PROVIDER_1_IMAGE_FIELD=image
//   PROVIDER_1_STOCK_FIELD=stock
//   PROVIDER_1_CATEGORY_FIELD=category
//   PROVIDER_1_REGION_FIELD=region
//   PROVIDER_1_DESCRIPTION_FIELD=description
//   PROVIDER_1_CATEGORY_MAPPING=steam:steam,psn:playstation
//   PROVIDER_1_REGION_MAPPING=global:global,tr:tr
// ======================================================

const DEFAULT_FIELDS = {
    itemsPath: 'data.items',
    id: 'id',
    price: 'price',
    priceCurrency: 'currency',
    nameAr: 'name_ar',
    nameEn: 'name_en',
    image: 'image',
    stock: 'stock',
    category: 'category',
    region: 'region',
    description: 'description'
};

function parseIntStrict(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : 0;
}

function parseMapping(raw) {
    if (!raw) return {};
    const mapping = {};
    for (const pair of String(raw).split(',')) {
        const [from, to] = pair.trim().split(':');
        if (from && to) mapping[from.trim()] = to.trim();
    }
    return mapping;
}

function parseAuthType(value) {
    const normalized = String(value || 'none').toLowerCase();
    if (['bearer', 'apikey-header', 'apikey-query', 'none'].includes(normalized)) {
        return normalized;
    }
    return 'none';
}

function buildProvider(index) {
    const prefix = `PROVIDER_${index}_`;
    const read = name => process.env[`${prefix}${name}`];

    const name = read('NAME') || `Provider_${index}`;
    const baseUrl = (read('BASE_URL') || '').replace(/\/+$/, '');
    const enabled = String(read('ENABLED') ?? 'true').toLowerCase() !== 'false';
    const apiKey = read('API_KEY') || '';
    if (!enabled || !apiKey) return null;

    const authType = parseAuthType(read('AUTH_TYPE'));
    const currency = (read('CURRENCY') || 'USD').toUpperCase();
    const margin = Number.parseFloat(read('MARGIN'));
    const itemsPath = read('ITEMS_PATH') || DEFAULT_FIELDS.itemsPath;
    const adapterType = String(read('ADAPTER_TYPE') || 'generic').toLowerCase();

    return {
        index,
        name,
        adapterType,
        enabled: true,
        baseUrl,
        apiKey,
        authType,
        apiKeyHeader: read('API_KEY_HEADER') || (authType === 'bearer' ? 'Authorization' : 'X-API-Key'),
        currency,
        margin: Number.isFinite(margin) && margin >= 1 ? margin : null,
        defaultCategory: read('DEFAULT_CATEGORY') || 'gaming_general',
        defaultRegion: read('DEFAULT_REGION') || 'global',
        itemsUrl: read('ITEMS_URL') || `${baseUrl}/items`,
        balanceUrl: read('BALANCE_URL') || `${baseUrl}/balance`,
        purchaseUrl: read('PURCHASE_URL') || `${baseUrl}/buy`,
        fields: {
            itemsPath,
            id: read('ID_FIELD') || DEFAULT_FIELDS.id,
            price: read('PRICE_FIELD') || DEFAULT_FIELDS.price,
            priceCurrency: read('PRICE_CURRENCY_FIELD') || DEFAULT_FIELDS.priceCurrency,
            nameAr: read('NAME_AR_FIELD') || DEFAULT_FIELDS.nameAr,
            nameEn: read('NAME_EN_FIELD') || DEFAULT_FIELDS.nameEn,
            image: read('IMAGE_FIELD') || DEFAULT_FIELDS.image,
            stock: read('STOCK_FIELD') || DEFAULT_FIELDS.stock,
            category: read('CATEGORY_FIELD') || DEFAULT_FIELDS.category,
            region: read('REGION_FIELD') || DEFAULT_FIELDS.region,
            description: read('DESCRIPTION_FIELD') || DEFAULT_FIELDS.description
        },
        categoryMapping: parseMapping(read('CATEGORY_MAPPING')),
        regionMapping: parseMapping(read('REGION_MAPPING'))
    };
}

/**
 * جلب المزودين المفعلين والمجهزين بمفاتيح API.
 */
function getProviders() {
    const count = parseIntStrict(process.env.PROVIDERS_COUNT);
    const providers = [];
    for (let index = 1; index <= count; index += 1) {
        const provider = buildProvider(index);
        if (provider) providers.push(provider);
    }
    return providers;
}

/**
 * جلب مزود بالاسم.
 */
function getProvider(name) {
    return getProviders().find(provider => provider.name === name) || null;
}

/**
 * نسخة آمنة (بدون مفاتيح API) لعرضها في لوحة التحكم.
 */
function getProvidersSafe() {
    return getProviders().map(provider => ({
        name: provider.name,
        adapterType: provider.adapterType,
        enabled: provider.enabled,
        currency: provider.currency,
        margin: provider.margin,
        defaultCategory: provider.defaultCategory,
        itemsUrl: provider.itemsUrl,
        authType: provider.authType,
        hasApiKey: Boolean(provider.apiKey)
    }));
}

module.exports = { getProviders, getProvider, getProvidersSafe };
