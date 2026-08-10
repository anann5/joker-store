const { Order, Log } = require('../models');
const { createLog } = require('./helpers');

exports.sendPendingEmails = async (req, res) => {
    try {
        const pendingOrders = await Order.find({
            status: 'completed',
            'items.fulfilmentStatus': 'completed',
            buyerEmail: { $exists: true, $ne: '' }
        }).sort({ completedAt: -1 }).limit(20);

        const sent = [];
        for (const order of pendingOrders) {
            if (!order.deliveredCodes || order.deliveredCodes.length === 0) continue;
            sent.push({
                orderId: order.orderId,
                email: order.buyerEmail,
                codes: order.deliveredCodes
            });
        }

        res.json({ success: true, pending: sent });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
