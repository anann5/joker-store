const { Product, ProviderSyncState } = require('../models');
const registry = require('./registry');
const adapter = require('./adapter');
const currency = require('./currency');
const pricing = require('./pricing');
const { sendTelegramAlert, createLog } = require('../controllers/helpers');

const PRICE_ALERT_RATIO = Number.parseFloat(process.env.PRICE_ALERT_RATIO) || 1.20;

/**
 * تطبيق عنصر مزوّد على منتج محلي (إنشاء أو تحديث).
 * - يحوّل السعر إلى عملة المتجر
 - يتحقق من صحة السعر قبل التحديث
 - يعيد حساب سعر البيع = السعر الأساسي × الهامش
 */
async function applyItem(product, provider, item) {
    if (item.price == null) {
        throw new Error(`عنصر ${item.id} بدون سعر`);
    }

    let baseUsd;
    try {
        baseUsd = await currency.convert(item.price, item.currency, currency.STORE_CURRENCY);
    } catch (err) {
        throw new Error(`فشل تحويل العملة ${item.currency}: ${err.message}`);
    }

    const roundedBase = currency.roundMoney(baseUsd);
    if (pricing.isSuspicious(roundedBase, product.lastProviderPrice)) {
        throw new Error(`تغيّر مريب في السعر (${product.lastProviderPrice} → ${roundedBase})؛ أبقيت السعر القديم`);
    }

    const margin = pricing.getMarginForProduct(product, provider);
    const newPrice = pricing.computeSellingPrice({ basePrice: roundedBase, margin });
    if (newPrice == null) {
        throw new Error(`سعر بيع غير صالح للمنتج ${item.id}`);
    }

    const oldBase = Number(product.basePrice) || 0;
    const previousPrice = Number(product.price) || 0;

    product.isExternal = true;
    product.externalId = item.id;
    product.currentProvider = provider.name;
    product.providerCurrency = item.currency;
    product.priceCurrency = currency.STORE_CURRENCY;
    product.basePrice = roundedBase;
    product.lastProviderPrice = roundedBase;
    product.lastPriceSyncAt = new Date();
    product.price = newPrice;
    product.updatedAt = new Date();

    if (item.name.ar) product.productName.ar = item.name.ar;
    if (item.name.en) product.productName.en = item.name.en;
    if (item.image) product.image = item.image;
    if (item.category) product.category = item.category;
    if (item.region) product.region = item.region;
    if (item.description?.ar) {
        product.description.ar = item.description.ar;
        product.description.en = item.description.ar;
    }

    await product.save();

    if (oldBase > 0 && roundedBase > oldBase * PRICE_ALERT_RATIO) {
        await sendTelegramAlert(
            `🚨 *تنبيه: ارتفاع سعر عند المزود!*\n`
            + `📦 *المنتج:* ${product.productName.ar || product.productName.en}\n`
            + `🏢 *المزود:* ${provider.name}\n`
            + `📉 *السعر الأساسي القديم:* \`${oldBase} ${currency.STORE_CURRENCY_SYMBOL}\`\n`
            + `📈 *السعر الأساسي الجديد:* \`${roundedBase} ${currency.STORE_CURRENCY_SYMBOL}\`\n`
            + `💰 *سعرك الجديد:* \`${newPrice} ${currency.STORE_CURRENCY_SYMBOL}\``
        );
    }

    return { changed: newPrice !== previousPrice };
}

function newProductFor(provider, item) {
    return new Product({
        productName: { ar: item.name.ar, en: item.name.en },
        category: item.category || provider.defaultCategory,
        region: item.region || provider.defaultRegion,
        price: 0,
        image: item.image || '',
        isExternal: true,
        externalId: item.id,
        currentProvider: provider.name,
        providerCurrency: item.currency,
        description: {
            ar: item.description?.ar || 'منتج خارجي يُشحن مباشرة من المزود.',
            en: item.description?.ar || 'External product fulfilled directly by the provider.'
        }
    });
}

async function recordState(provider, state) {
    const doc = await ProviderSyncState.findOneAndUpdate(
        { provider: provider.name },
        {
            $set: {
                provider: provider.name,
                lastSyncAt: new Date(),
                status: state.status,
                fetched: state.fetched,
                created: state.created,
                updated: state.updated,
                errorCount: state.errorCount,
                lastError: state.lastError || null,
                ratesSource: state.ratesSource || null,
                storeCurrency: currency.STORE_CURRENCY
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return doc;
}

/**
 * المزامنة الكاملة للكتالوجات من جميع المزودين المفعلين.
 */
async function syncCatalog() {
    const providers = registry.getProviders();
    const summary = { success: true, providers: [], totalCreated: 0, totalUpdated: 0 };

    if (providers.length === 0) {
        summary.message = 'لا يوجد مزودون مُعدّون (أضف PROVIDERS_COUNT ومفاتيح API في .env)';
        return summary;
    }

    for (const provider of providers) {
        const state = {
            name: provider.name,
            status: 'ok',
            fetched: 0,
            created: 0,
            updated: 0,
            errorCount: 0,
            lastError: null
        };

        try {
            const rawItems = await adapter.fetchCatalog(provider);
            state.fetched = Array.isArray(rawItems) ? rawItems.length : 0;

            for (const raw of rawItems) {
                try {
                    const item = adapter.normalizeItem(provider, raw);
                    if (!item.id) {
                        state.errorCount += 1;
                        continue;
                    }

                    let product = await Product.findOne({
                        externalId: item.id,
                        currentProvider: provider.name,
                        isExternal: true
                    });

                    if (!product) {
                        product = newProductFor(provider, item);
                        state.created += 1;
                    } else {
                        state.updated += 1;
                    }

                    await applyItem(product, provider, item);
                } catch (err) {
                    state.errorCount += 1;
                }
            }
        } catch (err) {
            state.status = 'failed';
            state.lastError = err.message;
        }

        try {
            state.ratesSource = (await currency.status()).source;
        } catch (_err) {
            state.ratesSource = null;
        }

        await recordState(provider, state);
        summary.providers.push(state);
        summary.totalCreated += state.created;
        summary.totalUpdated += state.updated;
    }

    summary.success = summary.providers.some(p => p.status === 'ok');
    await sendTelegramAlert(
        `🔄 *انتهت مزامنة المزودين*\n`
        + `📦 المزودون: ${summary.providers.length}\n`
        + `🆕 منتجات جديدة: ${summary.totalCreated}\n`
        + `✏️ منتجات محدّثة: ${summary.totalUpdated}`
    );
    return summary;
}

/**
 * جلب حالة المزامنة (لكل مزود + إجمالي).
 */
async function getSyncStatus() {
    const providers = registry.getProvidersSafe();
    const states = await ProviderSyncState.find({}).lean();
    const stateMap = new Map(states.map(state => [state.provider, state]));
    return providers.map(provider => ({ ...provider, ...(stateMap.get(provider.name) || {}) }));
}

/**
 * إصدار متوافق مع المنتجات/السيرفر الحالي: { success, count }.
 */
async function syncInventoryInternal() {
    const result = await syncCatalog();
    if (!result.success) {
        return { success: false, error: result.providers.map(p => p.lastError).filter(Boolean).join('; ') || 'فشلت مزامنة المزودين' };
    }
    const count = result.totalCreated + result.totalUpdated;
    if (result.providers.length > 0 && count > 0) {
        await createLog('مزامنة تلقائية', `تم تحديث ${count} منتج من ${result.providers.length} مزود`, null);
    }
    return { success: true, count };
}

module.exports = { syncCatalog, getSyncStatus, syncInventoryInternal };
