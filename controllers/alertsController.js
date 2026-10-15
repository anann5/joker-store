/**
 * Stock-alert + cart-recovery notifications.
 * - Guests subscribe with their Web Push endpoint; logged-in users may rely on userId.
 * - Alerts fire automatically when a product goes 0 -> in-stock (manual codes / provider sync).
 */
const { StockAlert, PushSubscription, Product } = require('../models');
const pushService = require('./push');
const fcmService = require('./fcm');

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

function pickName(product) {
    const name = (product && product.productName) || {};
    return { ar: name.ar || name.en || 'منتج', en: name.en || name.ar || 'Product' };
}

/**
 * POST /api/products/:productId/notify
 * Body: { endpoint?, fcmToken?, lang? } — endpoint (Web Push) أو fcmToken (التطبيق) أو مستخدم مسجل.
 */
async function subscribeStockAlert(req, res) {
    try {
        const { productId } = req.params;
        if (!productId || !OBJECT_ID_RE.test(productId)) {
            return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });
        }
        const endpoint = typeof req.body.endpoint === 'string' ? req.body.endpoint.trim() : '';
        const fcmToken = typeof req.body.fcmToken === 'string' ? req.body.fcmToken.trim().slice(0, 500) : '';
        const userId = req.user?.userId || null;
        if (!endpoint && !fcmToken && !userId) {
            return res.status(400).json({ success: false, error: 'فعّل الإشعارات أولاً ليصلك التنبيه' });
        }
        const product = await Product.findById(productId).select('_id isActive');
        if (!product) {
            return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
        }
        const lang = req.body.lang === 'en' ? 'en' : 'ar';
        const filter = endpoint
            ? { productId, endpoint }
            : (fcmToken ? { productId, fcmToken } : { productId, userId });
        await StockAlert.findOneAndUpdate(
            filter,
            { $set: { userId, lang, status: 'pending', notifiedAt: null } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        return res.status(201).json({ success: true, subscribed: true });
    } catch (err) {
        // Duplicate race (unique productId+endpoint/fcmToken) → treat as already subscribed.
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
 * GET /api/products/:productId/notify?endpoint=...&fcmToken=...
 * Returns whether this browser/device already has a pending alert.
 */
async function getStockAlertStatus(req, res) {
    try {
        const { productId } = req.params;
        if (!productId || !OBJECT_ID_RE.test(productId)) {
            return res.status(400).json({ success: false, error: 'معرف المنتج غير صالح' });
        }
        const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint.trim() : '';
        const fcmToken = typeof req.query.fcmToken === 'string' ? req.query.fcmToken.trim() : '';
        if (!endpoint && !fcmToken) return res.json({ success: true, subscribed: false });
        const or = [];
        if (endpoint) or.push({ productId, endpoint, status: 'pending' });
        if (fcmToken) or.push({ productId, fcmToken, status: 'pending' });
        const existing = await StockAlert.findOne({ $or: or })
            .select('_id')
            .lean();
        return res.json({ success: true, subscribed: Boolean(existing) });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'تعذر التحقق' });
    }
}

/**
 * Fire pending alerts for a restocked product. Never throws (callers use .catch()).
 * Only alerts resolvable to a live push subscription / FCM token are marked notified.
 */
async function fireStockAlerts(product) {
    if (!product || !product._id) return { fired: 0 };
    const alerts = await StockAlert.find({ productId: product._id, status: 'pending' }).lean();
    if (!alerts.length) return { fired: 0 };

    const endpoints = new Set();
    const fcmTokens = new Set();
    const userIds = new Set();
    for (const alert of alerts) {
        if (alert.endpoint) endpoints.add(alert.endpoint);
        if (alert.fcmToken) fcmTokens.add(alert.fcmToken);
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

    const coveredEndpoints = new Set(subs.map((s) => s.endpoint));
    const coveredUserIds = new Set(subs.filter((s) => s.userId).map((s) => String(s.userId)));
    const name = pickName(product);
    const messages = {
        ar: { title: '📦 عاد للمخزون!', body: `${name.ar} متوفر الآن — اطلبه قبل النفاد.` },
        en: { title: '📦 Back in stock!', body: `${name.en} is available now — order before it runs out.` }
    };
    const url = `/product/${product._id}`;
    const tag = `stock-${product._id}`;

    let sent = 0;
    if (subs.length) {
        const result = await pushService.sendToSubscriptions({ subscriptions: subs, messages, url, tag });
        sent += result.sent || 0;
    }

    // Native app installs (FCM) — direct tokens + user-linked tokens
    let coveredFcm = new Set();
    if (fcmTokens.size || userIds.size) {
        try {
            const fcmResult = await fcmService.sendToTokensAndUsers({
                tokens: [...fcmTokens],
                userIds: [...userIds],
                messages,
                url,
                tag
            });
            sent += fcmResult.sent || 0;
            coveredFcm = fcmResult.covered || new Set();
        } catch (_e) {}
    }

    const coveredIds = alerts
        .filter((a) => (a.endpoint && coveredEndpoints.has(a.endpoint))
            || (a.userId && coveredUserIds.has(String(a.userId)))
            || (a.fcmToken && coveredFcm.has(a.fcmToken)))
        .map((a) => a._id);
    if (coveredIds.length) {
        await StockAlert.updateMany(
            { _id: { $in: coveredIds } },
            { $set: { status: 'notified', notifiedAt: new Date() } }
        );
    }
    return { fired: coveredIds.length, sent };
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
