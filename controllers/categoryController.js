const { Category } = require('../models');
const { createLog } = require('./helpers');
const { clearStorefrontCache } = require('./storeController');

exports.getCategories = async (req, res) => {
    try {
        // عدد المنتجات لكل قسم يُحسب مباشرة ليفرّق الأدمن بين الأقسام النشطة والفارغة
        const categories = await Category.aggregate([
            {
                $lookup: {
                    from: 'products',
                    localField: 'key',
                    foreignField: 'category',
                    as: 'items'
                }
            },
            { $addFields: { productCount: { $size: '$items' } } },
            { $sort: { order: 1 } },
            { $project: { items: 0 } }
        ]);
        res.json({ success: true, categories });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب الأقسام' });
    }
};

exports.createCategory = async (req, res) => {
    try {
        const { key, titleAr, titleEn, descriptionAr, descriptionEn, image, order } = req.body;
        if (!key || !titleAr || !titleEn) {
            return res.status(400).json({ success: false, message: 'المفتاح والعنوان بالعربية والإنجليزية مطلوب' });
        }
        const existing = await Category.findOne({ key });
        if (existing) {
            return res.status(409).json({ success: false, message: 'هذا المفتاح موجود مسبقاً' });
        }
        const category = new Category({
            key,
            title: { ar: titleAr, en: titleEn },
            description: { ar: descriptionAr || '', en: descriptionEn || '' },
            image: image || '',
            order: order || 0
        });
        await category.save();
        clearStorefrontCache();
        await createLog('إضافة قسم', `تم إضافة قسم: ${titleAr}`, req, category._id, titleAr);
        res.status(201).json({ success: true, message: '✅ تم إضافة القسم بنجاح', category });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.updateCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const updates = req.body;
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: 'القسم غير موجود' });
        }
        if (updates.titleAr) category.title.ar = updates.titleAr;
        if (updates.titleEn) category.title.en = updates.titleEn;
        if (updates.descriptionAr !== undefined) category.description.ar = updates.descriptionAr;
        if (updates.descriptionEn !== undefined) category.description.en = updates.descriptionEn;
        if (updates.image !== undefined) category.image = updates.image;
        if (updates.order !== undefined) category.order = updates.order;
        if (updates.isActive !== undefined) category.isActive = updates.isActive;
        if (updates.key) category.key = updates.key;

        await category.save();
        clearStorefrontCache();
        await createLog('تعديل قسم', `تم تعديل القسم: ${category.title.ar}`, req, category._id, category.title.ar);
        res.json({ success: true, message: '✅ تم تحديث القسم بنجاح', category });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const category = await Category.findByIdAndDelete(categoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: 'القسم غير موجود' });
        }
        clearStorefrontCache();
        await createLog('حذف قسم', `تم حذف القسم: ${category.title.ar}`, req, categoryId, category.title.ar);
        res.json({ success: true, message: '✅ تم حذف القسم بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
