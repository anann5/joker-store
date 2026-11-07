// ======================================================
// متحكم الدفع الإلكتروني (وحدة مستقلة عن البوابة)
// ------------------------------------------------------
// المسار: إنشاء طلب (storeController) → إنشاء جلسة دفع → redirect
// → webhook موقّع → تحقق المبلغ → markOrderPaidAndFulfil تلقائياً.
//
// الدفع اليدوي الحالي لا يتأثر: كل هذه المسارات تبقى معطّلة
// حتى تُضبط PAYMENT_GATEWAY ومفاتيحها.
// ======================================================

const crypto = require('crypto');
const { Order, PaymentEvent } = require('../models');
const payments = require('../providers/payments');
const orderController = require('./orderController');
const { createLog, sendTelegramAlert } = require('./helpers');
const logger = require('../config/logger');
const { STORE_CURRENCY } = require('../providers/currency');
const { round2 } = require('./promo');

const ORDER_ID_RE = /^[a-f0-9]{6,12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AMOUNT_TOLERANCE = 0.01;

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * إعدادات عامة للواجهة: هل الدفع الإلكتروني مفعّل؟ وما اسم البوابة ووضعها؟
 * لا تُرجع أي مفاتيح أو أسرار.
 */
exports.getConfig = (_req, res) => {
    res.json({ success: true, config: payments.getPublicConfig() });
};

/**
 * إنشاء جلسة دفع لطلب قائم.
 * الطلب يُنشأ أولاً (فيحجز المخزون)، ثم يُحوَّل العميل إلى البوابة.
 * التحقق بالبريد يمنع إنشاء جلسة لطلب شخص آخر بمعرفة رقم الطلب فقط.
 */
exports.createSession = async (req, res) => {
    try {
        const orderId = String(req.body?.orderId || '').trim().toUpperCase();
        const email = normalizeEmail(req.body?.email || req.body?.customerEmail);

        if (!ORDER_ID_RE.test(orderId) || !EMAIL_RE.test(email)) {
            return res.status(400).json({ success: false, message: 'بيانات الطلب غير صالحة' });
        }

        const gateway = payments.getConfiguredGateway();
        if (!gateway) {
            return res.status(503).json({ success: false, message: 'الدفع الإلكتروني غير متاح حالياً' });
        }

        const order = await Order.findOne({ orderId, buyerEmail: email });
        if (!order) {
            return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
        }
        if (order.status !== 'pending') {
            return res.status(409).json({ success: false, message: 'الطلب لم يعد قابلاً للدفع' });
        }
        if (order.paymentStatus === 'paid') {
            return res.status(409).json({ success: false, message: 'تم دفع هذا الطلب مسبقاً' });
        }

        // إعادة استخدام جلسة سارية بدل إنشاء جلسة جديدة في كل ضغطة زر
        const now = Date.now();
        const sessionExpiry = order.paymentSessionExpiresAt ? new Date(order.paymentSessionExpiresAt).getTime() : 0;
        if (
            order.paymentGateway === gateway.name
            && order.gatewayRef
            && order.paymentRedirectUrl
            && sessionExpiry > now
        ) {
            return res.json({
                success: true,
                redirectUrl: order.paymentRedirectUrl,
                expiresAt: order.paymentSessionExpiresAt,
                reused: true
            });
        }

        const session = await gateway.createSession({ order, returnUrl: '/api/payments/return' });

        order.paymentMode = 'online';
        order.paymentGateway = gateway.name;
        order.gatewayRef = session.gatewayRef;
        order.paymentRedirectUrl = session.redirectUrl;
        order.paymentSessionExpiresAt = session.expiresAt;
        order.chargedAmount = round2(Number(order.price) || 0);
        order.chargedCurrency = STORE_CURRENCY;
        await order.save();

        return res.json({
            success: true,
            redirectUrl: session.redirectUrl,
            expiresAt: session.expiresAt
        });
    } catch (err) {
        logger.reportError(err, { route: '/api/payments/session' });
        return res.status(500).json({ success: false, message: 'تعذر بدء عملية الدفع' });
    }
};

/**
 * معالجة حدث موقّع — مشتركة بين الـwebhook الحقيقي وصفحة المحاكاة.
 * تُرجع { statusCode, body } ليتحكم المتصل في شكل الاستجابة.
 */
async function processEvent(gateway, rawBody, headers, { req = null } = {}) {
    const verification = gateway.verifyWebhook({ rawBody, headers });
    if (!verification.ok) {
        logger.warn('payment_webhook_rejected', { gateway: gateway.name, reason: verification.error });
        return { statusCode: 401, body: { success: false, error: 'توقيع غير صالح' } };
    }

    const { event } = verification;
    const rawHash = crypto.createHash('sha256').update(rawBody).digest('hex');

    // منع المعالجة المزدوجة: الفهرس الفريد على (gateway, eventId) هو الحاجز النهائي.
    try {
        await PaymentEvent.create({
            gateway: gateway.name,
            eventId: event.eventId,
            orderId: event.orderId,
            status: event.status,
            amount: Number.isFinite(event.amount) ? event.amount : null,
            currency: event.currency,
            rawHash,
            processedAt: new Date()
        });
    } catch (err) {
        if (err && err.code === 11000) {
            return { statusCode: 200, body: { success: true, duplicate: true } };
        }
        throw err;
    }

    const order = await Order.findOne({ gatewayRef: event.gatewayRef });
    if (!order) {
        logger.warn('payment_webhook_unknown_order', {
            gateway: gateway.name,
            eventId: event.eventId,
            orderId: event.orderId
        });
        // نؤكد الاستلام حتى لا تعيد البوابة المحاولة بلا نهاية لمرجع لا نعرفه
        return { statusCode: 200, body: { success: true, ignored: 'unknown_order' } };
    }

    if (event.status === 'paid') {
        const expected = round2(Number(order.price) || 0);
        const paid = Number(event.amount);
        const currencyOk = !event.currency || String(event.currency).toUpperCase() === STORE_CURRENCY;

        if (!Number.isFinite(paid) || Math.abs(round2(paid) - expected) > AMOUNT_TOLERANCE || !currencyOk) {
            logger.error('payment_amount_mismatch', {
                gateway: gateway.name,
                eventId: event.eventId,
                orderId: order.orderId,
                expected,
                paid,
                currency: event.currency
            });
            await sendTelegramAlert(
                `🚨 *دفعة بمبلغ غير مطابق*\n`
                + `🧾 *الطلب:* #${order.orderId}\n`
                + `💰 *المطلوب:* ${expected} ${STORE_CURRENCY}\n`
                + `💳 *المدفوع:* ${paid} ${event.currency || '?'}\n`
                + `ℹ️ لم يُعتمد الطلب تلقائياً — راجعه يدوياً.`
            ).catch(() => {});
            await createLog(
                'تحذير دفع',
                `دفعة بمبلغ غير مطابق للطلب #${order.orderId} (${paid} مقابل ${expected})`,
                req,
                order._id,
                order.productName
            ).catch(() => {});
            // نحرّر الحجز فوراً بدل إبقاء مخزون معلّق على دفعة غير صالحة؛
            // الاسترجاع الفعلي (إن ثبت الدفع) يبقى تدخلاً إدارياً.
            await orderController.cancelPendingOrder(order.orderId, {
                paymentStatus: 'failed',
                reason: 'amount_mismatch',
                io: req?.app?.get('io') || null
            }).catch(err => logger.error('payment_cancel_failed', { orderId: order.orderId, err: err.message }));
            return { statusCode: 200, body: { success: true, ignored: 'amount_mismatch' } };
        }

        if (order.paymentStatus === 'paid') {
            return { statusCode: 200, body: { success: true, duplicate: true } };
        }

        const result = await orderController.markOrderPaidAndFulfil(order.orderId, {
            io: req?.app?.get('io') || null,
            req
        });

        if (!result.ok) {
            // markOrderPaidAndFulfil يتولى: تعليم الطلب فاشلاً + الاسترجاع التلقائي + التنبيه
            logger.error('payment_fulfilment_failed', {
                orderId: order.orderId,
                reason: result.reason,
                refunded: Boolean(result.refunded)
            });
            return { statusCode: 200, body: { success: true, fulfilled: false } };
        }

        await createLog('دفع إلكتروني', `تم استلام دفعة الطلب #${order.orderId} عبر ${gateway.name}`, req)
            .catch(() => {});
        return { statusCode: 200, body: { success: true, fulfilled: true } };
    }

    // failed / expired / refunded
    if (order.status === 'pending' && ['failed', 'expired'].includes(event.status)) {
        await orderController.cancelPendingOrder(order.orderId, {
            paymentStatus: event.status === 'expired' ? 'expired' : 'failed',
            reason: `gateway_${event.status}`,
            io: req?.app?.get('io') || null
        }).catch(err => logger.error('payment_cancel_failed', { orderId: order.orderId, err: err.message }));
    }

    if (event.status === 'refunded' && order.paymentStatus !== 'refunded') {
        await Order.updateOne(
            { _id: order._id, paymentStatus: { $ne: 'refunded' } },
            {
                $set: {
                    paymentStatus: 'refunded',
                    refundedAt: new Date(),
                    refundRef: event.eventId
                }
            }
        ).catch(err => logger.error('payment_refund_event_failed', { orderId: order.orderId, err: err.message }));
    }

    return { statusCode: 200, body: { success: true, status: event.status } };
}

exports.webhook = async (req, res) => {
    const gateway = payments.getConfiguredGateway();
    if (!gateway) {
        return res.status(404).json({ success: false, message: 'بوابة الدفع غير مهيّأة' });
    }

    try {
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
        const result = await processEvent(gateway, rawBody, req.headers, { req });
        return res.status(result.statusCode).json(result.body);
    } catch (err) {
        logger.reportError(err, { route: '/api/payments/webhook' });
        // 5xx تجعل البوابة تعيد المحاولة — وهو المطلوب عند خطأ داخلي مؤقت
        return res.status(500).json({ success: false });
    }
};

exports.returnToStore = (_req, res) => {
    // العودة من البوابة ليست إثبات دفع — الحالة الحقيقية تأتي من الـwebhook.
    res.redirect(302, '/track.html?payment=return');
};

exports.getStatus = async (req, res) => {
    try {
        const orderId = String(req.params.orderId || '').trim().toUpperCase();
        const email = normalizeEmail(req.query.email);
        if (!ORDER_ID_RE.test(orderId) || !EMAIL_RE.test(email)) {
            return res.status(400).json({ success: false, message: 'بيانات غير صالحة' });
        }

        const order = await Order.findOne({ orderId, buyerEmail: email })
            .select('orderId status paymentStatus paidAt');
        if (!order) {
            return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
        }

        return res.json({
            success: true,
            status: order.status,
            paymentStatus: order.paymentStatus,
            paidAt: order.paidAt || null
        });
    } catch (err) {
        logger.reportError(err, { route: '/api/payments/status' });
        return res.status(500).json({ success: false });
    }
};

/**
 * صفحة دفع وهمية للمحاكاة المحلية فقط (تُعطَّل في الإنتاج).
 * المبلغ المعروض للقراءة فقط؛ التأكيد يقرأ المبلغ من قاعدة البيانات.
 */
exports.mockCheckoutPage = async (req, res) => {
    const gateway = payments.getConfiguredGateway();
    if (!gateway || gateway.name !== 'mock') {
        return res.status(404).type('text').send('Not found');
    }

    const orderId = String(req.query.order || '').trim().toUpperCase();
    const ref = String(req.query.ref || '').trim();
    if (!ORDER_ID_RE.test(orderId) || !ref) {
        return res.status(400).type('text').send('Bad request');
    }

    const order = await Order.findOne({ orderId, gatewayRef: ref }).select('orderId price productName').lean();
    if (!order) {
        return res.status(404).type('text').send('Order not found');
    }

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>دفع تجريبي — JOKER STORE</title>
<style>
  body{font-family:system-ui,Segoe UI,Tahoma,sans-serif;background:#0f1115;color:#e8eaed;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#171a21;border:1px solid #262b36;border-radius:16px;padding:28px;max-width:420px;width:92%}
  h1{font-size:1.1rem;margin:0 0 6px}
  .muted{color:#9aa0aa;font-size:.85rem;margin:0 0 18px}
  .amount{font-size:1.8rem;font-weight:700;margin:10px 0 20px}
  button{width:100%;padding:12px;border-radius:10px;border:0;font-size:1rem;cursor:pointer;margin-top:10px}
  .pay{background:#12b489;color:#04120d;font-weight:700}
  .cancel{background:transparent;color:#9aa0aa;border:1px solid #2c3140}
  .note{margin-top:16px;font-size:.75rem;color:#7c828d}
</style>
</head>
<body>
  <div class="card">
    <h1>بوابة دفع تجريبية</h1>
    <p class="muted">هذه الصفحة للمحاكاة المحلية فقط — لا تُخصم أموال.</p>
    <p class="muted">الطلب #${escapeHtml(order.orderId)}</p>
    <div class="amount">${escapeHtml(order.price)} ${escapeHtml(STORE_CURRENCY)}</div>
    <form method="POST" action="/api/payments/mock/complete">
      <input type="hidden" name="ref" value="${escapeHtml(ref)}">
      <input type="hidden" name="order" value="${escapeHtml(order.orderId)}">
      <button class="pay" type="submit" name="action" value="pay">إتمام الدفع</button>
      <button class="cancel" type="submit" name="action" value="cancel">إلغاء</button>
    </form>
    <p class="note">لا توجد أي بيانات بطاقة مطلوبة.</p>
  </div>
</body>
</html>`;

    return res.type('html').send(html);
};

/**
 * إتمام الدفع في البوابة الوهمية: يوقّع الحدث بنفس سر الـwebhook
 * ويمرره إلى نفس مسار المعالجة — بلا أي استثناءات في منطق الطلب.
 */
exports.mockComplete = async (req, res) => {
    const gateway = payments.getConfiguredGateway();
    if (!gateway || gateway.name !== 'mock') {
        return res.status(404).type('text').send('Not found');
    }

    const ref = String(req.body?.ref || '').trim();
    const orderId = String(req.body?.order || '').trim().toUpperCase();
    const cancelled = String(req.body?.action || 'pay') === 'cancel';

    const order = await Order.findOne({ orderId, gatewayRef: ref }).select('orderId price').lean();
    if (!order) {
        return res.redirect(302, '/track.html?payment=error');
    }

    const payload = Buffer.from(JSON.stringify({
        id: `evt_${crypto.randomUUID()}`,
        ref,
        orderId: order.orderId,
        status: cancelled ? 'failed' : 'paid',
        amount: order.price,
        currency: STORE_CURRENCY
    }));

    try {
        await processEvent(gateway, payload, { 'x-mock-signature': gateway.signPayload(payload) }, { req });
    } catch (err) {
        logger.reportError(err, { route: '/api/payments/mock/complete' });
        return res.redirect(302, '/track.html?payment=error');
    }

    const outcome = cancelled ? 'failed' : 'paid';
    return res.redirect(302, `/track.html?payment=${outcome}`);
};
