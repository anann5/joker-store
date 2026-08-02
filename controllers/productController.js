const { Product } = require('../models');
const { createLog, sendTelegramAlert, fetchProviderBalances, externalProviders } = require('./helpers');
const axios = require('axios');

exports.getInventory = async (req, res) => {
    try {
        const products = await Product.find({ isActive: true }).select('productName category region price codes updatedAt isExternal externalId profitMargin basePrice currentProvider');
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: 'فشل جلب المخزون' });
    }
};

exports.addProductManual = async (req, res) => {
    try {
        const newProduct = new Product(req.body);
        await newProduct.save();
        await createLog('إضافة منتج', `تم إضافة منتج يدوي: ${newProduct.productName}`, req, newProduct._id, newProduct.productName);
        res.json({ success: true, message: 'تم إضافة المنتج يدوياً' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

const syncInventoryInternal = async () => {
    try {
        let updatedCount = 0;
        for (const provider of externalProviders) {
            if (!provider.apiUrl || !provider.apiKey) continue;

            const response = await axios.get(provider.apiUrl, { headers: { 'Authorization': `Bearer ${provider.apiKey}` } });
            const externalItems = response.data.items || [];

            for (const item of externalItems) {
                const localProduct = await Product.findOne({ externalId: item.id, isExternal: true });
                if (localProduct) {
                    const oldBasePrice = localProduct.basePrice;
                    const newBasePrice = parseFloat(item.price);
                    localProduct.basePrice = newBasePrice;
                    localProduct.price = parseFloat((newBasePrice * localProduct.profitMargin).toFixed(2));
                    localProduct.updatedAt = new Date();
                    localProduct.currentProvider = provider.name;
                    await localProduct.save();
                    updatedCount++;

                    if (oldBasePrice > 0 && (newBasePrice > oldBasePrice * 1.2)) {
                        const priceAlert = `🚨 *تنبيه: ارتفاع سعر عند المزود!*\n📦 *المنتج:* ${localProduct.productName}\n🏢 *المزود:* ${provider.name}\n📉 *السعر القديم:* \`${oldBasePrice}$\`\n📈 *السعر الجديد:* \`${newBasePrice}$\`\n💰 *سعرك الجديد:* \`${localProduct.price}$\``;
                        await sendTelegramAlert(priceAlert);
                    }
                }
            }
        }

        const balances = await fetchProviderBalances(externalProviders);
        for (const p of balances) {
            if (p.status === 'متصل' && p.balance < 10) {
                const balanceAlert = `💸 *تنبيه: رصيد منخفض لدى المزود!*\n🏢 *المزود:* ${p.name}\n💰 *الرصيد الحالي:* \`${p.balance} ${p.currency}\`\n🚀 *يرجى شحن حسابك.*`;
                await sendTelegramAlert(balanceAlert);
            }
        }
        return { success: true, count: updatedCount };
    } catch (err) {
        console.error('Sync Error:', err.message);
        return { success: false, error: err.message };
    }
};

exports.syncInventoryInternal = syncInventoryInternal;

exports.syncExternalProducts = async (req, res) => {
    const result = await syncInventoryInternal();
    if (result.success) {
        await createLog('مزامنة يدوية', `تم تحديث ${result.count} منتج عبر المزامنة`, req);
        res.json({ success: true, message: `✅ تمت المزامنة بنجاح. تم تحديث ${result.count} منتجاً.` });
    } else {
        res.status(500).json({ success: false, error: 'فشل مزامنة المنتجات الخارجية' });
    }
};

exports.updateProductMargin = async (req, res) => {
    try {
        let { margin } = req.body;
        const { productId } = req.params;
        margin = parseFloat(margin);

        if (isNaN(margin) || margin < 1.0) {
            return res.status(400).json({ success: false, message: 'هامش الربح يجب أن يكون 1.0 أو أكثر.' });
        }

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: 'المنتج غير موجود' });

        const oldMargin = product.profitMargin;
        product.profitMargin = margin;
        
        if (product.isExternal && product.basePrice > 0) {
            product.price = parseFloat((product.basePrice * product.profitMargin).toFixed(2));
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

        const productData = {
            productName,
            category,
            region: region || 'global',
            price: parseFloat(price) || 0,
            description: description || {
                ar: 'لا يوجد وصف متاح حالياً لهذا المنتج.',
                en: 'No description is available for this product at the moment.'
            },
            image: image || '',
            isExternal: isExternal || false,
            profitMargin: parseFloat(profitMargin) || 1.10,
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
                               'subscriptionDuration'];

        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                product[field] = updates[field];
            }
        });

        // Recalculate price if basePrice or margin changed
        if (product.isExternal && product.basePrice > 0) {
            product.price = parseFloat((product.basePrice * product.profitMargin).toFixed(2));
        }

        product.updatedAt = new Date();
        await product.save();

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

        res.status(201).json({
            success: true,
            message: '✅ تم تكرار المنتج بنجاح!',
            product: duplicatedProduct
        });
    } catch (err) {
        console.error('Duplicate product error:', err);
        res.status(500).json({ success: false, error: 'فشل تكرار المنتج.' });
    }
};

/**
 * جلب إحصاءات المخزون
 */
exports.getStockStats = async (req, res) => {
    try {
        const products = await Product.find({});
        let totalProducts = products.length;
        let activeProducts = products.filter(p => p.isActive).length;
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
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل جلب إحصاءات المخزون.' });
    }
};