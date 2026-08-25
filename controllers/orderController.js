const { Product, Order } = require('../models');
const { createLog, sendTelegramAlert } = require('./helpers');
const { sendOrderConfirmationEmail, sendOrderRejectedEmail } = require('./notification');
const registry = require('../providers/registry');
const adapter = require('../providers/adapter');

// حماية هامش الربح: نسبة (سعر البيع / التكلفة) الدنيا المسموح بها عند التنفيذ.
// الافتراضي 1.0 = منع البيع بسعر أقل من التكلفة؛ يمكن رفعه عبر MIN_PROFIT_RATIO.
const MIN_PROFIT_RATIO = Number.parseFloat(process.env.MIN_PROFIT_RATIO) || 1.0;

function getItemProductId(item) {
    return item.productId || item.id;
}

/**
 * قائمة مزودين للتسليم مرتبة من الأرخص للأغلى (أسعار شاملة التحويل لعملة المتجر).
 * شراء الأكواد يُجرب من الأرخص أولاً، فإن فشل ينتقل تلقائياً للمزود التالي.
 */
function buildFulfilmentQueue(product) {
    const primary = {
        provider: product.currentProvider,
        externalId: product.externalId,
        basePrice: Number(product.basePrice) || 0
    };
    const options = Array.isArray(product.providerOptions) && product.providerOptions.length > 0
        ? product.providerOptions
        : [primary];

    const seen = new Set();
    const queue = [];
    for (const option of options) {
        if (!option?.provider || !option?.externalId) continue;
        if (seen.has(option.provider)) continue;
        seen.add(option.provider);
        queue.push({
            provider: option.provider,
            externalId: option.externalId,
            basePrice: Number(option.basePrice) || 0
        });
    }

    return queue.length > 0
        ? queue
        : [primary];
}

/**
 * شراء أكواد خارجية من المزود عبر طبقة providers/adapter،
 * مع تراجع تلقائي للمزود التالي عند فشل الأول.
 */
async function buyExternalCodes(product, quantity) {
    const queue = buildFulfilmentQueue(product);
    let lastError = null;

    for (const candidate of queue) {
        const provider = registry.getProvider(candidate.provider);
        if (!provider?.purchaseUrl || !provider.apiKey || !candidate.externalId) {
            lastError = new Error(`إعداد شراء المنتج من ${candidate.provider} غير مكتمل`);
            continue;
        }

        try {
            // eslint-disable-next-line no-await-in-loop
            return await adapter.purchaseItem(provider, {
                externalId: candidate.externalId,
                quantity,
                basePrice: candidate.basePrice
            });
        } catch (err) {
            const isClientFailure = err.response?.status >= 400 && err.response?.status < 500;
            if (isClientFailure) throw err;
            lastError = err;
        }
    }

    throw lastError || new Error('فشل شراء الأكواد من المزود');
}

exports.getOrders = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const skip = (page - 1) * limit;

        const query = {};
        if (req.query.status && req.query.status !== 'all') {
            query.status = req.query.status;
        }
        if (req.query.search) {
            const search = req.query.search.trim();
            query.$or = [
                { buyerEmail: { $regex: search, $options: 'i' } },
                { orderId: { $regex: search, $options: 'i' } }
            ];
        }
        if (req.query.from || req.query.to) {
            query.createdAt = {};
            if (req.query.from) query.createdAt.$gte = new Date(req.query.from);
            if (req.query.to) query.createdAt.$lte = new Date(req.query.to + 'T23:59:59.999Z');
        }

        const [orders, total] = await Promise.all([
            Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Order.countDocuments(query)
        ]);
        res.json({ success: true, orders, total, page, limit });
    } catch (_err) {
        res.status(500).json({ success: false, message: 'فشل جلب الطلبات' });
    }
};

exports.exportOrdersCSV = async (req, res) => {
    try {
        const query = {};
        if (req.query.status && req.query.status !== 'all') {
            query.status = req.query.status;
        }
        if (req.query.search) {
            const search = req.query.search.trim();
            query.$or = [
                { buyerEmail: { $regex: search, $options: 'i' } },
                { orderId: { $regex: search, $options: 'i' } }
            ];
        }
        if (req.query.from || req.query.to) {
            query.createdAt = {};
            if (req.query.from) query.createdAt.$gte = new Date(req.query.from);
            if (req.query.to) query.createdAt.$lte = new Date(req.query.to + 'T23:59:59.999Z');
        }

        const orders = await Order.find(query).sort({ createdAt: -1 }).limit(5000);

        const escapeCSV = (val) => {
            const str = String(val ?? '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };

        const header = 'Order ID,Email,Status,Price,Currency,Payment Gateway,Items,Created At';
        const rows = orders.map(o => [
            escapeCSV(o.orderId),
            escapeCSV(o.buyerEmail),
            escapeCSV(o.status),
            escapeCSV(o.price),
            escapeCSV(o.priceCurrency || 'ILS'),
            escapeCSV(o.paymentGateway || ''),
            escapeCSV((o.items || []).map(i => `${i.name?.ar || i.name?.en || ''} x${i.qty}`).join('; ')),
            escapeCSV(o.createdAt?.toISOString())
        ].join(','));

        const csv = '\uFEFF' + header + '\n' + rows.join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
        res.send(csv);
    } catch (_err) {
        res.status(500).json({ success: false, message: 'فشل تصدير الطلبات' });
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
        await sendOrderRejectedEmail(order);

        // إشعار لحظي للعميل المسجل عند رفض الطلب واسترداد المبلغ
        const io = req.app?.get('io');
        if (io && order.userId) {
            io.to(`user:${String(order.userId)}`).emit('order_status', {
                orderId: order.orderId,
                status: 'refunded'
            });
        }

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
                // حماية هامش الربح: تمر على أحدث سعر للمزود بعد آخر مزامنة،
                // فلو هبط الهامش دون الحد المسموح يُوقف التنفيذ آلياً ويُرسل تنبيه.
                const baseCost = Number(product.basePrice);
                if (baseCost > 0 && Number(product.price) / baseCost < MIN_PROFIT_RATIO) {
                    const name = product.productName.ar || product.productName.en;
                    // eslint-disable-next-line no-await-in-loop
                    await sendTelegramAlert(
                        `🚨 *هامش ربح منخفض — تنفيذ موقوف*\n`
                        + `📦 *المنتج:* ${name}\n`
                        + `💰 *سعر البيع:* \`${Number(product.price) || 0}\`\n`
                        + `🏷️ *التكلفة:* \`${baseCost}\`\n`
                        + `🛡️ *الحد الأدنى للنسبة:* ${MIN_PROFIT_RATIO}\n`
                        + `👀 يرجى مراجعة الطلب #${order.orderId} يدوياً.`
                    );
                    throw new Error(`هامش الربح للمنتج "${name}" دون الحد المسموح؛ التنفيذ يتطلب تدخلاً يدوياً.`);
                }
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
                // التكلفة الفعلية: basePrice إن وُجد، وإلا تقديرها من هامش الربح
                // (سعر البيع = basePrice × profitMargin، لذا basePrice ≈ price / profitMargin)
                const unitPrice = Number(item.unitPrice) || Number(product.price) || 0;
                const basePrice = Number(product.basePrice);
                const margin = Number(product.profitMargin) > 1 ? Number(product.profitMargin) : 1.10;
                const unitCost = basePrice > 0 ? basePrice : (unitPrice > 0 ? unitPrice / margin : 0);
                itemCost = unitCost * item.qty;
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
        await sendOrderConfirmationEmail(order);

        // Emit WebSocket event to authenticated admin sockets only
        const io = req.app?.get('io');
        if (io) {
            io.to('admins').emit('order_approved', {
                orderId: order.orderId,
                buyerEmail: order.buyerEmail
            });

            // إشعار لحظي للعميل المسجل عند اكتمال الطلب (لا تُرسل الأكواد عبر WS)
            if (order.userId) {
                io.to(`user:${String(order.userId)}`).emit('order_status', {
                    orderId: order.orderId,
                    status: 'completed'
                });
            }
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
