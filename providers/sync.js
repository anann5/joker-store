const { Product, ProviderSyncState, Category } = require('../models');
const registry = require('./registry');
const adapter = require('./adapter');
const currency = require('./currency');
const pricing = require('./pricing');
const { rankGroup } = require('./bestPrice');
const { sendTelegramAlert, createLog } = require('../controllers/helpers');

const PRICE_ALERT_RATIO = Number.parseFloat(process.env.PRICE_ALERT_RATIO) || 1.20;

/**
 * تطبيق عنصر مزوّد على منتج محلي (إنشاء أو تحديث).
 * - يحوّل السعر إلى عملة المتجر
 * - يتحقق من صحة السعر قبل التحديث
 * - يعيد حساب سعر البيع: ربح ثابت حسب طبقة السعر، أو هامش محدد إن وُجد
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
    product.groupKey = item.groupKey || null;
    product.providerCurrency = item.currency;
    product.priceCurrency = currency.STORE_CURRENCY;
    product.basePrice = roundedBase;
    product.lastProviderPrice = roundedBase;
    product.providerStock = item.stock == null ? null : Number(item.stock);
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
        groupKey: item.groupKey || null,
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
 * هل المنتج نافد المخزون عند المزود؟
 * - null/غير معروف → يُعتبر متوفراً (لا نخفيه جهلاً بالمخزون)
 * - قيمة 0 أو أقل → نافد
 */
function isOutOfStock(product) {
    return product.providerStock != null && Number(product.providerStock) <= 0;
}

function memberInStock(members, id) {
    const member = members.find(m => m._id.toString() === id);
    return member ? !isOutOfStock(member) : false;
}

/**
 * تطبيق خطة «أفضل سعر» بعد مزامنة جميع المزودين:
 * - يجمّع المنتجات الخارجية حسب groupKey (الفئة + المنطقة + الاسم الموحّد)
 * - يعتمد الأرخص سعراً المتوفر بالمخزون كمزوّد العرض (من يُعلن نفاد المخزون يُستبعد)
 * - يحفظ بقية الخيارات في providerOptions مرتبة من الأرخص للأغلى
 *   (تُستخدم لاحقاً في التسليم التلقائي عند تعثر الأول)
 * - وعند تعدد المزودين لنفس السلعة، يُشغّل الأرخص المتوفر فقط ويُخفي البقية
 *   حتى لا يظهر المنتج نفسه مرتين بأسعار مختلفة.
 * - إن نفد مخزون كل المزودين للسلعة تُخفي جميع نسخها.
 */
async function applyBestPrice() {
    const products = await Product.find({ isExternal: true, groupKey: { $ne: null } });
    const groups = new Map();

    for (const product of products) {
        if (!product.groupKey) continue;
        if (!groups.has(product.groupKey)) groups.set(product.groupKey, []);
        groups.get(product.groupKey).push(product);
    }

    const summary = { grouped: 0, winners: 0 };

    for (const [groupKey, members] of groups) {
        if (members.length < 2) {
            // سلعة يقدمها مزود واحد فقط — تُعرض دون خيارات بديلة
            // (نحفظ providerOptions فقط ولا نتدخل في isActive لاحترام تعطيل الأدمن،
            // إلا عند نفاد المخزون فيُخفى المنتج تلقائياً)
            const single = members[0];
            single.providerOptions = [{
                provider: single.currentProvider,
                externalId: single.externalId,
                basePrice: Number(single.basePrice) || 0
            }];
            if (isOutOfStock(single)) single.isActive = false;
            await single.save();
            continue;
        }

        const options = rankGroup(members.map(m => ({
            id: m._id.toString(),
            provider: m.currentProvider,
            externalId: m.externalId,
            basePrice: m.basePrice
        })));

        // إن لم تتوفر أي أسعار صالحة نبقي المجموعة كما هي (لا نخفي شيئاً)
        if (options.length === 0) continue;

        // الفائز = الأرخص من بين المزودين المتوفرين بالمخزون فقط
        const winnerId = options.find(option => memberInStock(members, option.id))?.id || null;

        for (const member of members) {
            const isWinner = winnerId != null && member._id.toString() === winnerId;
            await Product.updateOne(
                { _id: member._id },
                {
                    $set: {
                        isActive: isWinner,
                        providerOptions: options
                    }
                }
            );
        }
        summary.grouped += 1;
        if (winnerId != null && members.some(m => m._id.toString() === winnerId)) summary.winners += 1;
    }

    return summary;
}

// ترجمة/تنظيم أسماء الأقسام التلقائية المعروفة — بدل إظهار مفتاح المزود الخام
const CATEGORY_TITLE_MAP = {
    steam: ['ستيم ستور', 'Steam'],
    pubg: ['ببجي', 'PUBG'],
    pubgmobile: ['ببجي موبايل', 'PUBG Mobile'],
    playstation: ['بلايستيشن', 'PlayStation'],
    psn: ['بلايستيشن نتورك', 'PlayStation Network'],
    xbox: ['إكس بوكس', 'Xbox'],
    nintendo: ['نينتندو', 'Nintendo'],
    eshop: ['نينتندو إي شوب', 'Nintendo eShop'],
    itunes: ['آيتونز', 'iTunes'],
    apple: ['أبل', 'Apple'],
    googleplay: ['جوجل بلاي', 'Google Play'],
    spotify: ['سبوتيفاي', 'Spotify'],
    netflix: ['نتفليكس', 'Netflix'],
    discord: ['ديسكورد', 'Discord'],
    roblox: ['روبلوكس', 'Roblox'],
    freefire: ['فري فاير', 'Free Fire'],
    mobilelegends: ['موبايل ليجيندز', 'Mobile Legends'],
    cod: ['كول أوف ديوتي', 'Call of Duty'],
    gta: ['جتا', 'GTA'],
    valorant: ['فالورانت', 'Valorant'],
    fortnite: ['فورتنايت', 'Fortnite'],
    gaming_general: ['ألعاب عامة', 'Gaming'],
    giftcards: ['بطاقات هدايا', 'Gift Cards'],
    topup: ['شحن رصيد', 'Top-Up']
};

/**
 * إرجاع عنوان جميل/مترجم لمفتاح قسم تلقائي:
 * - يستخدم خريطة الأسماء المعروفة إن وُجدت
 * - وإلا ينظّم المفتاح الخام (فصل الشرطات/السفلية وترتيب الأحرف)
 */
function prettifyCategoryTitle(key) {
    const mapped = CATEGORY_TITLE_MAP[String(key || '').toLowerCase()];
    if (mapped) return { ar: mapped[0], en: mapped[1] };
    const pretty = String(key || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, char => char.toUpperCase());
    return { ar: pretty || key, en: pretty || key };
}

/**
 * مزامنة الأقسام تلقائياً مع الكتالوج بعد كل مزامنة:
 * - ينشئ قسماً تلقائياً (source: 'auto') لأي قسم جديد حاضر في منتجات نشطة
 * - يعيد تفعيل الأقسام التلقائية التي عاد لها منتجات
 * - يُخفي الأقسام التلقائية التي لم يعد فيها أي منتج نشط
 * - لا يلمس الأقسام اليدوية (source: 'manual') أبداً
 */
async function syncCategoriesFromCatalog() {
    const presentSet = new Set(
        (await Product.distinct('category', { isActive: true, category: { $ne: null } }))
            .filter(Boolean)
    );
    const existing = new Map(
        (await Category.find({}).select('key source').lean()).map(cat => [cat.key, cat.source])
    );

    const summary = { created: 0, hidden: 0, shown: 0 };

    for (const key of presentSet) {
        if (existing.has(key)) continue;
        const title = prettifyCategoryTitle(key);
        await Category.create({
            key,
            title: { ar: title.ar, en: title.en },
            image: '',
            order: 1000,
            source: 'auto'
        });
        existing.set(key, 'auto');
        summary.created += 1;
    }

    for (const [key, source] of existing) {
        if (source !== 'auto') continue;
        const result = await Category.updateOne(
            { key, source: 'auto' },
            { $set: { isActive: presentSet.has(key) } }
        );
        if (result.modifiedCount > 0) {
            if (presentSet.has(key)) summary.shown += 1;
            else summary.hidden += 1;
        }
    }

    return summary;
}

/**
 * المزامنة الكاملة للكتالوجات من جميع المزودين المفعلين.
 */
async function syncCatalog() {
    const providers = registry.getProviders();
    const summary = { success: true, providers: [], totalCreated: 0, totalUpdated: 0, bestPrice: null };

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

    summary.bestPrice = await applyBestPrice();
    try {
        summary.categories = await syncCategoriesFromCatalog();
    } catch (err) {
        console.error('فشل مزامنة الأقسام تلقائياً:', err.message);
        summary.categoriesError = err.message;
    }
    summary.success = summary.providers.some(p => p.status === 'ok');
    await sendTelegramAlert(
        `🔄 *انتهت مزامنة المزودين*\n`
        + `📦 المزودون: ${summary.providers.length}\n`
        + `🆕 منتجات جديدة: ${summary.totalCreated}\n`
        + `✏️ منتجات محدّثة: ${summary.totalUpdated}`
        + (summary.bestPrice.grouped > 0
            ? `\n🏆 سلع بأفضل سعر: ${summary.bestPrice.grouped}`
            : '')
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

module.exports = { syncCatalog, getSyncStatus, syncInventoryInternal, applyBestPrice, syncCategoriesFromCatalog };
