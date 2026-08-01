const { Product, Order, Category } = require('../models');
const { v4: uuidv4 } = require('uuid');

/**
 * جلب جميع الأقسام مع الترجمة الصحيحة.
 */
exports.getCategories = async (req, res) => {
    try {
        const lang = req.query.lang === 'en' ? 'en' : 'ar';
        const categories = await Category.find({ isActive: true }).sort({ order: 1 });

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
        const products = await Product.find({ category: categoryKey, isActive: true });

        // إعادة تشكيل البيانات لإرسال الترجمة الصحيحة فقط
        const localizedProducts = products.map(p => {
            const productObject = p.toObject();
            // اختيار الترجمة الصحيحة مع وجود لغة احتياطية
            productObject.name = p.productName[lang] || p.productName.ar;
            return productObject;
        });
        res.json({ success: true, products: localizedProducts });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل في جلب المنتجات' });
    }
};

exports.getLatestOrders = async (req, res) => {
    // This is a placeholder for the /api/products/latest-orders route used in script.js
    // In a real application, you would fetch actual latest completed orders.
    res.json({ success: true, orders: [] });
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

        let total = 0;
        const itemsForOrder = [];

        for (const item of cartItems) {
            const product = await Product.findById(item.id);
            if (product) {
                total += product.price * item.qty;
                itemsForOrder.push({
                    id: product._id,
                    name: product.productName,
                    qty: item.qty,
                    price: product.price
                });
            }
        }

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

        // البحث في حقل اللغة المحدد
        const searchField = `productName.${lang}`;
        const products = await Product.find({ [searchField]: { $regex: q, $options: 'i' }, isActive: true }).limit(10);
        
        res.json({ success: true, products });

    } catch (err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء البحث.' });
    }
};