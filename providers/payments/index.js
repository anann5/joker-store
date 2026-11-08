// ======================================================
// سجل بوابات الدفع المتاحة — يدعم أكثر من بوابة معاً
// ------------------------------------------------------
// الاختيار عبر PAYMENT_GATEWAY كأولوية أساسية، لكن عند تهيئة
// أكثر من بوابة (JawwalPay + PalPay مثلاً) تُعرض كل المهيّأة
// في الواجهة ويختار العميل بينها. أي بوابة جديدة تُضاف هنا
// كملف مستقل يطبّق العقد في types.js دون تعديل المتحكمات.
// ======================================================

const manual = require('./manual');
const mock = require('./mock');
const jawwalpay = require('./jawwalpay');
const palpay = require('./palpay');

const GATEWAYS = { manual, mock, jawwalpay, palpay };

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
 * كل البوابات الإلكترونية المهيّأة في هذه البيئة (استثناء manual).
 * تُستخدم لعرض خيارات الدفع في الواجهة ودعم تعدد البوابات معاً.
 * عند ضبط PAYMENT_GATEWAY=manual تُعطَّل كل البوابات (اليدوي فقط).
 * عند اسم غير معروف تُعطَّل أيضاً (حتى لا يُفعَّل شيء بصمت).
 */
function getEnabledGateways() {
    const primary = getActiveGatewayName();
    if (primary === 'manual' || !GATEWAYS[primary]) return [];
    return Object.values(GATEWAYS).filter(gateway => gateway.name !== 'manual' && gateway.isConfigured());
}

/**
 * البوابة الأساسية: PAYMENT_GATEWAY إن مهیّأة، وإلا null.
 */
function getConfiguredGateway() {
    const preferred = getGatewayByName(getActiveGatewayName());
    if (!preferred || preferred.name === 'manual') return null;
    return preferred;
}

function isOnlinePaymentsEnabled() {
    return getEnabledGateways().length > 0;
}

function getPublicConfig() {
    const primary = getConfiguredGateway();
    const gateways = getEnabledGateways().map(gateway => ({
        name: gateway.name,
        mode: process.env.PAYMENT_MODE === 'live' ? 'live' : 'sandbox'
    }));
    return {
        enabled: Boolean(primary),
        gateway: primary ? primary.name : 'manual',
        gateways,
        mode: process.env.PAYMENT_MODE === 'live' ? 'live' : 'sandbox'
    };
}

module.exports = {
    getActiveGatewayName,
    getGatewayByName,
    getConfiguredGateway,
    getEnabledGateways,
    isOnlinePaymentsEnabled,
    getPublicConfig
};
