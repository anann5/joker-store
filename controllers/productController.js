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