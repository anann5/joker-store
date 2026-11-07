// ======================================================
// سجل بوابات الدفع المتاحة
// ------------------------------------------------------
// الاختيار عبر PAYMENT_GATEWAY. أي بوابة جديدة تُضاف هنا كملف مستقل
// يطبّق العقد في types.js دون تعديل المتحكمات.
// ======================================================

const manual = require('./manual');
const mock = require('./mock');

const GATEWAYS = { manual, mock };

function normalizeName(value) {
    return String(value || '').trim().toLowerCase();
}

function getActiveGatewayName() {
    return normalizeName(process.env.PAYMENT_GATEWAY) || 'manual';
}

function getGatewayByName(name) {
    const gateway = GATEWAYS[normalizeName(name)];
    if (!gateway) return null;
    return gateway.isConfigured() ? gateway : null;
}

/**
 * البوابة الفعّالة في هذه البيئة، أو null إذا كانت غير مهيّأة.
 * الغياب لا يُسقط الموقع: الدفع اليدوي يبقى يعمل.
 */
function getConfiguredGateway() {
    const gateway = getGatewayByName(getActiveGatewayName());
    if (!gateway || gateway.name === 'manual') return null;
    return gateway;
}

function isOnlinePaymentsEnabled() {
    return getConfiguredGateway() !== null;
}

function getPublicConfig() {
    const gateway = getConfiguredGateway();
    return {
        enabled: Boolean(gateway),
        gateway: gateway ? gateway.name : 'manual',
        mode: process.env.PAYMENT_MODE === 'live' ? 'live' : 'sandbox'
    };
}

module.exports = {
    getActiveGatewayName,
    getGatewayByName,
    getConfiguredGateway,
    isOnlinePaymentsEnabled,
    getPublicConfig
};
