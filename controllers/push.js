/**
 * وحدة إشعارات Web Push — إرسال إشعارات متصفح للعملاء عبر VAPID.
 * تعتمد على web-push وتخزين الاشتراكات في PushSubscription.
 * العتبات: تُتجاهل الاشتراكات الفاشلة 10 مرات متتالية، وتُحذف عند 404/410.
 */
const webPush = require('web-push');
const { PushSubscription } = require('../models');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || `mailto:admin@${(process.env.SITE_URL || 'localhost').replace(/^https?:\/\//, '')}`;
const ENABLED_FLAG = process.env.PUSH_NOTIFICATIONS_ENABLED !== 'false';

const MAX_FAILED = 10;
const TTL_SECONDS = 60 * 60 * 24; // يوم واحد للمتجر على كل جهاز

/**
 * هل إشعارات Web Push مفعّلة (المفاتيح مضبوطة + غير معطّلة صراحة).
 */
function isPushEnabled() {
    return Boolean(PUBLIC_KEY && PRIVATE_KEY && ENABLED_FLAG);
}

/**
 * حالة الإنهاء المكشوفة للواجهة ولوحة التحكم.
 */
function getPushStatus() {
    return {
        enabled: isPushEnabled(),
        vapidConfigured: Boolean(PUBLIC_KEY && PRIVATE_KEY),
        publicKey: isPushEnabled() ? PUBLIC_KEY : null,
        subject: SUBJECT
    };
}

/**
 * تسجيل/تحديث اشتراك متصفح.
 * upsert آمن على endpoint دون مسح الحقول الاختيارية (userId/topics).
 */
async function subscribe({ endpoint, keys, userId = null, lang = 'ar', userAgent = '' }) {
    const patch = { endpoint, keys };
    if (userId) patch.userId = userId;
    if (lang === 'en' || lang === 'ar') patch.lang = lang;
    if (userAgent) patch.userAgent = String(userAgent).slice(0, 300);

    return PushSubscription.findOneAndUpdate(
        { endpoint },
        { $set: patch, $setOnInsert: { failedCount: 0 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

/**
 * إلغاء اشتراك جهاز.
 */
async function unsubscribe(endpoint) {
    return PushSubscription.deleteOne({ endpoint });
}

/**
 * اختيار نص الرسالة حسب لغة المشترك.
 */
function localize(sub, messages) {
    const lang = sub && sub.lang === 'en' ? 'en' : 'ar';
    return {
        title: (messages[lang] && messages[lang].title) || (messages.ar && messages.ar.title) || '',
        body: (messages[lang] && messages[lang].body) || (messages.ar && messages.ar.body) || ''
    };
}

/**
 * إرسال رسالة لمجموعة اشتراكات معينة.
 * - 404/410 → حذف الاشتراك (الجهاز سحب الإذن)
 * - 429/5xx → رفع failedCount (نحاول لاحقاً)
 * - نجاح → تصفير failedCount
 * تُتجاهل الاشتراكات التي فشلت MAX_FAILED مرة سابقة.
 */
async function sendToSubscriptions({ subscriptions, messages, url = '/', tag = 'general', icon }) {
    if (!isPushEnabled() || !Array.isArray(subscriptions) || subscriptions.length === 0) {
        return { sent: 0, deleted: 0, failed: 0 };
    }

    webPush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    const baseIcon = icon || `${process.env.SITE_URL || ''}/image/logo.png`;

    let sent = 0;
    let failed = 0;
    let deleted = 0;

    for (const sub of subscriptions) {
        if ((sub.failedCount || 0) >= MAX_FAILED) {
            failed += 1;
            continue;
        }
        const { title, body } = localize(sub, messages);
        if (!title) continue;

        const payload = JSON.stringify({ title, body, url, tag, icon: baseIcon });

        try {
            await webPush.sendNotification(
                { endpoint: sub.endpoint, keys: sub.keys },
                payload,
                { TTL: TTL_SECONDS }
            );
            sent += 1;
            await PushSubscription.updateOne(
                { _id: sub._id },
                { $set: { failedCount: 0, lastSuccessAt: new Date() } }
            );
        } catch (err) {
            const status = err.statusCode;
            if (status === 404 || status === 410) {
                await PushSubscription.deleteOne({ _id: sub._id });
                deleted += 1;
            } else {
                failed += 1;
                await PushSubscription.updateOne(
                    { _id: sub._id },
                    {
                        $set: { lastErrorAt: new Date() },
                        $inc: { failedCount: 1 }
                    }
                );
            }
        }
    }

    return { sent, deleted, failed };
}

/**
 * بث رسالة تسويقية لكل المشتركين (topic: offers).
 * messages: { ar: { title, body }, en: { title, body } }
 */
async function broadcast(messages, url = '/', tag = 'offers') {
    if (!isPushEnabled() || !messages) return { sent: 0, deleted: 0, failed: 0, skipped: true };

    const subscriptions = await PushSubscription.find({ topics: 'offers' })
        .select('_id endpoint keys userId lang failedCount')
        .lean();
    const result = await sendToSubscriptions({ subscriptions, messages, url, tag });
    return { ...result, skipped: false, total: subscriptions.length };
}

/**
 * إشعار خاص بحالة طلب — يُرسَل فقط لاشتراكات الحساب صاحب الطلب.
 */
async function notifyOrderStatus(order) {
    if (!isPushEnabled() || !order) return { skipped: true };
    const userId = order.userId;
    if (!userId) return { skipped: true };

    let messages = null;
    let url = '/';
    let tag = 'order';

    if (order.status === 'completed' || order.fulfilmentStatus === 'delivered') {
        messages = {
            ar: { title: '🎉 طلبك اكتمل', body: `طلب #${order.orderId} تم تسليمه — استلم كودك الآن.` },
            en: { title: '🎉 Order completed', body: `Order #${order.orderId} delivered — grab your code now.` }
        };
        url = '/';
        tag = `order-${order.orderId}`;
    } else if (order.status === 'failed') {
        messages = {
            ar: { title: '⚠️ الطلب لم يكتمل', body: `طلب #${order.orderId} لم يكتمل — تواصل معنا وسنساعدك فوراً.` },
            en: { title: '⚠️ Order failed', body: `Order #${order.orderId} could not be completed — contact us.` }
        };
        url = '/faq';
        tag = `order-${order.orderId}`;
    } else if (order.status === 'refunded') {
        messages = {
            ar: { title: '↩️ طلبك لم يكتمل', body: `طلب #${order.orderId} رُفض وسيُسترد مبلغك — نعتذر عن الإزعاج.` },
            en: { title: '↩️ Order not completed', body: `Order #${order.orderId} was rejected and refunded — sorry for the trouble.` }
        };
        url = '/faq';
        tag = `order-${order.orderId}`;
    } else {
        return { skipped: true };
    }

    const subscriptions = await PushSubscription.find({ userId })
        .select('_id endpoint keys userId lang failedCount')
        .lean();
    const result = await sendToSubscriptions({ subscriptions, messages, url, tag });
    return { ...result, skipped: subscriptions.length === 0 };
}

/**
 * إحصائيات للوحة التحكم.
 */
async function getStats() {
    const [offersCount, total] = await Promise.all([
        PushSubscription.countDocuments({ topics: 'offers' }),
        PushSubscription.estimatedDocumentCount()
    ]);
    return { enabled: isPushEnabled(), vapidConfigured: Boolean(PUBLIC_KEY && PRIVATE_KEY), subscribers: offersCount, totalDevices: total };
}

/**
 * تنظيف اشتراكات ميتة (فشلت كثيراً ولم ينجح أي إرسال منذ فترة).
 */
async function purgeStaleSubscriptions(olderThanMs = 30 * 24 * 60 * 60 * 1000) {
    if (!isPushEnabled()) return 0;
    const cutoff = new Date(Date.now() - olderThanMs);
    const res = await PushSubscription.deleteMany({
        failedCount: { $gte: MAX_FAILED },
        $or: [{ lastSuccessAt: null }, { lastSuccessAt: { $lt: cutoff } }]
    });
    if (res.deletedCount) {
        // eslint-disable-next-line no-console
        console.log(`[push] تم تنظيف ${res.deletedCount} اشتراك قديم فاشل.`);
    }
    return res.deletedCount || 0;
}

/**
 * إشعار بمنتج جديد (إنشاء يدوي وحيد من لوحة التحكم).
 */
function notifyNewProduct(nameAr, nameEn, productId) {
    return broadcast(
        {
            ar: { title: '🆕 منتج جديد انضم إلينا', body: nameAr ? `${nameAr} — صار متوفراً الآن!` : 'منتج جديد صار متوفراً!' },
            en: { title: '🆕 New product just landed', body: nameEn ? `${nameEn} is now available!` : 'A new product is now available!' }
        },
        '/',
        `new-product-${productId}`
    );
}

/**
 * إشعار بعرض/خصم جديد.
 */
function notifyNewPromotion({ titleAr, titleEn, discountPercent, code, promotionId }) {
    const arBody = code ? `خصم ${discountPercent}% مع كود ${code} — لفترة محدودة!` : `خصم ${discountPercent}% لفترة محدودة!`;
    return broadcast(
        {
            ar: { title: titleAr || '🎉 عرض جديد', body: arBody },
            en: { title: titleEn || '🎉 New offer', body: code ? `${discountPercent}% off with code ${code} — limited time!` : `${discountPercent}% off for a limited time!` }
        },
        '/offers',
        `promo-${promotionId}`
    );
}

module.exports = {
    isPushEnabled,
    getPushStatus,
    subscribe,
    unsubscribe,
    broadcast,
    notifyOrderStatus,
    notifyNewProduct,
    notifyNewPromotion,
    getStats,
    purgeStaleSubscriptions
};