// بوابة «يدوية» — الوضع الحالي: تحويل محلي + إثبات دفع يراجعه الأدمن.
// تبقى الخيار الافتراضي حتى تُهيّأ بوابة إلكترونية حقيقية.

module.exports = {
    name: 'manual',
    isConfigured: () => true,
    createSession: () => null,
    verifyWebhook: () => ({ ok: false, error: 'manual_gateway_has_no_webhook' }),
    getStatus: async () => ({ status: 'unknown' }),
    refund: async () => ({ ok: false, error: 'manual_gateway_has_no_api_refund' })
};
