// ======================================================
// بوابة دفع وهمية للتطوير والاختبار (Mock Gateway)
// ------------------------------------------------------
// تُحاكي دورة البوابة الحقيقية بالكامل بدون أي شبكة أو أموال:
//   createSession → صفحة دفع محلية → توقيع HMAC → webhook → تنفيذ الطلب
//
// لا تُفعّل أبداً في الإنتاج: isConfigured() ترجع false هناك.
// ======================================================

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { normalizeStatus } = require('./types');

const SIGNATURE_HEADER = 'x-mock-signature';

function getSecret() {
    return String(process.env.PAYMENT_WEBHOOK_SECRET || '').trim() || 'mock-payment-secret-dev-only';
}

function isConfigured() {
    // حماية صريحة: البوابة الوهمية لا تعمل على الإنتاج مهما كانت المتغيرات.
    if (process.env.NODE_ENV === 'production') return false;
    return Boolean(getSecret());
}

function signPayload(rawBody) {
    return crypto.createHmac('sha256', getSecret()).update(rawBody).digest('hex');
}

function isSignatureValid(rawBody, providedSignature) {
    const expected = signPayload(rawBody);
    const provided = String(providedSignature || '').trim().toLowerCase();
    if (!provided || provided.length !== expected.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(provided, 'utf8'));
    } catch (_err) {
        return false;
    }
}

/**
 * إنشاء جلسة دفع وهمية. لا نعتمد على أي قيمة قادمة من العميل:
 * المبلغ الحقيقي يُقرأ من الطلب داخل المتحكم عند التأكيد.
 */
function createSession({ order }) {
    const gatewayRef = `mock_${order.orderId}_${uuidv4()}`;
    const ttlMs = Math.max(5, Number.parseInt(process.env.PAYMENT_SESSION_MINUTES, 10) || 20) * 60 * 1000;
    const params = new URLSearchParams({
        ref: gatewayRef,
        order: order.orderId
    });
    return {
        gatewayRef,
        redirectUrl: `/api/payments/mock/checkout?${params.toString()}`,
        expiresAt: new Date(Date.now() + ttlMs)
    };
}

/**
 * التحقق من حدث الـwebhook. الجسم يجب أن يكون Buffer خاماً (قبل JSON.parse)
 * لأن التوقيع يُحسب على البايتات كما أرسلها المزوّد.
 */
function verifyWebhook({ rawBody, headers = {} }) {
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        return { ok: false, error: 'empty_body' };
    }

    const signature = headers[SIGNATURE_HEADER] || headers[SIGNATURE_HEADER.toUpperCase()];
    if (!isSignatureValid(rawBody, signature)) {
        return { ok: false, error: 'invalid_signature' };
    }

    let payload;
    try {
        payload = JSON.parse(rawBody.toString('utf8'));
    } catch (_err) {
        return { ok: false, error: 'invalid_json' };
    }

    const status = normalizeStatus(payload.status);
    const eventId = String(payload.id || '').trim();
    const gatewayRef = String(payload.ref || '').trim();

    if (!eventId || !gatewayRef || !status) {
        return { ok: false, error: 'invalid_payload' };
    }

    return {
        ok: true,
        event: {
            eventId,
            gatewayRef,
            orderId: payload.orderId ? String(payload.orderId) : null,
            status,
            amount: Number(payload.amount),
            currency: payload.currency ? String(payload.currency).toUpperCase() : null
        }
    };
}

async function getStatus() {
    // البوابة الوهمية لا تحتفظ بحالة خارجية؛ المهمة الدورية ستترك الطلب كما هو.
    return { status: 'pending' };
}

async function refund({ gatewayRef }) {
    if (!gatewayRef) return { ok: false, error: 'missing_gateway_ref' };
    return { ok: true, refundRef: `mock_refund_${uuidv4()}` };
}

module.exports = {
    name: 'mock',
    SIGNATURE_HEADER,
    isConfigured,
    signPayload,
    createSession,
    verifyWebhook,
    getStatus,
    refund
};
