// اختبارات بوابة الدفع الوهمية والعقد الموحّد:
//   - التوقيع HMAC صالح/مزوّر (timing-safe)
//   - تحويل الحالات إلى الحالة الموحّدة
//   - إنشاء جلسة تحتوي مرجعاً ووقت انتهاء
//   - البوابة الوهمية معطّلة في الإنتاج

const crypto = require('crypto');
const mockGateway = require('../providers/payments/mock');
const payments = require('../providers/payments');
const { normalizeStatus } = require('../providers/payments/types');

const SECRET = 'unit-test-secret';
const ORIGINAL_ENV = { ...process.env };

function sign(body, secret = SECRET) {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function restoreEnv() {
    for (const key of Object.keys(process.env)) {
        if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
}

afterEach(restoreEnv);

describe('normalizeStatus', () => {
    it('يوحّد أسماء الحالات الشائعة', () => {
        expect(normalizeStatus('SUCCESS')).toBe('paid');
        expect(normalizeStatus('captured')).toBe('paid');
        expect(normalizeStatus('declined')).toBe('failed');
        expect(normalizeStatus('canceled')).toBe('failed');
        expect(normalizeStatus('expired')).toBe('expired');
        expect(normalizeStatus('refunded')).toBe('refunded');
        expect(normalizeStatus('unknown-value')).toBeNull();
    });
});

describe('mock gateway: verifyWebhook', () => {
    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
    });

    const payload = JSON.stringify({
        id: 'evt_1',
        ref: 'mock_ORDER_abc',
        orderId: 'ORDER',
        status: 'paid',
        amount: 40,
        currency: 'ils'
    });

    it('يقبل التوقيع الصحيح ويعيد حدثاً موحّداً', () => {
        const raw = Buffer.from(payload);
        const result = mockGateway.verifyWebhook({
            rawBody: raw,
            headers: { 'x-mock-signature': sign(raw) }
        });

        expect(result.ok).toBe(true);
        expect(result.event).toEqual({
            eventId: 'evt_1',
            gatewayRef: 'mock_ORDER_abc',
            orderId: 'ORDER',
            status: 'paid',
            amount: 40,
            currency: 'ILS'
        });
    });

    it('يرفض التوقيع المزوّر', () => {
        const raw = Buffer.from(payload);
        const result = mockGateway.verifyWebhook({
            rawBody: raw,
            headers: { 'x-mock-signature': sign(raw, 'wrong-secret') }
        });
        expect(result.ok).toBe(false);
        expect(result.error).toBe('invalid_signature');
    });

    it('يرفض الجسم المعدّل بعد التوقيع', () => {
        const raw = Buffer.from(payload);
        const signature = sign(raw);
        const tampered = Buffer.from(payload.replace('"amount":40', '"amount":1'));

        const result = mockGateway.verifyWebhook({
            rawBody: tampered,
            headers: { 'x-mock-signature': signature }
        });
        expect(result.ok).toBe(false);
    });

    it('يرفض الطلب بلا توقيع أو بجسم فارغ', () => {
        expect(mockGateway.verifyWebhook({ rawBody: Buffer.from(payload), headers: {} }).ok).toBe(false);
        expect(mockGateway.verifyWebhook({ rawBody: Buffer.alloc(0), headers: {} }).ok).toBe(false);
    });

    it('يرفض الحمولة الناقصة أو ذات الحالة غير المعروفة', () => {
        const missing = Buffer.from(JSON.stringify({ id: 'x', ref: 'y', status: 'weird' }));
        const result = mockGateway.verifyWebhook({
            rawBody: missing,
            headers: { 'x-mock-signature': sign(missing) }
        });
        expect(result.ok).toBe(false);
        expect(result.error).toBe('invalid_payload');
    });
});

describe('mock gateway: createSession', () => {
    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
        process.env.PAYMENT_SESSION_MINUTES = '15';
    });

    it('ينشئ مرجعاً فريداً ورابط دفع ووقت انتهاء', () => {
        const before = Date.now();
        const session = mockGateway.createSession({ order: { orderId: 'ABC123' } });

        expect(session.gatewayRef).toMatch(/^mock_ABC123_[a-f0-9-]{36}$/);
        expect(session.redirectUrl).toContain('/api/payments/mock/checkout');
        expect(session.redirectUrl).toContain('order=ABC123');
        expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
    });
});

describe('اختيار البوابة', () => {
    it('يعطّل الدفع الإلكتروني عندما تكون البوابة manual', () => {
        process.env.PAYMENT_GATEWAY = 'manual';
        expect(payments.isOnlinePaymentsEnabled()).toBe(false);
        expect(payments.getPublicConfig()).toEqual({ enabled: false, gateway: 'manual', gateways: [], mode: 'sandbox' });
    });

    it('يفعّل البوابة الوهمية خارج الإنتاج عند ضبط السر', () => {
        process.env.NODE_ENV = 'test';
        process.env.PAYMENT_GATEWAY = 'mock';
        process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
        expect(payments.isOnlinePaymentsEnabled()).toBe(true);
        expect(payments.getPublicConfig().gateway).toBe('mock');
    });

    it('لا تسمح بالبوابة الوهمية في الإنتاج', () => {
        process.env.NODE_ENV = 'production';
        process.env.PAYMENT_GATEWAY = 'mock';
        process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
        expect(payments.getGatewayByName('mock')).toBeNull();
        expect(payments.isOnlinePaymentsEnabled()).toBe(false);
    });

    it('يعيد null لبوابة غير معروفة بدل الانفجار', () => {
        process.env.PAYMENT_GATEWAY = 'does-not-exist';
        expect(payments.getConfiguredGateway()).toBeNull();
    });
});
