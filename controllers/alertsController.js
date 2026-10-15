/**
 * Stock-alert + cart-recovery notifications.
 * - Guests subscribe with their Web Push endpoint; logged-in users may rely on userId.
 * - Alerts fire automatically when a product goes 0 -> in-stock (manual codes / provider sync).
 */
const { StockAlert, PushSubscription, Product } = require('../models');
const pushService = require('./push');

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

function pickName(product) {
    const name = (product && product.productName) || {};
    return { ar: name.ar || name.en || 'منتج', en: name.en || name.ar || 'Product' };
}

/**
 * POST /api/products/:productId/notify
 * Body: { endpoint?, lang? } — endpoint (Web Push) or logged-in user required.
 */
async function subscribeStockAlert(req, res) {
    try {
        const { productId } = req.params;
        if (!productId || !OBJECT_ID_RE.test(productId)) {
            return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });
        }
        const endpoint = typeof req.body.endpoint === 'string' ? req.body.endpoint.trim() : '';
        const userId = req.user?.userId || null;
        if (!endpoint && !userId) {
            return res.status(400).json({ success: false, error: 'فعّل الإشعارات أولاً ليصلك التنبيه' });
        }
        const product = await Product.findById(productId).select('_id isActive');
        if (!product) {
            return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
        }
        const lang = req.body.lang === 'en' ? 'en' : 'ar';
        const filter = endpoint ? { productId, endpoint } : { productId, userId };
        await StockAlert.findOneAndUpdate(
            filter,
            { $set: { userId, lang, status: 'pending', notifiedAt: null } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        return res.status(201).json({ success: true, subscribed: true });
    } catch (err) {
        // Duplicate race (unique productId+endpoint) → treat as already subscribed.
        if (err && err.code === 11000) {
            return res.status(200).json({ success: true, subscribed: true });
        }
        return res.status(500).json({ success: false, error: 'تعذر الاشتراك، حاول لاحقاً' });
    }
}

/**
 * DELETE /api/products/:productId/notify
 * Body: { endpoint } — cancels a pending alert for this browser.
 */
async function unsubscribeStockAlert(req, res) {
    try {
        const { productId } = req.params;
        if (!productId || !OBJECT_ID_RE.test(productId)) {
            return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });
        }
        const endpoint = typeof req.body.endpoint === 'string' ? req.body.endpoint.trim() : '';
        if (!endpoint) {
            return res.status(400).json({ success: false, error: 'نقطة الاشتراك مطلوبة' });
        }
        await StockAlert.updateMany(
            { productId, endpoint, status: 'pending' },
            { $set: { status: 'cancelled' } }
        );
        return res.json({ success: true, subscribed: false });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'تعذر إلغاء الاشتراك' });
    }
}

/**
 * GET /api/products/:productId/notify?endpoint=...
 * Returns whether this browser already has a pending alert.
 */
async function getStockAlertStatus(req, res) {
    try {
        const { productId } = req.params;
        if (!productId || !OBJECT_ID_RE.test(productId)) {
            return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });
        }
        const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint.trim() : '';
        if (!endpoint) return res.json({ success: true, subscribed: false });
        const existing = await StockAlert.findOne({ productId, endpoint, status: 'pending' })
            .select('_id')
            .lean();
        return res.json({ success: true, subscribed: Boolean(existing) });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'تعذر التحقق' });
    }
}

/**
 * Fire pending alerts for a restocked product. Never throws (callers use .catch()).
 * Only alerts resolvable to a live push subscription are marked notified.
 */
async function fireStockAlerts(product) {
    if (!product || !product._id) return { fired: 0 };
    const alerts = await StockAlert.find({ productId: product._id, status: 'pending' }).lean();
    if (!alerts.length) return { fired: 0 };

    const endpoints = new Set();
    const userIds = new Set();
    for (const alert of alerts) {
        if (alert.endpoint) endpoints.add(alert.endpoint);
        if (alert.userId) userIds.add(String(alert.userId));
    }
    let subs = [];
    if (endpoints.size) {
        subs = subs.concat(await PushSubscription.find({ endpoint: { $in: [...endpoints] } })
            .select('endpoint keys lang failedCount')
            .lean());
    }
    if (userIds.size) {
        subs = subs.concat(await PushSubscription.find({ userId: { $in: [...userIds] } })
            .select('endpoint keys lang failedCount userId')
            .lean());
    }
    const seen = new Set();
    subs = subs.filter((s) => s.endpoint && !seen.has(s.endpoint) && seen.add(s.endpoint));
    if (!subs.length) return { fired: 0, sent: 0 };

    const coveredEndpoints = new Set(subs.map((s) => s.endpoint));
    const coveredUserIds = new Set(subs.filter((s) => s.userId).map((s) => String(s.userId)));
    const name = pickName(product);
    const result = await pushService.sendToSubscriptions({
        subscriptions: subs,
        messages: {
            ar: { title: '📦 عاد للمخزون!', body: `${name.ar} متوفر الآن — اطلبه قبل النفاد.` },
            en: { title: '📦 Back in stock!', body: `${name.en} is available now — order before it runs out.` }
        },
        url: `/product/${product._id}`,
        tag: `stock-${product._id}`
    });

    const coveredIds = alerts
        .filter((a) => (a.endpoint && coveredEndpoints.has(a.endpoint))
            || (a.userId && coveredUserIds.has(String(a.userId))))
        .map((a) => a._id);
    if (coveredIds.length) {
        await StockAlert.updateMany(
            { _id: { $in: coveredIds } },
            { $set: { status: 'notified', notifiedAt: new Date() } }
        );
    }
    return { fired: coveredIds.length, sent: result.sent || 0 };
}

/**
 * GET /api/admin/stock-alerts — pending alerts for the dashboard.
 */
async function listStockAlerts(_req, res) {
    try {
        const alerts = await StockAlert.find({ status: 'pending' })
            .populate('productId', 'productName price')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();
        const pendingCount = await StockAlert.countDocuments({ status: 'pending' });
        return res.json({ success: true, pendingCount, alerts });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'تعذر جلب التنبيهات' });
    }
}

module.exports = {
    subscribeStockAlert,
    unsubscribeStockAlert,
    getStockAlertStatus,
    fireStockAlerts,
    listStockAlerts
};
