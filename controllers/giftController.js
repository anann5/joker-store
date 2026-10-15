/**
 * Gift reveal API — public, token-gated (unguessable UUID).
 * Never exposes buyer email, price, or payment details to the recipient.
 */
const { Order } = require('../models');

const TOKEN_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * GET /api/gift/:token
 */
async function getGift(req, res) {
    try {
        const token = String(req.params.token || '').trim();
        if (!TOKEN_RE.test(token)) {
            return res.status(404).json({ success: false, error: 'الهدية غير موجودة' });
        }
        const order = await Order.findOne({ giftToken: token })
            .select('orderId status productName items.name items.qty giftToName giftMessage deliveredCodes code completedAt')
            .lean();
        if (!order || !order.giftToken) {
            return res.status(404).json({ success: false, error: 'الهدية غير موجودة' });
        }
        const completed = order.status === 'completed';
        const codes = completed
            ? (Array.isArray(order.deliveredCodes) && order.deliveredCodes.length
                ? order.deliveredCodes
                : (order.code ? [order.code] : []))
            : [];
        if (completed && !order.giftOpenedAt) {
            await Order.updateOne({ _id: order._id }, { $set: { giftOpenedAt: new Date() } }).catch(() => {});
        }
        return res.json({
            success: true,
            gift: {
                productName: order.productName || '',
                items: (order.items || []).map((item) => ({
                    name: item.name,
                    qty: item.qty
                })),
                toName: order.giftToName || null,
                message: order.giftMessage || null,
                status: order.status,
                completed,
                codes,
                completedAt: order.completedAt || null
            }
        });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'تعذر تحميل الهدية' });
    }
}

module.exports = { getGift };
