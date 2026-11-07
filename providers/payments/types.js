// ======================================================
// عقد بوابة الدفع الموحّد (Payment Gateway Contract)
// ------------------------------------------------------
// كل بوابة تُنفّذ هذه الدوال الخمس، فلا يعرف باقي المشروع أي مزوّد بعينه:
//
//   name                                  اسم البوابة كما يُخزَّن في الطلب
//   isConfigured()                        هل المفاتيح المطلوبة موجودة؟
//   createSession({ order, returnUrl })   إنشاء جلسة دفع
//       → { gatewayRef, redirectUrl, expiresAt }
//   verifyWebhook({ rawBody, headers })    التحقق من توقيع الحدث
//       → { ok: true, event: { eventId, gatewayRef, orderId, status, amount, currency } }
//       → { ok: false, error }
//   getStatus({ gatewayRef })              استعلام احتياطي عند فقدان الـwebhook
//       → { status: 'pending' | 'paid' | 'failed' | 'expired' | 'unknown' }
//   refund({ gatewayRef, amount, reason }) استرجاع كامل أو جزئي
//       → { ok: true, refundRef } | { ok: false, error }
//
// الحالات الموحّدة المقبولة من event.status: paid | failed | expired | refunded
// ======================================================

const EVENT_STATUSES = ['paid', 'failed', 'expired', 'refunded'];

function normalizeStatus(value) {
    const status = String(value || '').trim().toLowerCase();
    if (status === 'success' || status === 'succeeded' || status === 'captured' || status === 'completed') {
        return 'paid';
    }
    if (status === 'canceled' || status === 'cancelled' || status === 'declined') {
        return 'failed';
    }
    return EVENT_STATUSES.includes(status) ? status : null;
}

module.exports = { EVENT_STATUSES, normalizeStatus };
