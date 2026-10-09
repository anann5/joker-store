/**
 * معالجات Web Push للواجهة — التسجيل/الإلغاء/الحالة.
 * المنطق الأساسي في controllers/push.js (خدمة)، هنا طبقة HTTP فقط.
 */
const pushService = require('./push');

/**
 * GET /api/push/vapid-public-key
 * يكشف للواجهة هل الإشعارات مفعّلة + المفتاح العام للتسجيل.
 */
async function getStatus(_req, res) {
    res.json({ success: true, ...pushService.getPushStatus() });
}

/**
 * POST /api/push/subscribe
 * تسجيل اشتراك متصفح (upsert). يلتقط userId إن كان المستخدم مسجلاً في الطلب.
 */
async function subscribe(req, res) {
    try {
        const subscription = await pushService.subscribe({
            endpoint: req.body.endpoint,
            keys: req.body.keys,
            userId: req.user?.userId || null,
            lang: req.body.lang || 'ar',
            userAgent: (req.headers['user-agent'] || '').trim()
        });
        res.status(201).json({ success: true, registeredAt: subscription.createdAt });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[push] فشل تسجيل الاشتراك:', err.message);
        res.status(500).json({ success: false, error: 'فشل تسجيل الاشتراك، حاول لاحقاً' });
    }
}

/**
 * POST /api/push/unsubscribe
 * إلغاء تسجيل جهاز (ضغط المستخدم على "إيقاف الإشعارات").
 */
async function unsubscribe(req, res) {
    try {
        await pushService.unsubscribe(req.body.endpoint);
        res.json({ success: true });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[push] فشل إلغاء الاشتراك:', err.message);
        res.status(500).json({ success: false, error: 'فشل إلغاء الاشتراك، حاول لاحقاً' });
    }
}

/**
 * GET /api/admin/push/stats — إحصائيات الإشعارات للوحة التحكم.
 */
async function getAdminStats(_req, res) {
    try {
        const stats = await pushService.getStats();
        res.json({ success: true, ...stats });
    } catch (_e) {
        res.status(500).json({ success: false, error: 'فشل جلب إحصائيات الإشعارات' });
    }
}

/**
 * POST /api/admin/push/broadcast — بث رسالة لكل المشتركين (topic offers).
 */
async function broadcast(req, res) {
    try {
        const messages = {
            ar: { title: req.body.titleAr, body: req.body.bodyAr || '' },
            en: { title: req.body.titleEn || req.body.titleAr, body: req.body.bodyEn || req.body.bodyAr || '' }
        };
        const result = await pushService.broadcast(messages, req.body.url || '/', req.body.tag || 'admin-broadcast');
        if (result.skipped) {
            return res.status(400).json({ success: false, error: 'إشعارات Web Push غير مفعّلة (اضبط VAPID keys)' });
        }
        res.json({ success: true, sent: result.sent, deleted: result.deleted, failed: result.failed });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[push] فشل البث:', err.message);
        res.status(500).json({ success: false, error: 'فشل إرسال الإشعارات' });
    }
}

module.exports = { getStatus, subscribe, unsubscribe, getAdminStats, broadcast };