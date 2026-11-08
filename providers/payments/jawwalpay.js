// ======================================================
// بوابة JawwalPay (فلسطين)
// ------------------------------------------------------
// بوابة محفظة وطنية (ILS) تتكامل عبر hosted payment page.
// تتطلب اتفاقية تاجر مع JawwalPay للحصول على:
//   JAWWALPAY_BASE_URL        نطاق API (sandbox/live) — يُضبط من مستندات التاجر
//   JAWWALPAY_MERCHANT_ID
//   JAWWALPAY_SECRET_KEY      مفتاح توقيع طلبات API
//   JAWWALPAY_WEBHOOK_SECRET  سر توقيع أحداث الـwebhook (أو PAYMENT_WEBHOOK_SECRET)
//
// العقد في types.js: createSession / verifyWebhook / getStatus / refund
// التوقيع: HMAC-SHA256 على الجسم الخام، الترويسة x-jawwalpay-signature
// (نقبل أيضاً x-signature احتياطياً حسب مستندات المزوّد).
//
// ملاحظة: مسارات الـAPI أدناه تحاكي نمط typical hosted-gateway
// (create → redirect → webhook → status/refund). عدّل المسارات
// والحقول لتطابق مستندات JawwalPay الرسمية قبل وضع live.
// ======================================================

const crypto = require('crypto');
const { normalizeStatus } = require('./types');

const SIGNATURE_HEADERS = ['x-jawwalpay-signature', 'x-signature', 'x-webhook-signature'];

function getBaseUrl() {
    return String(process.env.JAWWALPAY_BASE_URL || process.env.PAYMENT_BASE_URL || 'https://api.jawwalpay.ps').trim().replace(/\/+$/, '');
}
function getMerchantId() {
    return String(process.env.JAWWALPAY_MERCHANT_ID || '').trim();
}
function getSecretKey() {
    return String(process.env.JAWWALPAY_SECRET_KEY || process.env.PAYMENT_SECRET_KEY || '').trim();
}
function getWebhookSecret() {
    return String(process.env.JAWWALPAY_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || '').trim();
}

function isConfigured() {
    return Boolean(getBaseUrl() && getMerchantId() && getSecretKey() && getWebhookSecret());
}

function signRaw(rawBody) {
    return crypto.createHmac('sha256', getWebhookSecret()).update(rawBody).digest('hex');
}

function isSignatureValid(rawBody, provided) {
    const expected = signRaw(rawBody);
    const got = String(provided || '').trim().toLowerCase();
    if (!got || got.length !== expected.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(got, 'utf8'));
    } catch (_err) {
        return false;
    }
}

/**
 * إنشاء جلسة دفع JawwalPay.
 * POST {base}/v1/payments/create → { gatewayRef, redirectUrl, expiresAt }
 */
async function createSession({ order, returnUrl }) {
    const baseUrl = getBaseUrl();
    const merchantId = getMerchantId();
    const amount = Number(order.price) || 0;
    const currency = String(process.env.STORE_CURRENCY || 'ILS').toUpperCase();
    const siteUrl = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');

    const payload = {
        merchantId,
        orderId: order.orderId,
        amount: Math.round(amount * 100) / 100,
        currency,
        returnUrl: returnUrl || (siteUrl ? `${siteUrl}/api/payments/return` : '/api/payments/return'),
        webhookUrl: siteUrl ? `${siteUrl}/api/payments/webhook` : '/api/payments/webhook',
        description: `Joker Store order ${order.orderId}`
    };

    const response = await fetch(`${baseUrl}/v1/payments/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getSecretKey()}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`JawwalPay create failed (${response.status}): ${detail.slice(0, 200)}`);
    }

    const data = await response.json().catch(() => ({}));
    const gatewayRef = data.gatewayRef || data.sessionId || data.id || data.ref;
    const redirectUrl = data.redirectUrl || data.checkoutUrl || data.paymentUrl || data.url;
    if (!gatewayRef || !redirectUrl) {
        throw new Error('JawwalPay create: missing gatewayRef/redirectUrl');
    }

    return {
        gatewayRef: String(gatewayRef),
        redirectUrl: String(redirectUrl),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : new Date(Date.now() + 20 * 60 * 1000)
    };
}

/** التحقق من حدث JawwalPay webhook (جسم خام + HMAC) */
function verifyWebhook({ rawBody, headers = {} }) {
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return { ok: false, error: 'empty_body' };

    const signature = SIGNATURE_HEADERS.map(h => headers[h] || headers[h.toUpperCase()]).find(Boolean);
    if (!isSignatureValid(rawBody, signature)) return { ok: false, error: 'invalid_signature' };

    let payload;
    try { payload = JSON.parse(rawBody.toString('utf8')); } catch (_err) { return { ok: false, error: 'invalid_json' }; }

    const status = normalizeStatus(payload.status);
    const eventId = String(payload.id || payload.eventId || payload.transactionId || '').trim();
    const gatewayRef = String(payload.ref || payload.gatewayRef || payload.sessionId || '').trim();

    if (!eventId || !gatewayRef || !status) return { ok: false, error: 'invalid_payload' };

    return {
        ok: true,
        event: {
            eventId,
            gatewayRef,
            orderId: payload.orderId ? String(payload.orderId) : null,
            status,
            amount: payload.amount !== undefined ? Number(payload.amount) : null,
            currency: payload.currency ? String(payload.currency).toUpperCase() : null
        }
    };
}

/** استعلام حالة الدفع (احتياطي عند فقدان webhook) */
async function getStatus({ gatewayRef }) {
    if (!gatewayRef) return { status: 'unknown' };
    try {
        const response = await fetch(`${getBaseUrl()}/v1/payments/${encodeURIComponent(gatewayRef)}`, {
            headers: { Authorization: `Bearer ${getSecretKey()}` }
        });
        if (!response.ok) return { status: 'unknown' };
        const data = await response.json().catch(() => ({}));
        const status = normalizeStatus(data.status) || (data.status ? String(data.status).toLowerCase() : null);
        return { status: status || 'unknown' };
    } catch (_err) {
        return { status: 'unknown' };
    }
}

/** استرجاع كامل/جزئي */
async function refund({ gatewayRef, amount, reason }) {
    if (!gatewayRef) return { ok: false, error: 'missing_gateway_ref' };
    try {
        const response = await fetch(`${getBaseUrl()}/v1/payments/${encodeURIComponent(gatewayRef)}/refund`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getSecretKey()}`
            },
            body: JSON.stringify({ amount, reason })
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            return { ok: false, error: `JawwalPay refund failed (${response.status}): ${detail.slice(0, 200)}` };
        }
        const data = await response.json().catch(() => ({}));
        return { ok: true, refundRef: data.refundRef || data.id || `jawwalpay_refund_${Date.now()}` };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

module.exports = {
    name: 'jawwalpay',
    SIGNATURE_HEADERS,
    isConfigured,
    createSession,
    verifyWebhook,
    getStatus,
    refund
};
