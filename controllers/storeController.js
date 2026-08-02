const { Product, Order, Category } = require('../models');
const { v4: uuidv4 } = require('uuid');

/**
 * جلب جميع الأقسام مع الترجمة الصحيحة.
 */
exports.getCategories = async (req, res) => {
    try {
        const lang = req.query.lang === 'en' ? 'en' : 'ar';
        const categories = await Category.find({ isActive: true }).sort({ order: 1 });

        // تحسين: التأكد من أن حقل title و description هو كائن قبل محاولة الوصول إلى lang أو ar
        categories.forEach(cat => {
            if (typeof cat.title !== 'object' || cat.title === null) {
                // إذا لم يكن title كائناً، قم بتحويله إلى كائن مع قيمة افتراضية
                cat.title = { ar: String(cat.title), en: String(cat.title) };
            }
            // التأكد من أن حقل description هو كائن
            // إذا لم يكن description كائناً، قم بتحويله إلى كائن مع قيمة افتراضية
            if (typeof cat.description !== 'object' || cat.description === null) {
                cat.description = { ar: String(cat.description), en: String(cat.description) };
            }
        });

        // إعادة تشكيل البيانات لتكون كائن key-value كما يتوقعه الفرونت اند
        const localizedCategories = {};
        categories.forEach(cat => {
            localizedCategories[cat.key] = {
                title: cat.title[lang] || cat.title.ar,
                desc: cat.description[lang] || cat.description.ar,
                image: cat.image
            };
        });

        res.json({ success: true, categories: localizedCategories });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch categories' });
    }
};

exports.getProductsByCategory = async (req, res) => {
    try {
        const lang = req.query.lang === 'en' ? 'en' : 'ar'; // اللغة الافتراضية هي العربية
        const { categoryKey } = req.params;
        
        // Validate category key to prevent NoSQL injection
        if (!categoryKey || typeof categoryKey !== 'string' || !/^[a-zA-Z0-9_]+$/.test(categoryKey)) {
            return res.status(400).json({ success: false, error: 'مفتاح الفئة غير صالح' });
        }
        
        const products = await Product.find({ category: categoryKey, isActive: true });

        // تحسين: التأكد من أن productName هو كائن قبل إرساله
        products.forEach(product => {
            if (typeof product.productName !== 'object' || product.productName === null) {
                product.productName = { ar: String(product.productName), en: String(product.productName) };
            }
            // التأكد من أن حقل description (إذا وجد) هو كائن
            if (product.description && (typeof product.description !== 'object' || product.description === null)) {
                product.description = { ar: String(product.description), en: String(product.description) };
            }
        });
        res.json({ success: true, products: products });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل في جلب المنتجات' });
    }
};

exports.getLatestOrders = async (req, res) => {
    // This is a placeholder for the /api/products/latest-orders route used in script.js
    // 🚀 تنفيذ حقيقي: جلب آخر 5 طلبات مكتملة
    try {
        const latestOrders = await Order.find({ status: 'completed' })
            .sort({ completedAt: -1 }) // الأحدث أولاً
            .limit(5) // آخر 5 طلبات
            .select('orderId items.name'); // فقط الحقول الضرورية

        // تنسيق البيانات لتناسب العرض في شريط الثقة
        const formattedOrders = latestOrders.map(order => ({ orderId: order.orderId, productName: order.items[0]?.name || 'منتج' }));
        res.json({ success: true, orders: formattedOrders });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل في جلب آخر الطلبات' });
    }
};

/**
 * جلب المنتجات الأكثر مبيعاً بناءً على عدد مرات شرائها في الطلبات المكتملة.
 */
exports.getBestSellingProducts = async (req, res) => {
    try {
        const lang = req.query.lang === 'en' ? 'en' : 'ar';
        const limit = parseInt(req.query.limit) || 8; // جلب أفضل 8 منتجات افتراضياً

        const bestSellers = await Order.aggregate([
            { $match: { status: 'completed' } }, // 1. فلترة الطلبات المكتملة فقط
            { $unwind: '$items' }, // 2. تفكيك مصفوفة المنتجات داخل كل طلب
            { 
                $group: { // 3. تجميع حسب معرف المنتج وحساب إجمالي الكمية المباعة
                    _id: '$items.id',
                    totalSold: { $sum: '$items.qty' }
                } 
            },
            { $sort: { totalSold: -1 } }, // 4. ترتيب تنازلي حسب الأكثر مبيعاً
            { $limit: limit }, // 5. أخذ العدد المحدد فقط
            { // 6. ربط النتائج مع جدول المنتجات لجلب تفاصيلها الكاملة
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: '$productDetails' }, // 7. تفكيك مصفوفة تفاصيل المنتج
            { // 8. إعادة تشكيل المخرجات بالشكل المطلوب للواجهة الأمامية
                $project: {
                    _id: '$productDetails._id',
                    productName: `$productDetails.productName`, // إرسال كائن اللغة كاملاً
                    price: '$productDetails.price',
                    image: '$productDetails.image',
                    category: '$productDetails.category',
                    region: '$productDetails.region',
                    totalSold: '$totalSold'
                }
            }
        ]);

        // لا حاجة لترجمة يدوية هنا لأننا نرسل كائن اللغة كاملاً
        res.json({ success: true, products: bestSellers });

    } catch (err) {
        console.error("Error fetching best selling products:", err);
        res.status(500).json({ success: false, error: 'فشل في جلب المنتجات الأكثر مبيعاً' });
    }
};

/**
 * جلب أحدث المنتجات المضافة إلى المتجر.
 */
exports.getNewlyAddedProducts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 8; // جلب أحدث 8 منتجات افتراضياً

        const newProducts = await Product.find({ isActive: true })
            .sort({ createdAt: -1 }) // 1. ترتيب تنازلي حسب تاريخ الإنشاء
            .limit(limit)             // 2. أخذ العدد المحدد فقط
            .select('productName price category image region'); // 3. اختيار الحقول الضرورية فقط

        newProducts.forEach(product => {
            if (typeof product.productName !== 'object' || product.productName === null) {
                product.productName = { ar: String(product.productName), en: String(product.productName) };
            }
        });

        // لا حاجة للترجمة هنا، الواجهة الأمامية ستتعامل مع كائن اللغة
        res.json({ success: true, products: newProducts });

    } catch (err) {
        console.error("Error fetching newly added products:", err);
        res.status(500).json({ success: false, error: 'فشل في جلب أحدث المنتجات' });
    }
};

/**
 * جلب منتجات ذات صلة بمنتج معين (من نفس القسم).
 */
exports.getRelatedProducts = async (req, res) => {
    try {
        const { productId } = req.params;
        const lang = req.query.lang === 'en' ? 'en' : 'ar';
        const limit = parseInt(req.query.limit) || 4; // جلب 4 منتجات كحد أقصى

        // Validate productId format to prevent NoSQL injection
        if (!productId || typeof productId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(productId)) {
            return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });
        }

        // 1. العثور على المنتج الأصلي لمعرفة قسمه
        const originalProduct = await Product.findById(productId).select('category');
        if (!originalProduct) {
            return res.status(404).json({ success: false, error: 'المنتج الأصلي غير موجود' });
        }

        // 2. جلب منتجات أخرى من نفس القسم، مع استثناء المنتج الأصلي نفسه
        const relatedProducts = await Product.find({
            category: originalProduct.category,
            _id: { $ne: productId }, // استثناء المنتج الحالي
            isActive: true
        })
        .limit(limit)
        .select('productName price category image region');
        
        relatedProducts.forEach(product => {
            if (typeof product.productName !== 'object' || product.productName === null) {
                product.productName = { ar: String(product.productName), en: String(product.productName) };
            }
        });
        res.json({ success: true, products: relatedProducts });

    } catch (err) {
        console.error("Error fetching related products:", err);
        res.status(500).json({ success: false, error: 'فشل في جلب المنتجات ذات الصلة' });
    }
};

/**
 * جلب قائمة خفيفة بجميع المنتجات لأغراض البحث السريع في الواجهة الأمامية.
 */
exports.getSearchIndex = async (req, res) => {
    try {
        // جلب الحقول الضرورية للبحث فقط لتقليل حجم البيانات
        const products = await Product.find({ isActive: true })
            .select('productName price category image');
        products.forEach(product => {
            if (typeof product.productName !== 'object' || product.productName === null) {
                product.productName = { ar: String(product.productName), en: String(product.productName) };
            }
        });
        res.json({ success: true, products });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل في بناء فهرس البحث.' });
    }
};

exports.createOrder = async (req, res) => {
    try {
        const { cartItems, customerEmail, paymentGateway, paymentRef } = req.body;

        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({ success: false, error: 'سلة المشتريات فارغة.' });
        }

        // Validate product IDs to prevent NoSQL injection
        for (const item of cartItems) {
            if (!item.id || typeof item.id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(item.id)) {
                return res.status(400).json({ success: false, error: 'معرف منتج غير صالح في السلة.' });
            }
            if (item.qty < 1 || item.qty > 99) {
                return res.status(400).json({ success: false, error: 'كمية غير صالحة.' });
            }
        }

        let total = 0;
        const itemsForOrder = []; // لتخزين تفاصيل المنتجات في الطلب

        // 🚀 تحسين: جلب جميع المنتجات في استعلام واحد
        const productIds = cartItems.map(item => item.id);
        const productsInCart = await Product.find({ _id: { $in: productIds } });
        const productMap = new Map(productsInCart.map(p => [p._id.toString(), p]));

        cartItems.forEach(item => {
            const product = productMap.get(item.id);
            if (product && product.isActive) { // تأكد أن المنتج موجود ونشط
                total += product.price * item.qty; // حساب الإجمالي
                itemsForOrder.push({ // إضافة تفاصيل المنتج للطلب
                    id: product._id,
                    name: product.productName, // سيتم تخزين كائن اللغة هنا
                    qty: item.qty,
                    price: product.price
                });
            }
        });

        const newOrder = new Order({
            orderId: uuidv4().split('-')[0].toUpperCase(), // رقم طلب عشوائي فريد
            items: itemsForOrder,
            price: total,
            buyerEmail: customerEmail,
            paymentGateway: paymentGateway,
            paymentRef: paymentRef,
            status: 'pending',
        });

        // ✨ الربط مع المستخدم المسجل دخوله
        if (req.user && req.user.userId) {
            newOrder.userId = req.user.userId;
        }

        await newOrder.save();

        res.status(201).json({ success: true, message: 'تم استلام طلبك بنجاح.' });

    } catch (err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء إنشاء الطلب.' });
    }
};

/**
 * البحث الشامل في المنتجات
 */
exports.searchAll = async (req, res) => {
    try {
        const { q, lang = 'ar' } = req.query;
        if (!q || q.trim().length < 2) {
            return res.json({ success: true, products: [], categories: [] });
        }

        // Validate search parameters
        if (typeof q !== 'string' || q.length > 100) {
            return res.status(400).json({ success: false, error: 'استعلام بحث غير صالح' });
        }
        
        // Only allow 'ar' or 'en' to prevent NoSQL injection through the search field
        if (lang !== 'ar' && lang !== 'en') {
            return res.status(400).json({ success: false, error: 'لغة غير صالحة' });
        }

        // البحث في حقل اللغة المحدد
        const searchField = `productName.${lang}`;
        const products = await Product.find({ [searchField]: { $regex: q, $options: 'i' }, isActive: true }).limit(10);
        
        res.json({ success: true, products });

    } catch (err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء البحث.' });
    }
};