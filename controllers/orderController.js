const { Product, Order } = require('../models');
const { createLog, sendTelegramAlert, externalProviders } = require('./helpers');
const axios = require('axios');

const PROVIDER_RETRY_COUNT = 3;
const PROVIDER_TIMEOUT_MS = 15000;

function getItemProductId(item) {
    return item.productId || item.id;
}

function extractProviderCodes(data, expectedQuantity) {
    const rawCodes = Array.isArray(data?.codes)
        ? data.codes
        : Array.isArray(data?.items)
            ? data.items.map(item => item.code || item.pin)
            : [data?.code || data?.pin];
    const codes = rawCodes.filter(code => typeof code === 'string' && code.trim());

    if (codes.length !== expectedQuantity) {
        throw new Error('المزود لم يرسل العدد المطلوب من الأكواد');
    }

    return codes;
}

async function buyExternalCodes(product, quantity) {
    const provider = externalProviders.find(candidate => candidate.name === product.currentProvider);
    if (!provider?.purchaseUrl || !provider.apiKey || !product.externalId) {
        throw new Error('إعداد شراء المنتج الخارجي غير مكتمل');
    }

    let lastError;
    for (let attempt = 1; attempt <= PROVIDER_RETRY_COUNT; attempt += 1) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const response = await axios.post(provider.purchaseUrl, {
                api_key: provider.apiKey,
                product_id: product.externalId,
                amount: quantity
            }, { timeout: PROVIDER_TIMEOUT_MS });

            return {
                codes: extractProviderCodes(response.data, quantity),
                costPrice: Number(response.data?.costPrice ?? response.data?.cost ?? product.basePrice * quantity) || 0
            };
        } catch (err) {
            lastError = err;
            const isClientFailure = err.response?.status >= 400 && err.response?.status < 500;
            if (isClientFailure || attempt === PROVIDER_RETRY_COUNT) {
                break;
            }
        }
    }

    throw lastError || new Error('فشل شراء الأكواد من المزود');
}

exports.getOrders = async (_req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (_err) {
        res.status(500).json({ success: false, message: 'فشل جلب الطلبات' });
    }
};

exports.rejectOrder = async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
        }
        if (order.status !== 'pending') {
            return res.status(409).json({ success: false, message: 'الطلب معالج مسبقاً' });
        }

        order.status = 'refunded';
        order.failedAt = new Date();
        await order.save();

        await createLog('رفض طلب', `تم رفض الطلب #${order.orderId}`, req, null, order.productName);
        await sendTelegramAlert(`⛔ تم رفض الطلب #${order.orderId}.`);
        return res.json({ success: true, message: 'تم رفض الطلب بنجاح' });
    } catch (err) {
        console.error('Reject Error:', err.message);
        return res.status(500).json({ success: false, message: 'فشل رفض الطلب' });
    }
};

exports.approveOrder = async (req, res) => {
    let order;

    try {
        order = await Order.findOneAndUpdate(
            { orderId: req.params.orderId, status: 'pending' },
            { $set: { status: 'processing' } },
            { new: true }
        );

        if (!order) {
            const existingOrder = await Order.findOne({ orderId: req.params.orderId }).select('status');
            if (!existingOrder) {
                return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
            }
            return res.status(409).json({ success: false, message: 'الطلب معالج مسبقاً' });
        }

        const allDeliveredCodes = [];
        let totalCost = 0;

        for (const item of order.items) {
            const productId = getItemProductId(item);
            // eslint-disable-next-line no-await-in-loop
            const product = await Product.findById(productId);
            if (!product || !product.isActive) {
                throw new Error('أحد منتجات الطلب لم يعد متاحاً');
            }

            item.fulfilmentStatus = 'processing';
            const deliveredCodes = [];
            let itemCost = 0;

            if (item.fulfilmentType === 'external' || product.isExternal) {
                // eslint-disable-next-line no-await-in-loop
                const purchase = await buyExternalCodes(product, item.qty);
                deliveredCodes.push(...purchase.codes);
                itemCost = purchase.costPrice;
            } else {
                for (let claimed = 0; claimed < item.qty; claimed += 1) {
                    // eslint-disable-next-line no-await-in-loop
                    const code = await Product.claimCodeAtomic(product._id, order.orderId, order.buyerEmail);
                    deliveredCodes.push(code);
                }
                itemCost = (Number(product.basePrice) || 0) * item.qty;
            }

            item.deliveredCodes = deliveredCodes;
            item.costPrice = itemCost;
            item.fulfilmentStatus = 'completed';
            item.fulfilledAt = new Date();
            allDeliveredCodes.push(...deliveredCodes);
            totalCost += itemCost;
        }

        order.status = 'completed';
        order.deliveredCodes = allDeliveredCodes;
        order.code = allDeliveredCodes.length === 1 ? allDeliveredCodes[0] : null;
        order.costPrice = totalCost;
        order.completedAt = new Date();
        await order.save();

        await createLog('تأكيد طلب', `تم إكمال الطلب #${order.orderId}`, req, null, order.productName);

        // Emit WebSocket event for approved order
        const io = req.app?.get('io');
        if (io) {
            io.emit('order_approved', {
                orderId: order.orderId,
                buyerEmail: order.buyerEmail
            });
        }

        return res.json({ success: true, message: 'تم تأكيد الطلب بنجاح' });
    } catch (err) {
        console.error('Approval Error:', err.message);

        if (order) {
            order.status = 'failed';
            order.failedAt = new Date();
            order.items.forEach(item => {
                if (item.fulfilmentStatus === 'processing') {
                    item.fulfilmentStatus = 'failed';
                }
            });
            await order.save();
            await createLog('فشل تنفيذ طلب', `يتطلب الطلب #${order.orderId} تدخلاً يدوياً.`, req);
            await sendTelegramAlert(`🚨 فشل تنفيذ الطلب #${order.orderId}. يرجى مراجعته يدوياً.`);
        }

        return res.status(502).json({
            success: false,
            message: 'تعذر تنفيذ الطلب تلقائياً. تم تحويله للمراجعة اليدوية.'
        });
    }
};

exports.buyExternalCodes = buyExternalCodes;
