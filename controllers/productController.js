const { Product } = require('../models');
const { createLog } = require('./helpers');
const { clearStorefrontCache } = require('./storeController');
const providerSync = require('../providers/sync');
const currency = require('../providers/currency');
const pricing = require('../providers/pricing');

function getLocalizedValue(value, fallback = '') {
    if (!value || typeof value !== 'object') return value || fallback;
    return value.ar || value.en || fallback;
}

const ALLOWED_CATEGORIES = ['gaming_general', 'pubg', 'fortnite', 'playstation', 'xbox',
    'microsoft_windows', 'adobe', 'antivirus', 'vpn', 'google',
    'itunes', 'razer_gold', 'amazon', 'steam'];

// الحقول المسموح بإنشائها يدوياً فقط (whitelist) — يمنع Mass Assignment
// من تمرير حقول النظام مثل _id / createdAt / updatedAt عبر req.body
const MANUAL_ADD_FIELDS = [
    'productName', 'category', 'region', 'price', 'priceCurrency',
    'description', 'image', 'codes', 'isExternal', 'externalId',
    'profitMargin', 'profitMarginOverride', 'basePrice', 'lastProviderPrice',
    'providerCurrency', 'currentProvider', 'isSubscription',
    'subscriptionType', 'subscriptionDuration', 'codeGenerationMethod',
    'isActive'
];

function validateCategory(category) {
    return typeof category === 'string' && ALLOWED_CATEGORIES.includes(category);
}

exports.getInventory = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
        const skip = (page - 1) * limit;

        const [products, total] = await Promise.all([
            Product.find({ isActive: true })
                .select('productName category region price codes updatedAt isExternal externalId profitMargin basePrice currentProvider')
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit),
            Product.countDocuments({ isActive: true })
        ]);

        res.json({ success: true, products, total, page, limit, hasMore: skip + products.length < total });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب المخزون' });
    }
};

exports.addProductManual = async (req, res) => {
    try {
        const productData = {};
        MANUAL_ADD_FIELDS.forEach(field => {
            if (req.body[field] !== undefined) {
                productData[field] = req.body[field];
            }
        });

        const newProduct = new Product(productData);
        await newProduct.save();
        await createLog('إضافة منتج', `تم إضافة منتج يدوي: ${newProduct.productName}`, req, newProduct._id, newProduct.productName);
        res.json({ success: true, message: 'تم إضافة المنتج يدوياً' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        if (!productId || typeof productId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(productId)) {
            return res.status(400).json({ success: false, message: 'معرف المنتج غير صالح' });
        }
        const product = await Product.findById(productId)
            .select('-codes -basePrice -providerOptions');
        if (!product) {
            return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
        }
        res.json({ success: true, ...product.toObject() });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب المنتج.' });
    }
};

// المزامنة الدورية/اليدوية مع المزودين — مفوّضة إلى providers/sync
const syncInventoryInternal = async () => providerSync.syncInventoryInternal();

exports.syncInventoryInternal = syncInventoryInternal;

exports.syncExternalProducts = async (req, res) => {
    const result = await providerSync.syncCatalog();
    if (result.success || result.providers.length > 0) {
        const count = result.totalCreated + result.totalUpdated;
        await createLog('مزامنة يدوية', `تم تحديث ${count} منتج عبر المزامنة`, req);
        res.json({
            success: true,
            message: `✅ تمت المزامنة بنجاح. تم تحديث ${count} منتجاً.`,
            ...result
        });
    } else {
        res.status(500).json({ success: false, error: 'فشل مزامنة المنتجات الخارجية' });
    }
};

exports.updateProductMargin = async (req, res) => {
    try {
        let { margin } = req.body;
        const { productId } = req.params;
        const normalized = pricing.normalizeMargin(margin);

        if (normalized === null || normalized < 1) {
            return res.status(400).json({ success: false, message: 'هامش الربح يجب أن يكون 1.0 (أو نسبة % إيجابية) أو أكثر.' });
        }
        margin = normalized;

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: 'المنتج غير موجود' });

        const oldMargin = product.profitMargin;
        product.profitMargin = margin;
        product.profitMarginOverride = true;
        
        if (product.isExternal && product.basePrice > 0) {
            product.price = pricing.computeSellingPrice({ basePrice: product.basePrice, margin });
        }
        
        await product.save();
        await createLog('تعديل هامش ربح', `تغيير الهامش من ${oldMargin} إلى ${margin} لمنتج: ${product.productName}`, req, product._id, product.productName);
        
        res.json({ success: true, message: 'تم تحديث هامش الربح بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * إنشاء منتج جديد (يدعم الأنواع: محلي، خارجي، اشتراك)
 */
exports.createProduct = async (req, res) => {
    try {
        const {
            productName,
            category,
            region,
            price,
            description,
            image,
            isExternal,
            externalId,
            profitMargin,
            basePrice,
            provider,
            isSubscription,
            subscriptionDuration,
            subscriptionType
        } = req.body;

        // Validate required fields
        if (!productName || !productName.ar || !productName.en) {
            return res.status(400).json({ success: false, message: 'اسم المنتج مطلوب بالعربية والإنجليزية.' });
        }
        if (!validateCategory(category)) {
            return res.status(400).json({ success: false, message: 'الفئة المحددة غير صالحة.' });
        }

        const productData = {
            productName,
            category,
            region: region || 'global',
            price: parseFloat(price) || 0,
            priceCurrency: currency.STORE_CURRENCY,
            description: description || {
                ar: 'لا يوجد وصف متاح حالياً لهذا المنتج.',
                en: 'No description is available for this product at the moment.'
            },
            image: image || '',
            isExternal: isExternal || false,
            profitMargin: pricing.normalizeMargin(profitMargin) || 1.10,
            profitMarginOverride: Boolean(profitMargin && pricing.normalizeMargin(profitMargin) >= 1),
            basePrice: basePrice || 0,
            currentProvider: provider || 'Local',
            isSubscription: isSubscription || false,
            subscriptionType: subscriptionType || 'fixed',
            subscriptionDuration: subscriptionDuration || null
        };

        if (isExternal && externalId) {
            productData.externalId = externalId;
        }

        const newProduct = new Product(productData);
        await newProduct.save();

        await createLog(
            'إنشاء منتج',
            `تم إنشاء منتج جديد: ${productName.ar || productName}`,
            req,
            newProduct._id,
            productName.ar || productName.en
        );

        res.status(201).json({
            success: true,
            message: '✅ تم إنشاء المنتج بنجاح!',
            product: {
                _id: newProduct._id,
                productName: newProduct.productName,
                category: newProduct.category,
                price: newProduct.price,
                isExternal: newProduct.isExternal,
                isSubscription: newProduct.isSubscription
            }
        });
    } catch (err) {
        console.error('Create product error:', err);
        res.status(500).json({ success: false, error: 'فشل إنشاء المنتج.' });
    }
};

/**
 * إنشاء منتج مع كودات يدوي — يدعم رفع ملف CSV أو إرسال كودات كمصفوفة
 * @route POST /api/admin/inventory/add-manual
 * @body { productName:{ar,en}, category, price, manualCodes:[string] }
 * @body [optional] file CSV عبر multipart/form-data
 */
exports.createProductWithManualCodes = async (req, res) => {
    try {
        const {
            productName,
            category,
            region = 'global',
            price = 0,
            description,
            image = '',
            isExternal = false,
            externalId,
            profitMargin = 1.10,
            basePrice = 0,
            provider = 'Local',
            isSubscription = false,
            subscriptionType = 'fixed',
            subscriptionDuration = null,
            manualCodes = [],
        } = req.body;

        // ✅ التحقق من الاسم المطلوب (ar + en)
        if (!productName || !productName.ar || !productName.en) {
            return res.status(400).json({
                success: false,
                message: 'اسم المنتج مطلوب بالعربية والإنجليزية.'
            });
        }

        // ✅ التحقق من الفئة
        if (!validateCategory(category)) {
            return res.status(400).json({
                success: false,
                message: 'الفئة المحددة غير صالحة.'
            });
        }

        // ✅ معالجة الكودات اليدوية
        const codes = [];
        if (Array.isArray(manualCodes) && manualCodes.length > 0) {
            const seenCodes = new Set();
            for (const code of manualCodes) {
                const trimmed = String(code).trim();
                if (trimmed && !seenCodes.has(trimmed)) {
                    seenCodes.add(trimmed);
                    codes.push({ value: trimmed, status: 'available' });
                }
            }
        }

        const productData = {
            productName,
            category,
            region,
            price: parseFloat(price) || 0,
            priceCurrency: currency.STORE_CURRENCY,
            description: description || {
                ar: 'لا يوجد وصف متاح حالياً لهذا المنتج.',
                en: 'No description is available for this product at the moment.'
            },
            image,
            codes,
            isExternal,
            profitMargin: pricing.normalizeMargin(profitMargin) || 1.10,
            profitMarginOverride: Boolean(pricing.normalizeMargin(profitMargin) >= 1),
            basePrice: basePrice || 0,
            currentProvider: provider || 'Local',
            isSubscription,
            subscriptionType,
            subscriptionDuration
        };

        if (isExternal && externalId) {
            productData.externalId = externalId;
        }

        const newProduct = new Product(productData);
        await newProduct.save();

        await createLog(
            'إنشاء منتج يدوي',
            `تم إنشاء منتج يدوي جديد: ${productName.ar || productName.en} بـ ${codes.length} كود`,
            req,
            newProduct._id,
            productName.ar || productName.en
        );

        clearStorefrontCache();
        res.status(201).json({
            success: true,
            message: `✅ تم إنشاء المنتج بنجاح! (${codes.length} كود مضافة)`,
            product: {
                _id: newProduct._id,
                productName: newProduct.productName,
                category: newProduct.category,
                price: newProduct.price,
                codesCount: codes.length,
                isExternal: newProduct.isExternal,
                isSubscription: newProduct.isSubscription
            }
        });

    } catch (err) {
        console.error('Create product with manual codes error:', err);
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'هذا الكود مستخدم مسبقًا. يرجى استخدام كودات فريدة.'
            });
        }
        res.status(500).json({
            success: false,
            error: 'فشل إنشاء المنتج. يرجى المحاولة لاحقًا.'
        });
    }
};

/**
 * تحديث منتج موجود
 */
exports.updateProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const updates = req.body;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
        }

        // Update allowed fields
        const allowedFields = ['productName', 'category', 'region', 'price', 'description', 'image', 
                               'isExternal', 'externalId', 'profitMargin', 'basePrice', 
                               'currentProvider', 'isActive', 'isSubscription', 'subscriptionType', 
                               'subscriptionDuration', 'rating', 'reviewsCount'];

        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                if (field === 'profitMargin') {
                    const normalized = pricing.normalizeMargin(updates[field]);
                    if (normalized) product[field] = normalized;
                } else {
                    product[field] = updates[field];
                }
            }
        });

        // ضبط الهامش يدوياً يقفل التجاوز التلقائي من المزامنة
        if (updates.profitMargin !== undefined) {
            const normalized = pricing.normalizeMargin(updates.profitMargin);
            product.profitMarginOverride = Boolean(normalized && normalized >= 1);
        }

        // أي تعديل يدوي على السعر يُعتبر بعملة المتجر الحالية
        if (updates.price !== undefined || updates.basePrice !== undefined) {
            product.priceCurrency = currency.STORE_CURRENCY;
        }

        // Recalculate price if basePrice or margin changed
        if (product.isExternal && product.basePrice > 0) {
            product.price = pricing.computeSellingPrice({ basePrice: product.basePrice, margin: product.profitMargin });
        }

        product.updatedAt = new Date();
        await product.save();

        clearStorefrontCache();
        await createLog(
            'تعديل منتج',
            `تم تحديث المنتج: ${product.productName.ar || product.productName.en}`,
            req,
            product._id,
            product.productName.ar || product.productName.en
        );

        res.json({ success: true, message: '✅ تم تحديث المنتج بنجاح!', product });
    } catch (err) {
        console.error('Update product error:', err);
        res.status(500).json({ success: false, error: 'فشل تحديث المنتج.' });
    }
};

/**
 * حذف منتج (إلغاء تفعيله فعلياً)
 */
exports.deleteProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const { permanentDelete } = req.body;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
        }

        const productName = product.productName.ar || product.productName.en;

        if (permanentDelete) {
            await Product.deleteOne({ _id: productId });
            await createLog('حذف منتج نهائي', `تم حذف المنتج نهائياً: ${productName}`, req, productId, productName);
        } else {
            product.isActive = false;
            await product.save();
            await createLog('إلغاء تفعيل منتج', `تم إلغاء تفعيل المنتج: ${productName}`, req, productId, productName);
        }

        clearStorefrontCache();
        res.json({ success: true, message: `✅ ${permanentDelete ? 'تم حذف المنتج نهائياً' : 'تم إلغاء تفعيل المنتج'}!` });
    } catch (err) {
        console.error('Delete product error:', err);
        res.status(500).json({ success: false, error: 'فشل حذف المنتج.' });
    }
};

/**
 * تكرار منتج (إنشاء نسخة مطابقة)
 */
exports.duplicateProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const { newName, newPrice, newCategory } = req.body;

        const originalProduct = await Product.findById(productId).lean();
        if (!originalProduct) {
            return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
        }

        const duplicatedProduct = new Product({
            ...originalProduct,
            _id: undefined,
            productName: newName 
                ? { 
                    ar: newName.ar || originalProduct.productName.ar,
                    en: newName.en || originalProduct.productName.en
                  }
                : originalProduct.productName,
            price: newPrice ? parseFloat(newPrice) : originalProduct.price,
            category: newCategory || originalProduct.category,
            codes: [],
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await duplicatedProduct.save();

        await createLog(
            'تكرار منتج',
            `تم تكرار المنتج: ${originalProduct.productName.ar} → ${duplicatedProduct.productName.ar}`,
            req,
            duplicatedProduct._id,
            duplicatedProduct.productName.ar
        );

        const { codes: _c, basePrice: _bp, providerOptions: _po, ...safeProduct } = duplicatedProduct.toObject();
        res.status(201).json({
            success: true,
            message: '✅ تم تكرار المنتج بنجاح!',
            product: safeProduct
        });
    } catch (err) {
        console.error('Duplicate product error:', err);
        res.status(500).json({ success: false, error: 'فشل تكرار المنتج.' });
    }
};

/**
 * تحديث جماعي لعدة منتجات (سعر، حالة، هامش).
 */
exports.bulkUpdateProducts = async (req, res) => {
    try {
        const { productIds, updates } = req.body;
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({ success: false, message: 'حدد منتجات للتحديث' });
        }
        if (productIds.length > 50) {
            return res.status(400).json({ success: false, message: 'الحد الأقصى 50 منتج لكل عملية' });
        }

        const allowedUpdates = {};
        if (updates.price !== undefined) allowedUpdates.price = Number(updates.price);
        if (updates.profitMargin !== undefined) allowedUpdates.profitMargin = Number(updates.profitMargin);
        if (updates.isActive !== undefined) allowedUpdates.isActive = Boolean(updates.isActive);
        if (updates.category !== undefined) allowedUpdates.category = updates.category;

        if (Object.keys(allowedUpdates).length === 0) {
            return res.status(400).json({ success: false, message: 'لا توجد حقول للتحديث' });
        }
        allowedUpdates.updatedAt = new Date();

        const result = await Product.updateMany(
            { _id: { $in: productIds } },
            { $set: allowedUpdates }
        );

        await createLog('تحديث جماعي', `تم تحديث ${result.modifiedCount} منتج`, req);
        res.json({ success: true, message: `تم تحديث ${result.modifiedCount} منتج`, modifiedCount: result.modifiedCount });
    } catch (err) {
        console.error('Bulk update error:', err);
        res.status(500).json({ success: false, error: 'فشل التحديث الجماعي' });
    }
};

/**
 * جلب إحصاءات المخزون
 */
exports.getStockStats = async (req, res) => {
    try {
        const products = await Product.find({});
        const totalProducts = products.length;
        const activeProducts = products.filter(p => p.isActive).length;
        let lowStockProducts = 0;
        let outOfStockProducts = 0;
        let subscriptionCount = 0;
        let externalCount = 0;

        products.forEach(product => {
            if (product.isSubscription) subscriptionCount++;
            if (product.isExternal) externalCount++;
            
            if (!product.isExternal) {
                const available = product.codes ? product.codes.filter(c => c.status === 'available').length : 0;
                if (available === 0) outOfStockProducts++;
                else if (available < 10) lowStockProducts++;
            }
        });

        res.json({
            success: true,
            stats: {
                totalProducts,
                activeProducts,
                lowStockProducts,
                outOfStockProducts,
                subscriptionCount,
                externalCount
            }
        });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب إحصاءات المخزون.' });
    }
};

/**
 * جلب المنتجات ذات المخزون المنخفض (أقل من 5 قطع).
 */
exports.getLowStockProducts = async (req, res) => {
    try {
        const products = await Product.find({ isActive: true, isExternal: false })
            .select('productName image category codes')
            .limit(100);

        const lowStock = products.filter(p => {
            const available = p.codes ? p.codes.filter(c => c.status === 'available').length : 0;
            return available > 0 && available < 5;
        }).map(p => ({
            _id: p._id,
            name: getLocalizedValue(p.productName),
            image: p.image || '',
            category: p.category,
            stock: p.codes ? p.codes.filter(c => c.status === 'available').length : 0
        }));

        res.json({ success: true, products: lowStock });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب المنتجات المنخفضة المخزون' });
    }
};

/**
 * تهريب حقل CSV بشكل آمن + منع Formula Injection
 * (البادئات = + - @ قد تُنفَّذ كصيغ داخل Excel/LibreOffice)
 */
function csvEscape(value) {
    let str = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
    }
    if (/[",\n\r]/.test(str)) {
        str = `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * تصدير جميع المنتجات بصيغة CSV
 */
exports.exportProductsCSV = async (req, res) => {
    try {
        const products = await Product.find({}).lean();
        
        // Create CSV content
        const header = [
            'الاسم عربي', 'Name English', 'الفئة', 'المنطقة', 'السعر', 
            'هامش الربح', 'السعر الأساسي', 'نوع المنتج', 'نوع الاشتراك',
            'مدة الاشتراك (أيام)', 'المزود', 'معرف المزود', 'رابط الصورة',
            'الوصف عربي', 'Description English', 'الحالة'
        ];

        const rows = products.map(product => {
            
            return [
                csvEscape(product.productName?.ar || ''),
                csvEscape(product.productName?.en || ''),
                csvEscape(product.category || ''),
                csvEscape(product.region || ''),
                csvEscape(Math.round(product.price || 0)),
                csvEscape(product.profitMargin !== undefined && product.profitMargin !== null
                    ? pricing.normalizeMargin(product.profitMargin)
                    : '1.10'),
                csvEscape(product.basePrice?.toString() || '0'),
                csvEscape(product.isSubscription ? 'اشتراك' : (product.isExternal ? 'خارجي' : 'محلي')),
                csvEscape(product.subscriptionType || ''),
                csvEscape(product.subscriptionDuration?.toString() || ''),
                csvEscape(product.currentProvider || 'Local'),
                csvEscape(product.externalId || ''),
                csvEscape(product.image || ''),
                csvEscape(product.description?.ar || ''),
                csvEscape(product.description?.en || ''),
                csvEscape(product.isActive ? 'نشط' : 'غير نشط')
            ].join(',');
        });

        // Add BOM for Arabic support
        const csvContent = `\uFEFF${  [header.join(','), ...rows].join('\n')}`;
        
        await createLog('تصدير منتجات', `تم تصدير ${products.length} منتج بصيغة CSV`, req);

        res.header('Content-Type', 'text/csv;charset=utf-8');
        res.header('Content-Disposition', `attachment; filename=joker_products_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvContent);
        
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ success: false, error: 'فشل تصدير المنتجات.' });
    }
};

/**
 * استيراد منتجات من CSV
 */
exports.importProductsCSV = async (req, res) => {
    try {
        const { csvData } = req.body;
        
        if (!csvData || !csvData.trim()) {
            return res.status(400).json({ success: false, message: 'البيانات المرسلة فارغة.' });
        }

        const lines = csvData.trim().split('\n');
        const results = { success: 0, errors: 0, errorDetails: [] };
        
        // Parse CSV more accurately (handling Arabic commas/quotes)
        const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"' && (line[i+1] === '"')) {
                    current += '"';
                    i++;
                } else if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current);
            return result;
        };

        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            try {
                const fields = parseCSVLine(lines[i]);
                
                // Map CSV fields to product schema
                const productData = {
                    productName: {
                        ar: fields[0]?.trim() || 'منتج جديد',
                        en: fields[1]?.trim() || 'New Product'
                    },
                    category: fields[2]?.trim() || 'gaming_general',
                    region: fields[3]?.trim() || 'global',
                    price: parseFloat(fields[4]) || 0,
                    priceCurrency: currency.STORE_CURRENCY,
                    profitMargin: parseFloat(fields[5]) || 1.10,
                    basePrice: parseFloat(fields[6]) || 0,
                    isSubscription: fields[7]?.trim() === 'اشتراك' || fields[7]?.trim() === 'subscription',
                    subscriptionType: fields[8]?.trim() === 'recurring' ? 'recurring' : 'fixed',
                    subscriptionDuration: fields[9] && parseInt(fields[9]) ? parseInt(fields[9]) : null,
                    currentProvider: fields[10]?.trim() || 'Local',
                    externalId: fields[11]?.trim() || undefined,
                    image: fields[12]?.trim() || '',
                    description: {
                        ar: fields[13]?.trim() || 'لا يوجد وصف متاح حالياً لهذا المنتج.',
                        en: fields[14]?.trim() || 'No description is available for this product at the moment.'
                    },
                    isActive: fields[15]?.trim() !== 'غير نشط',
                    isExternal: fields[15]?.trim() === 'خارجي' || fields[7]?.trim() === 'خارجي'
                };

                // Check if product already exists (by English name) to handle "update existing"
                // eslint-disable-next-line no-await-in-loop
                const existingProduct = await Product.findOne({
                    'productName.en': productData.productName.en,
                    category: productData.category
                });

                if (existingProduct) {
                    // Update existing product
                    Object.assign(existingProduct, productData);
                    existingProduct.updatedAt = new Date();
                    // eslint-disable-next-line no-await-in-loop
                    await existingProduct.save();
                } else {
                    // Create new product
                    const newProduct = new Product(productData);
                    // eslint-disable-next-line no-await-in-loop
                    await newProduct.save();
                }
                
                results.success++;
                
            } catch (err) {
                results.errors++;
                results.errorDetails.push(`الصف ${i + 1}: ${err.message}`);
            }
        }

        await createLog('استيراد منتجات', `تم استيراد ${results.success} منتج من CSV (${results.errors} أخطاء)`, req);

        const message = results.errors > 0 
            ? `تم استيراد ${results.success} منتج بنجاح، مع ${results.errors} خطأ.`
            : `✅ تم استيراد ${results.success} منتج بنجاح!`;
            
        res.json({ 
            success: true, 
            message: message,
            successCount: results.success,
            errorCount: results.errors,
            errors: results.errorDetails
        });
        
    } catch (err) {
        console.error('Import error:', err);
        res.status(500).json({ success: false, error: `فشل استيراد المنتجات: ${  err.message}` });
    }
};