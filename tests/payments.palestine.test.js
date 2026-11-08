// اختبارات بوابتي فلسطين: JawwalPay + PalPay
//   - isConfigured يتحقق من مفاتيح التاجر
//   - verifyWebhook يتحقق من توقيع HMAC على الجسم الخام
//   - تعدد البوابات: getEnabledGateways و getPublicConfig و webhook متعدد

const crypto = require('crypto');

const jawwal = require('../providers/payments/jawwalpay');
const palpay = require('../providers/payments/palpay');
const payments = require('../providers/payments');

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
    for (const key of Object.keys(process.env)) {
        if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
}

afterEach(restoreEnv);

function sign(secret, body) {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('JawwalPay adapter', () => {
    const SECRET = 'jawwal-secret';
    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        process.env.JAWWALPAY_BASE_URL = 'https://sandbox.jawwalpay.test';
        process.env.JAWWALPAY_MERCHANT_ID = 'merchant-1';
        process.env.JAWWALPAY_SECRET_KEY = 'sk-test';
        process.env.JAWWALPAY_WEBHOOK_SECRET = SECRET;
    });

    it('isConfigured true عند وجود المفاتيح', () => {
        expect(jawwal.isConfigured()).toBe(true);
    });

    it('isConfigured false عند غياب Merchant ID', () => {
        process.env.JAWWALPAY_MERCHANT_ID = '';
        expect(jawwal.isConfigured()).toBe(false);
    });

    it('يقبل webhook موقعاً صحيحاً', () => {
        const raw = Buffer.from(JSON.stringify({
            id: 'evt_1', ref: 'gw_123', orderId: 'ABC', status: 'paid', amount: 50, currency: 'ILS'
        }));
        const result = jawwal.verifyWebhook({
            rawBody: raw,
            headers: { 'x-jawwalpay-signature': sign(SECRET, raw) }
        });
        expect(result.ok).toBe(true);
        expect(result.event.status).toBe('paid');
        expect(result.event.gatewayRef).toBe('gw_123');
    });

    it('يرفض توقيعاً مزوّراً', () => {
        const raw = Buffer.from(JSON.stringify({ id: 'evt_1', ref: 'gw_123', status: 'paid' }));
        const result = jawwal.verifyWebhook({
            rawBody: raw,
            headers: { 'x-jawwalpay-signature': 'deadbeef' }
        });
        expect(result.ok).toBe(false);
        expect(result.error).toBe('invalid_signature');
    });

    it('يرفض الجسم المعدّل بعد التوقيع', () => {
        const raw = Buffer.from(JSON.stringify({ id: 'evt_1', ref: 'gw_123', status: 'paid', amount: 100 }));
        const sig = sign(SECRET, raw);
        const tampered = Buffer.from(JSON.stringify({ id: 'evt_1', ref: 'gw_123', status: 'paid', amount: 1 }));
        expect(jawwal.verifyWebhook({ rawBody: tampered, headers: { 'x-jawwalpay-signature': sig } }).ok).toBe(false);
    });
});

describe('PalPay adapter', () => {
    const SECRET = 'palpay-secret';
    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        process.env.PALPAY_BASE_URL = 'https://sandbox.palpay.test';
        process.env.PALPAY_MERCHANT_ID = 'merchant-2';
        process.env.PALPAY_SECRET_KEY = 'sk-test-2';
        process.env.PALPAY_WEBHOOK_SECRET = SECRET;
    });

    it('isConfigured true عند وجود المفاتيح', () => {
        expect(palpay.isConfigured()).toBe(true);
    });

    it('يقبل webhook موقعاً صحيحاً مع x-signature احتياطياً', () => {
        const raw = Buffer.from(JSON.stringify({
            id: 'evt_9', ref: 'pal_999', status: 'success', amount: 30, currency: 'ILS'
        }));
        const result = palpay.verifyWebhook({
            rawBody: raw,
            headers: { 'x-signature': sign(SECRET, raw) }
        });
        expect(result.ok).toBe(true);
        expect(result.event.status).toBe('paid');
    });

    it('يرفض حالة غير معروفة', () => {
        const raw = Buffer.from(JSON.stringify({ id: 'evt_9', ref: 'pal_999', status: 'weird' }));
        const result = palpay.verifyWebhook({
            rawBody: raw,
            headers: { 'x-palpay-signature': sign(SECRET, raw) }
        });
        expect(result.ok).toBe(false);
        expect(result.error).toBe('invalid_payload');
    });
});

describe('تعدد البوابات معاً', () => {
    it('getEnabledGateways يعيد كل المهيّأة', () => {
        process.env.NODE_ENV = 'test';
        process.env.PAYMENT_GATEWAY = 'jawwalpay';
        process.env.JAWWALPAY_MERCHANT_ID = 'm1';
        process.env.JAWWALPAY_SECRET_KEY = 'sk1';
        process.env.JAWWALPAY_WEBHOOK_SECRET = 'ws1';
        process.env.PALPAY_MERCHANT_ID = 'm2';
        process.env.PALPAY_SECRET_KEY = 'sk2';
        process.env.PALPAY_WEBHOOK_SECRET = 'ws2';
        process.env.PAYMENT_WEBHOOK_SECRET = 'ws-shared';

        const enabled = payments.getEnabledGateways().map(g => g.name);
        expect(enabled).toContain('jawwalpay');
        expect(enabled).toContain('palpay');
    });

    it('getPublicConfig يعرض gateways للمصدر', () => {
        process.env.NODE_ENV = 'test';
        process.env.PAYMENT_GATEWAY = 'jawwalpay';
        process.env.JAWWALPAY_MERCHANT_ID = 'm1';
        process.env.JAWWALPAY_SECRET_KEY = 'sk1';
        process.env.JAWWALPAY_WEBHOOK_SECRET = 'ws1';
        process.env.PALPAY_MERCHANT_ID = 'm2';
        process.env.PALPAY_SECRET_KEY = 'sk2';
        process.env.PALPAY_WEBHOOK_SECRET = 'ws2';
        process.env.PAYMENT_WEBHOOK_SECRET = 'ws-shared';

        const cfg = payments.getPublicConfig();
        expect(cfg.enabled).toBe(true);
        expect(cfg.gateways.map(g => g.name)).toEqual(expect.arrayContaining(['jawwalpay', 'palpay']));
        expect(cfg.gateway).toBe('jawwalpay');
    });

    it('getGatewayByName يعيد بوابة مهيّأة فقط', () => {
        process.env.JAWWALPAY_MERCHANT_ID = '';
        expect(payments.getGatewayByName('jawwalpay')).toBeNull();
        expect(payments.getGatewayByName('does-not-exist')).toBeNull();
    });
});
