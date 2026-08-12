const axios = require('axios');

// ======================================================
// محول الشبكة والتطبيع (Provider Adapter)
// ------------------------------------------------------
// طبقة واحدة للتعامل مع جميع المزودين:
// - إرفاق المصادقة حسب نوعها (bearer / apikey-header / apikey-query)
// - جلب الكتالوج والأرصدة والشراء عبر مسارات قابلة للضبط
// - تطبيع عناصر المزود إلى شكل داخلي موحّد
// ======================================================

const TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.PROVIDER_TIMEOUT_MS, 10) || 15000);
const MAX_RETRIES = Math.max(0, Number.parseInt(process.env.PROVIDER_RETRY_COUNT, 10) || 1);

/**
 * الوصول إلى قيمة عبر مسار نقطي مثل "data.items".
 */
function resolvePath(object, path) {
    if (!object || typeof object !== 'object') return undefined;
    if (!path || !String(path).trim()) return object;
    return String(path).trim().split('.').reduce((acc, key) => {
        if (acc == null || typeof acc !== 'object') return undefined;
        return acc[key];
    }, object);
}

function buildAuthHeaders(provider) {
    const headers = {};
    if (!provider.apiKey) return headers;
    if (provider.authType === 'bearer') {
        headers[provider.apiKeyHeader || 'Authorization'] = `Bearer ${provider.apiKey}`;
    } else if (provider.authType === 'apikey-header') {
        headers[provider.apiKeyHeader || 'X-API-Key'] = provider.apiKey;
    }
    return headers;
}

function buildRequestOptions(provider, url) {
    const options = { headers: buildAuthHeaders(provider), timeout: TIMEOUT_MS };
    if (provider.authType === 'apikey-query') {
        const sep = url.includes('?') ? '&' : '?';
        options.url = `${url}${sep}api_key=${encodeURIComponent(provider.apiKey)}`;
    } else {
        options.url = url;
    }
    return options;
}

async function withRetry(fn) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const isClientFailure = err.response?.status >= 400 && err.response?.status < 500;
            if (isClientFailure || attempt === MAX_RETRIES + 1) break;
        }
    }
    throw lastError;
}

/**
 * طلب GET JSON من المزود.
 */
async function getJson(provider, url) {
    return withRetry(async () => {
        const options = buildRequestOptions(provider, url);
        const response = await axios.get(options.url, {
            headers: options.headers,
            timeout: options.timeout
        });
        return response.data;
    });
}

/**
 * طلب POST JSON من المزود.
 */
async function postJson(provider, url, body) {
    return withRetry(async () => {
        const options = buildRequestOptions(provider, url);
        const response = await axios.post(options.url, body, {
            headers: options.headers,
            timeout: options.timeout
        });
        return response.data;
    });
}

function mapValue(provider, value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    return raw;
}

function mapCategory(provider, rawValue) {
    const value = mapValue(provider, rawValue);
    if (!value) return null;
    return provider.categoryMapping?.[value] || value;
}

function mapRegion(provider, rawValue) {
    const value = mapValue(provider, rawValue);
    if (!value) return null;
    return provider.regionMapping?.[value] || value;
}

/**
 * تطبيع عنصر من كتالوج المزود إلى الشكل الداخلي الموحّد.
 */
function normalizeItem(provider, raw) {
    const fields = provider.fields;
    const nameAr = mapValue(provider, resolvePath(raw, fields.nameAr));
    const nameEn = mapValue(provider, resolvePath(raw, fields.nameEn));
    const name = nameAr || nameEn || mapValue(provider, resolvePath(raw, 'name'));

    const price = Number.parseFloat(resolvePath(raw, fields.price));
    const currencyRaw = mapValue(provider, resolvePath(raw, fields.priceCurrency));
    const stockRaw = resolvePath(raw, fields.stock);
    const stock = stockRaw == null || stockRaw === '' ? null : Number(stockRaw);
    const descriptionRaw = resolvePath(raw, fields.description);

    return {
        id: String(resolvePath(raw, fields.id)),
        name: {
            ar: nameAr || name || '',
            en: nameEn || name || ''
        },
        price: Number.isFinite(price) ? price : null,
        currency: currencyRaw || provider.currency,
        stock: Number.isFinite(stock) ? stock : null,
        image: mapValue(provider, resolvePath(raw, fields.image)) || '',
        category: mapCategory(provider, resolvePath(raw, fields.category)) || provider.defaultCategory,
        region: mapRegion(provider, resolvePath(raw, fields.region)) || provider.defaultRegion,
        description: {
            ar: (typeof descriptionRaw === 'string' ? descriptionRaw : '') || '',
            en: ''
        }
    };
}

/**
 * جلب كتالوج المزود كله.
 * @returns {Promise<Array>} مصفوفة العناصر الخام
 */
async function fetchCatalog(provider) {
    const data = await getJson(provider, provider.itemsUrl);
    return Array.isArray(data) ? data : (resolvePath(data, provider.fields.itemsPath) || []);
}

/**
 * جلب رصيد المزود.
 */
async function fetchBalance(provider) {
    try {
        const data = await getJson(provider, provider.balanceUrl);
        const balance = Number.parseFloat(
            resolvePath(data, 'data.balance')
            ?? resolvePath(data, 'data.wallet.balance')
            ?? resolvePath(data, 'balance')
            ?? resolvePath(data, 'amount')
        );
        const currency = mapValue(provider, resolvePath(data, 'data.currency'))
            || mapValue(provider, resolvePath(data, 'currency'));
        return {
            name: provider.name,
            status: Number.isFinite(balance) ? 'متصل' : 'متصل',
            balance: Number.isFinite(balance) ? balance : 0,
            currency: currency || provider.currency
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
 * استخراج الأكواد من استجابة الشراء (يدعم عدة صيغ).
 */
function extractProviderCodes(data, expectedQuantity) {
    const rawCodes = Array.isArray(data?.codes)
        ? data.codes
        : Array.isArray(data?.items)
            ? data.items.map(item => item.code || item.pin)
            : [data?.code || data?.pin];
    const codes = rawCodes.filter(code => typeof code === 'string' && code.trim());
    if (codes.length !== expectedQuantity) {
        throw new Error('المزود لم يرسل العدد المطلوب من الأكواد');
    }
    return codes;
}

/**
 * شراء منتج خارجي من المزود.
 * @returns {Promise<{codes: string[], costPrice: number}>}
 */
async function purchaseItem(provider, { externalId, quantity, basePrice }) {
    const data = await postJson(provider, provider.purchaseUrl, {
        api_key: provider.apiKey,
        product_id: externalId,
        amount: quantity
    });

    const costRaw = Number(data?.costPrice ?? data?.cost ?? data?.price);
    return {
        codes: extractProviderCodes(data, quantity),
        costPrice: Number.isFinite(costRaw) ? costRaw : Number(basePrice || 0) * quantity
    };
}

module.exports = {
    resolvePath,
    fetchCatalog,
    normalizeItem,
    fetchBalance,
    purchaseItem,
    extractProviderCodes,
    mapCategory,
    mapRegion,
    _internal: { buildAuthHeaders, getJson, postJson }
};
