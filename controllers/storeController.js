const { Product, Order, Category } = require('../models');
const { v4: uuidv4 } = require('uuid');
const siteSettings = require('../config/siteSettings');

const DEFAULT_PRODUCT_LIMIT = 8;
const MAX_PRODUCT_LIMIT = 24;

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
        reviewsCount: Number(source.reviewsCount) || 0
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
        const categories = await Category.find({ isActive: true }).sort({ order: 1 });
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
 * جلب الإعدادات العامة للمتجر (أرقام الدفع، روابط التواصل، الإحصائيات).
 */
exports.getSiteConfig = (_req, res) => {
    res.json({
        success: true,
        config: {
            payment: {
                jawwalNumber: siteSettings.payment.jawwalNumber,
                palpayNumber: siteSettings.payment.palpayNumber
            },
            currency: siteSettings.currency,
            social: siteSettings.social,
            stats: siteSettings.stats
        }
    });
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
        const bestSellers = await Order.aggregate([
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
        ]);

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
        const products = await Product.find({ isActive: true })
            .sort({ createdAt: -1 })
            .limit(limit);

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
        const products = await Product.find({ isActive: true });
        res.json({ success: true, products: products.map(toPublicProduct) });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل في بناء فهرس البحث.' });
    }
};

exports.createOrder = async (req, res) => {
    try {
        const { cartItems, customerEmail, paymentGateway, paymentRef } = req.body;
        if (!Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({ success: false, error: 'سلة المشتريات فارغة.' });
        }

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
            const itemPrice = unitPrice * qty;
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
            userId: req.user?.userId || null
        });

        await newOrder.save();

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

        res.status(201).json({ success: true, message: 'تم استلام طلبك بنجاح.', orderId });
    } catch (err) {
        console.error('Order creation error:', err);
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء إنشاء الطلب.' });
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
        const products = await Product.find({
            [searchField]: { $regex: escapeRegex(q.trim()), $options: 'i' },
            isActive: true
        }).limit(10);

        res.json({ success: true, products: products.map(toPublicProduct) });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء البحث.' });
    }
};

exports.toPublicProduct = toPublicProduct;
