const { Product, Order, User } = require('../models');
const { createLog, sendTelegramAlert, externalProviders } = require('./helpers');
const axios = require('axios');

exports.getOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: 'فشل جلب الطلبات' });
    }
};

exports.approveOrder = async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
        if (order.status !== 'pending') return res.status(400).json({ success: false, message: 'الطلب معالج مسبقاً' });

        const itemData = order.items[0];
        const product = await Product.findById(itemData.id);
        let deliveredCode = '';

        if (product.isExternal) {
            const provider = externalProviders.find(p => p.name === product.currentProvider);
            let attempts = 0;
            const maxAttempts = 3;
            let lastError = null;

            while (attempts < maxAttempts) {
                attempts++;
                try {
                    const response = await axios.post(provider.purchaseUrl, {
                        api_key: provider.apiKey,
                        product_id: product.externalId,
                        amount: 1
                    }, { timeout: 15000 });

                    deliveredCode = response.data.code || response.data.pin;
                    if (deliveredCode) break;
                    else throw new Error("المزود لم يرسل كوداً");

                } catch (err) {
                    lastError = err;
                    if (err.response && err.response.status >= 400 && err.response.status < 500) break;
                    if (attempts < maxAttempts) await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }

            if (!deliveredCode) {
                let errorType = 'فشل الاتصال بالمزود';
                let details = lastError?.message || 'رد غير معروف';

                if (lastError?.response) {
                    const { status, data } = lastError.response;
                    if (status === 402 || (data && (data.low_balance || data.error === 'insufficient_balance'))) {
                        errorType = '❌ رصيد غير كافٍ';
                        details = 'رصيدك لدى المزود لا يغطي تكلفة المنتج.';
                    } else if (status === 401) {
                        errorType = '🔑 خطأ في مفتاح API';
                    } else if (status === 404) {
                        errorType = '📦 المنتج غير متوفر';
                    }
                }

                const failureAlert = `🚨 *فشل شراء كود آلياً!*\n🆔 *الطلب:* \`#${order.orderId}\`\n📦 *المنتج:* ${product.productName}\n🏢 *المزود:* ${provider.name}\n⚠️ *الخطأ:* ${errorType}\n📝 *التفاصيل:* ${details}\n🛠 *الإجراء:* يرجى التدخل اليدوي.`;
                
                order.status = 'failed';
                await order.save();

                let user = await User.findOne({ email: order.buyerEmail.toLowerCase() });
                if (!user) user = new User({ email: order.buyerEmail.toLowerCase(), balance: 0 });
                
                user.balance += order.price;
                await user.save();

                await createLog('إرجاع رصيد آلي', `فشل طلب #${order.orderId} وتم إرجاع ${order.price}$ لحساب ${order.buyerEmail}`, req);
                
                const extendedAlert = failureAlert + `\n💰 *الإجراء الآلي:* تم تحويل \`${order.price}$\` إلى محفظة الزبون.`;
                await sendTelegramAlert(extendedAlert);

                return res.status(502).json({ 
                    success: false, 
                    message: `فشل الشراء من المزود. تم إرجاع المبلغ (${order.price}$) لرصيد الزبون.` 
                });
            }
        } else {
            deliveredCode = await Product.claimCodeAtomic(product._id, order.orderId, order.buyerEmail);
        }

        order.status = 'completed';
        order.costPrice = product.basePrice || 0;
        order.code = deliveredCode;
        order.completedAt = new Date();
        await order.save();
        await createLog('تأكيد طلب', `تم إكمال الطلب #${order.orderId}`, req, product._id, product.productName);

        res.json({ success: true, message: 'تم تأكيد الطلب بنجاح' });

    } catch (err) {
        console.error('Approval Error:', err.message);
        res.status(500).json({ success: false, error: 'فشل تنفيذ الطلب: ' + err.message });
    }
};