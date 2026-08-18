const { Product, Order, Category, Promotion } = require('../models');
const { v4: uuidv4 } = require('uuid');
const siteSettings = require('../config/siteSettings');
const stripeController = require('./stripeController');
const notification = require('./notification');
const { applyPromoCode, applyPromoCodeToProducts, applyPromoCodeToProductIds, round2 } = require('./promo');
const { getSafeBaseHost } = require('./helpers');

const DEFAULT_PRODUCT_LIMIT = 8;
const MAX_PRODUCT_LIMIT = 24;

// ======================================================
// كاش بسيط في الذاكرة لواجهة المتجر (TTL)
// ------------------------------------------------------
// يخفف ضغط قاعدة البيانات مع تكرار زيارة الزبائن للواجهة.
// - المدة الافتراضية بالثواني من STOREFRONT_CACHE_TTL (0 = تعطيل)
// - يُعطَّل تلقائياً أثناء الاختبارات (NODE_ENV=test)
// - clearStorefrontCache() يمسح الكاش فوراً (يُستدعى بعد كل مزامنة أسعار)
// ======================================================
const cacheTtlRaw = Number.parseInt(process.env.STOREFRONT_CACHE_TTL || '', 10);
const DEFAULT_CACHE_TTL_SECONDS = Number.isInteger(cacheTtlRaw) && cacheTtlRaw >= 0 ? cacheTtlRaw : 60;
const cacheEnabled = process.env.NODE_ENV !== 'test' && DEFAULT_CACHE_TTL_SECONDS > 0;
const cacheStore = new Map();

function cacheWrap(key, ttlSeconds, fn) {
    if (!cacheEnabled) return fn();
    const seconds = Number.isInteger(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : DEFAULT_CACHE_TTL_SECONDS;
    const hit = cacheStore.get(key);
    if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value);
    return fn().then(value => {
        cacheStore.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
        return value;
    });
}

/**
 * مسح كاش الواجهة بالكامل — يُستدعى بعد كل مزامنة أسعار من المزودين
 * حتى لا تُعرض أسعار/منتجات قديمة من الذاكرة.
 */
exports.clearStorefrontCache = () => {
    cacheStore.clear();
};

function getLocalizedValue(value, fallback = '') {
    if (value && typeof value === 'object') {
        return {
            ar: String(value.ar || value.en || fallback),
            en: String(value.en || value.ar || fallback)
        };
    }

    return { ar: String(value || fallback), en: String(value || fallback) };
}

/**
 * Convert a product document into the storefront-safe shape.
 * Inventory codes, supplier identifiers, and costs must never reach public APIs.
 */
function toPublicProduct(product) {
    const source = typeof product.toObject === 'function' ? product.toObject() : product;

    return {
        _id: source._id,
        productName: getLocalizedValue(source.productName),
        description: getLocalizedValue(source.description),
        category: source.category,
        region: source.region,
        price: source.price,
        image: source.image || '',
        isSubscription: Boolean(source.isSubscription),
        subscriptionType: source.subscriptionType,
        subscriptionDuration: source.subscriptionDuration,
        rating: Number(source.rating) || 0,
        reviewsCount: Number(source.reviewsCount) || 0,
        availableStock: source.isExternal
            ? null
            : (Array.isArray(source.codes)
                ? source.codes.filter(code => code.status === 'available').length
                : null)
    };
}

function parseProductLimit(value, fallback = DEFAULT_PRODUCT_LIMIT) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return fallback;
    }

    return Math.min(parsed, MAX_PRODUCT_LIMIT);
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * جلب جميع الأقسام مع الترجمة الصحيحة.
 */
exports.getCategories = async (req, res) => {
    try {
        const lang = req.query.lang === 'en' ? 'en' : 'ar';
        // نعرض فقط الأقسام النشطة التي لديها منتجات نشطة فعلاً
        // (الأقسام التلقائية الفارغة تختفي تلقائياً من الواجهة)
        const categories = await cacheWrap(`categories-${lang}`, 300, () => Category.aggregate([
            { $match: { isActive: true } },
            {
                $lookup: {
                    from: 'products',
                    localField: 'key',
                    foreignField: 'category',
                    as: 'items'
                }
            },
            {
                $addFields: {
                    activeCount: {
                        $size: {
                            $filter: {
                                input: '$items',
                                as: 'item',
                                cond: { $eq: ['$$item.isActive', true] }
                            }
                        }
                    }
                }
            },
            { $match: { activeCount: { $gt: 0 } } },
            { $sort: { order: 1 } },
            { $project: { items: 0, activeCount: 0 } }
        ]));
        const localizedCategories = {};

        categories.forEach(category => {
            const title = getLocalizedValue(category.title);
            const description = getLocalizedValue(category.description);
            localizedCategories[category.key] = {
                title: title[lang],
                desc: description[lang],
                image: category.image
            };
        });

        res.json({ success: true, categories: localizedCategories });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'Failed to fetch categories' });
    }
};

exports.getProductsByCategory = async (req, res) => {
    try {
        const { categoryKey } = req.params;
        if (!categoryKey || typeof categoryKey !== 'string' || !/^[a-zA-Z0-9_]+$/.test(categoryKey)) {
            return res.status(400).json({ success: false, error: 'مفتاح الفئة غير صالح' });
        }

        const products = await Product.find({ category: categoryKey, isActive: true });
        res.json({ success: true, products: products.map(toPublicProduct) });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل في جلب المنتجات' });
    }
};

exports.getLatestOrders = async (_req, res) => {
    try {
        const latestOrders = await Order.find({ status: 'completed' })
            .sort({ completedAt: -1 })
            .limit(5)
            .select('orderId items.name');

        const orders = latestOrders.map(order => {
            const firstName = order.items[0]?.name;
            const productName = firstName && typeof firstName === 'object'
                ? String(firstName.ar || firstName.en || '')
                : String(firstName || '');
            return {
                orderId: order.orderId,
                productName: productName || getLocalizedValue('منتج').ar
            };
        });
        res.json({ success: true, orders });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل في جلب آخر الطلبات' });
    }
};

/**
 * جلب الإعدادات العامة للمتجر (أرقام الدفع، روابط التواصل، الإحصائيات الحقيقية).
 * الإحصائيات تُحسب من قاعدة البيانات مباشرة — لا أرقام مفبركة.
 */
exports.getSiteConfig = async (_req, res) => {
    try {
        // إحصائيات حقيقية من قاعدة البيانات: عدد الطلبات المكتملة والناجحة زائداً عدد العملاء المميزين
        // مخزنة مؤقتاً (TTL قصير) لأنها تُستدعى في كل تحميل للواجهة وهي تكلفة تجميع كاملة على الطلبات
        const config = await cacheWrap('siteConfig', 60, async () => {
            const [orderStats, uniqueCustomers] = await Promise.all([
                Order.aggregate([
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            completed: {
                                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                            }
                        }
                    }
                ]),
                Order.distinct('buyerEmail')
            ]);

            const aggregate = orderStats[0] || { total: 0, completed: 0 };

            return {
                payment: {
                    jawwalNumber: siteSettings.payment.jawwalNumber,
                    palpayNumber: siteSettings.payment.palpayNumber
                },
                currency: siteSettings.currency,
                social: siteSettings.social,
                stripe: { enabled: stripeController.isStripeEnabled() },
                stats: {
                    orders: aggregate.completed,
                    customers: Array.isArray(uniqueCustomers) ? uniqueCustomers.filter(Boolean).length : 0
                }
            };
        });

        res.json({ success: true, config });
    } catch (err) {
        console.error('Failed to load site config stats:', err);
        res.status(500).json({ success: false, error: 'فشل في تحميل إعدادات المتجر' });
    }
};

/**
 * تتبع طلبات المشتري عبر البريد الإلكتروني (للواجهة دون الحاجة لتسجيل دخول).
 */
exports.trackOrder = async (req, res) => {
    try {
        const { email, orderId } = req.body || {};
        if (!email || typeof email !== 'string' || email.trim().length > 200) {
            return res.status(400).json({ success: false, error: 'البريد الإلكتروني مطلوب' });
        }

        const query = { buyerEmail: email.trim().toLowerCase() };
        if (orderId && typeof orderId === 'string' && orderId.trim()) {
            if (orderId.trim().length > 40) {
                return res.status(400).json({ success: false, error: 'رقم الطلب غير صالح' });
            }
            query.orderId = orderId.trim().toUpperCase();
        }

        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .limit(10)
            .select('orderId status price items.name items.qty items.createdAt code deliveredCodes completedAt');

        const safeOrders = orders.map(order => {
            const items = (order.items || []).map(item => ({
                name: getLocalizedValue(item.name),
                qty: item.qty
            }));
            // الأكواد تُكشف فقط عند تقديم رقم طلب مطابق (منع سحب الأكواد بالبريد فقط)
            const codes = (orderId && order.status === 'completed')
                ? (order.deliveredCodes?.length ? order.deliveredCodes : (order.code ? [order.code] : []))
                : [];
            return {
                orderId: order.orderId,
                status: order.status,
                price: order.price,
                createdAt: order.createdAt,
                completedAt: order.completedAt || null,
                items,
                codes
            };
        });

        res.json({ success: true, orders: safeOrders });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل تتبع الطلب، حاول مرة أخرى' });
    }
};

/**
 * جلب المنتجات الأكثر مبيعاً بناءً على عدد مرات شرائها في الطلبات المكتملة.
 */
exports.getBestSellingProducts = async (req, res) => {
    try {
        const limit = parseProductLimit(req.query.limit);
        const bestSellers = await cacheWrap(`best-${limit}`, 60, () => Order.aggregate([
            { $match: { status: 'completed' } },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.productId',
                    totalSold: { $sum: '$items.qty' }
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: limit },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: '$productDetails' },
            {
                $project: {
                    _id: '$productDetails._id',
                    productName: '$productDetails.productName',
                    description: '$productDetails.description',
                    price: '$productDetails.price',
                    image: '$productDetails.image',
                    category: '$productDetails.category',
                    region: '$productDetails.region',
                    isSubscription: '$productDetails.isSubscription',
                    subscriptionType: '$productDetails.subscriptionType',
                    subscriptionDuration: '$productDetails.subscriptionDuration',
                    totalSold: 1
                }
            }
        ]));

        res.json({
            success: true,
            products: bestSellers.map(product => ({ ...toPublicProduct(product), totalSold: product.totalSold }))
        });
    } catch (err) {
        console.error('Error fetching best selling products:', err);
        res.status(500).json({ success: false, error: 'فشل في جلب المنتجات الأكثر مبيعاً' });
    }
};

/**
 * جلب أحدث المنتجات المضافة إلى المتجر.
 */
exports.getNewlyAddedProducts = async (req, res) => {
    try {
        const limit = parseProductLimit(req.query.limit);
        const products = await cacheWrap(`newly-${limit}`, DEFAULT_CACHE_TTL_SECONDS, () =>
            Product.find({ isActive: true }).sort({ createdAt: -1 }).limit(limit)
        );

        res.json({ success: true, products: products.map(toPublicProduct) });
    } catch (err) {
        console.error('Error fetching newly added products:', err);
        res.status(500).json({ success: false, error: 'فشل في جلب أحدث المنتجات' });
    }
};

/**
 * جلب منتجات ذات صلة بمنتج معين (من نفس القسم).
 */
exports.getRelatedProducts = async (req, res) => {
    try {
        const { productId } = req.params;
        const limit = parseProductLimit(req.query.limit, 4);
        if (!productId || typeof productId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(productId)) {
            return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });
        }

        const originalProduct = await Product.findById(productId).select('category');
        if (!originalProduct) {
            return res.status(404).json({ success: false, error: 'المنتج الأصلي غير موجود' });
        }

        const products = await Product.find({
            category: originalProduct.category,
            _id: { $ne: productId },
            isActive: true
        }).limit(limit);

        res.json({ success: true, products: products.map(toPublicProduct) });
    } catch (err) {
        console.error('Error fetching related products:', err);
        res.status(500).json({ success: false, error: 'فشل في جلب المنتجات ذات الصلة' });
    }
};

/**
 * جلب قائمة خفيفة بجميع المنتجات لأغراض البحث السريع في الواجهة الأمامية.
 */
exports.getSearchIndex = async (_req, res) => {
    try {
        const products = await cacheWrap('search-index', 300, () => Product.find({ isActive: true }));
        res.json({ success: true, products: products.map(toPublicProduct) });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل في بناء فهرس البحث.' });
    }
};

/**
 * جلب العروض/الخصومات الفعالة (غير المنتهية):
 * - لكل عرض يُحسب سعر البيع بعد الخصم (salePrice) لمنتجاته المستهدفة
 * - الواجهة تستخدمه لعرض «عرض اليوم» مع عدّاد تنازلي حتى expiresAt
 * يُخزَّن مؤقتاً في كاش الواجهة ويُمسح عند أي تعديل من لوحة التحكم.
 */
exports.getActivePromotions = async (_req, res) => {
    try {
        const promotions = await cacheWrap('promotions', 60, async () => {
            const now = new Date();
            const docs = await Promotion.find({ isActive: true, expiresAt: { $gt: now } })
                .sort({ expiresAt: 1 })
                .lean();

            const result = [];
            for (const promo of docs) {
                let products = [];
                if (promo.productId) {
                    const product = await Product.findOne({ _id: promo.productId, isActive: true });
                    if (product) products = [product];
                } else if (promo.category) {
                    products = await Product.find({ category: promo.category, isActive: true });
                }

                const discountFactor = 1 - Number(promo.discountPercent) / 100;
                result.push({
                    _id: promo._id,
                    title: getLocalizedValue(promo.title),
                    description: getLocalizedValue(promo.description),
                    discountPercent: promo.discountPercent,
                    expiresAt: promo.expiresAt,
                    code: promo.code || null,
                    target: promo.productId
                        ? { type: 'product', id: promo.productId.toString() }
                        : { type: 'category', key: promo.category || null },
                    products: products.slice(0, 12).map(product => {
                        const pub = toPublicProduct(product);
                        const fullPrice = Number(pub.price) || 0;
                        pub.salePrice = Math.round(fullPrice * discountFactor * 100) / 100;
                        pub.discountPercent = promo.discountPercent;
                        return pub;
                    })
                });
            }
            return result;
        });

        res.json({ success: true, promotions });
    } catch (err) {
        console.error('Error fetching promotions:', err);
        res.status(500).json({ success: false, error: 'فشل جلب العروض' });
    }
};

exports.createOrder = async (req, res) => {
    try {
        const { cartItems, customerEmail, paymentGateway, paymentRef, promoCode: rawPromoCode } = req.body;
        if (paymentGateway === 'stripe' && !stripeController.isStripeEnabled()) {
            return res.status(400).json({ success: false, error: 'الدفع بالبطاقة غير مفعل حالياً.' });
        }
        if (!Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({ success: false, error: 'سلة المشتريات فارغة.' });
        }

        const promoCode = typeof rawPromoCode === 'string' ? rawPromoCode.trim().toUpperCase() : '';

        const quantities = new Map();
        for (const item of cartItems) {
            if (!item?.id || typeof item.id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(item.id)) {
                return res.status(400).json({ success: false, error: 'معرف منتج غير صالح في السلة.' });
            }
            if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99) {
                return res.status(400).json({ success: false, error: 'كمية غير صالحة.' });
            }
            if (quantities.has(item.id)) {
                return res.status(400).json({ success: false, error: 'لا يمكن تكرار المنتج في السلة.' });
            }
            quantities.set(item.id, item.qty);
        }

        const productIds = [...quantities.keys()];
        const productsInCart = await Product.find({ _id: { $in: productIds } });
        const productMap = new Map(productsInCart.map(product => [product._id.toString(), product]));

        // كود خصم اختياري — يجب أن ينطبق على كل منتج مميز في السلة (لا خصم جزئي
        // ولا خصم على منتجات لا يغطيها الكود). الخصم يُحسب على إجمالي الطلب.
        let promoPercent = 0;
        if (promoCode) {
            const cartProducts = [...productMap.values()];
            const promoResult = await applyPromoCodeToProducts({ code: promoCode, products: cartProducts });
            if (!promoResult.ok) {
                const errorMessage = promoResult.error === 'not_applicable'
                    ? 'رمز الخصم لا ينطبق على هذه المنتجات'
                    : 'رمز الخصم غير صالح';
                return res.status(400).json({ success: false, error: errorMessage });
            }
            promoPercent = Number(promoResult.discountPercent) || 0;
        }

        const itemsForOrder = [];
        let total = 0;

        for (const [productId, qty] of quantities) {
            const product = productMap.get(productId);
            if (!product || !product.isActive) {
                return res.status(400).json({ success: false, error: 'أحد المنتجات لم يعد متاحاً.' });
            }

            if (!product.isExternal) {
                const availableCodes = Array.isArray(product.codes)
                    ? product.codes.filter(code => code.status === 'available').length
                    : 0;
                if (availableCodes < qty) {
                    return res.status(409).json({ success: false, error: 'الكمية المطلوبة غير متوفرة لأحد المنتجات.' });
                }
            }

            const unitPrice = Number(product.price);
            const itemPrice = round2(unitPrice * qty);
            total += itemPrice;
            itemsForOrder.push({
                productId: product._id,
                name: getLocalizedValue(product.productName),
                qty,
                unitPrice,
                price: itemPrice,
                fulfilmentType: product.isExternal ? 'external' : 'local',
                fulfilmentStatus: 'pending'
            });
        }

        if (itemsForOrder.length === 0 || total <= 0) {
            return res.status(400).json({ success: false, error: 'تعذر إنشاء طلب صالح من السلة.' });
        }

        // الخصم يُحسب على إجمالي الطلب ويبقى سعر العناصر على حاله (الخادم هو المرجع)
        const discountAmount = promoCode && promoPercent > 0 ? round2(total * promoPercent / 100) : 0;
        if (discountAmount > 0) {
            total = round2(total - discountAmount);
        }

        const orderId = uuidv4().split('-')[0].toUpperCase();
        const newOrder = new Order({
            orderId,
            productName: itemsForOrder.map(item => item.name.ar).join('، '),
            items: itemsForOrder,
            price: total,
            buyerEmail: String(customerEmail).toLowerCase().trim(),
            paymentGateway,
            paymentRef,
            status: 'pending',
            userId: req.user?.userId || null,
            discount: promoCode ? discountAmount : 0,
            discountCode: promoCode || null,
            discountPercent: promoCode ? promoPercent : 0
        });

        await newOrder.save();

        // إشعار الزبون فور الاستلام (لا يُعطّل عملية الدفع عند الفشل)
        notification.sendOrderCreatedEmail(newOrder).catch(err => {
            console.error('Order-created email failure:', err && err.message);
        });

        // Stripe: إنشاء جلسة دفع آمنة مستضافة على Stripe (لا حاجة لمكتبة عميل)
        let stripeUrl = null;
        if (paymentGateway === 'stripe') {
            try {
                const session = await stripeController.createCheckoutSession({
                    orderId,
                    amount: total,
                    currency: siteSettings.currency.code,
                    name: itemsForOrder.map(item => item.name.ar).join('، '),
                    baseUrl: `${req.protocol}://${getSafeBaseHost(req)}`
                });
                newOrder.paymentRef = session.id;
                await newOrder.save();
                stripeUrl = session.url;
            } catch (err) {
                console.error('Stripe checkout error:', err.message);
                newOrder.status = 'failed';
                await newOrder.save();
                return res.status(502).json({ success: false, error: 'تعذر إنشاء جلسة الدفع عبر Stripe، حاول بطريقة أخرى.' });
            }
        }

        // Emit real-time notification to authenticated admin sockets only
        const io = req.app?.get('io');
        if (io) {
            io.to('admins').emit('new_order', {
                orderId: newOrder.orderId,
                buyerEmail: newOrder.buyerEmail,
                price: newOrder.price,
                items: itemsForOrder.map(i => i.name?.ar || ''),
                createdAt: newOrder.createdAt
            });
        }

        res.status(201).json({
            success: true,
            message: 'تم استلام طلبك بنجاح.',
            orderId,
            discount: newOrder.discount,
            discountCode: newOrder.discountCode,
            total: newOrder.price,
            ...(stripeUrl ? { stripeUrl, gateway: 'stripe' } : {})
        });
    } catch (err) {
        console.error('Order creation error:', err);
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء إنشاء الطلب.' });
    }
};

/**
 * التحقق من صحة كود الخصم — يُستخدم من نموذج الدفع والمودال.
 * الجسم المتوقع: { code, productId } لمنتج واحد، أو { code, productIds: [...] } للسلة كاملة.
 * عندما تُرسل السلة كاملة، يتحقق الخادم من أن الكود ينطبق على كل منتج مميز فيها.
 */
exports.validatePromoCode = async (req, res) => {
    try {
        const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
        const productIds = Array.isArray(req.body.productIds) ? req.body.productIds : [];
        const result = productIds.length > 0
            ? await applyPromoCodeToProductIds({ code, productIds })
            : await applyPromoCode({ code, productId: typeof req.body.productId === 'string' ? req.body.productId : '' });
        if (!result.ok) {
            return res.json({ ok: false, code: result.error || 'invalid' });
        }
        res.json({ ok: true, ...result });
    } catch (_err) {
        res.status(200).json({ success: false, code: 'invalid' });
    }
};

/**
 * البحث الشامل في المنتجات
 */
exports.searchAll = async (req, res) => {
    try {
        const { q, lang = 'ar' } = req.query;
        if (typeof q !== 'string' || q.trim().length < 2) {
            return res.json({ success: true, products: [], categories: [] });
        }
        if (q.length > 100) {
            return res.status(400).json({ success: false, error: 'استعلام بحث غير صالح' });
        }
        if (lang !== 'ar' && lang !== 'en') {
            return res.status(400).json({ success: false, error: 'لغة غير صالحة' });
        }

        const searchField = `productName.${lang}`;
        // بحث بادئة (^): متوافق مع الفهرسة السريعة وطبيعة الإكمال التلقائي في الواجهة
        const queryRegex = new RegExp(`^${escapeRegex(q.trim())}`, 'i');
        const products = await Product.find({
            [searchField]: queryRegex,
            isActive: true
        }).limit(10);

        res.json({ success: true, products: products.map(toPublicProduct) });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء البحث.' });
    }
};

/**
 * إرسال تقييم/مراجعة لمنتج (رصيد 1-5 + تعليق اختياري).
 * يُعاد حساب متوسط التقييم وعدد المراجعات آلياً.
 */
// حد أقصى للمراجعات المخزنة داخل المستند لمنع نمو غير محدود للحجم
const MAX_STORED_REVIEWS = 500;

/**
 * إرسال تقييم/مراجعة لمنتج وإعادة حساب المعدل.
 */
exports.submitProductReview = async (req, res) => {
    try {
        const { productId } = req.params;
        if (!productId || !/^[a-fA-F0-9]{24}$/.test(productId)) {
            return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });
        }

        const rating = Number.parseInt(req.body?.rating, 10);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, error: 'التقييم يجب أن يكون بين 1 و 5' });
        }
        const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 500) : '';
        if (comment && comment.length < 3) {
            return res.status(400).json({ success: false, error: 'التعليق قصير جداً (3 أحرف على الأقل)' });
        }

        const product = await Product.findById(productId);
        if (!product || !product.isActive) {
            return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
        }

        product.reviews = Array.isArray(product.reviews) ? product.reviews : [];
        product.reviews.push({
            rating,
            comment,
            reviewerEmail: req.user?.email || null,
            createdAt: new Date()
        });
        // نُبقي المخزون تحت حد معقول ونتخلص من الأقدم أولاً
        if (product.reviews.length > MAX_STORED_REVIEWS) {
            product.reviews.splice(0, product.reviews.length - MAX_STORED_REVIEWS);
        }
        const total = product.reviews.reduce((sum, review) => sum + review.rating, 0);
        product.rating = Math.round((total / product.reviews.length) * 10) / 10;
        product.reviewsCount = product.reviews.length;
        await product.save();

        res.status(201).json({
            success: true,
            message: 'شكراً لتقييمك!',
            rating: product.rating,
            reviewsCount: product.reviewsCount
        });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل حفظ التقييم' });
    }
};

/**
 * جلب أحدث تقييمات / مراجعات منتج.
 */
exports.getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        if (!productId || !/^[a-fA-F0-9]{24}$/.test(productId)) {
            return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });
        }

        const product = await Product.findById(productId).select('rating reviewsCount reviews');
        if (!product) {
            return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
        }

        const reviews = (Array.isArray(product.reviews) ? product.reviews : [])
            .slice(-10)
            .reverse()
            .map(review => ({
                rating: review.rating,
                comment: review.comment || '',
                createdAt: review.createdAt
            }));

        res.json({
            success: true,
            rating: product.rating,
            reviewsCount: product.reviewsCount,
            reviews
        });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب التقييمات' });
    }
};

/**
 * جلب أحدث تقييمات العملاء على مستوى المتجر (للقسم الرئيسي "قالوا عنا").
 * - تُقرأ المراجعات من المنتجات النشطة فقط
 * - يُكشف فقط اسم المنتج المترجم والتقييم والتعليق والتاريخ
 * - لا يُكشف البريد الإلكتروني للمراجع أبداً
 */
exports.getTestimonials = async (_req, res) => {
    try {
        const testimonials = await cacheWrap('testimonials', 300, async () => {
            const products = await Product.find({ isActive: true, 'reviews.0': { $exists: true } })
                .select('productName reviews')
                .limit(60);

            const collected = [];
            for (const product of products) {
                const localizedProductName = getLocalizedValue(product.productName);
                const reviews = Array.isArray(product.reviews) ? product.reviews : [];
                for (const review of reviews) {
                    const rating = Number(review.rating) || 0;
                    if (rating < 1 || rating > 5) continue;
                    if (!review.createdAt) continue; // لا تاريخ صريح → نتخطى المراجعة ولا نلفّق تاريخاً
                    const reviewDate = new Date(review.createdAt);
                    if (!(reviewDate instanceof Date) || Number.isNaN(reviewDate.getTime())) continue;
                    collected.push({
                        productName: localizedProductName,
                        rating,
                        comment: typeof review.comment === 'string' ? review.comment.trim() : '',
                        createdAt: reviewDate
                    });
                }
            }

            collected.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return collected.slice(0, 10);
        });

        res.json({ success: true, testimonials });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل في جلب تقييمات العملاء' });
    }
};

exports.toPublicProduct = toPublicProduct;
