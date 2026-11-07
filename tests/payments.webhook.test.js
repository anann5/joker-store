// اختبارات استقبال أحداث بوابة الدفع (webhook):
//   - رفض التوقيع غير الصالح
//   - منع المعالجة المزدوجة (idempotency)
//   - رفض دفعة بمبلغ غير مطابق دون تنفيذ الطلب
//   - تنفيذ الطلب تلقائياً عند دفعة صحيحة
//   - تجاهل مرجع لا نعرفه دون إعادة محاولات لا نهائية

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const mockMarkPaid = jest.fn();
const mockCancelPending = jest.fn();
const mockPaymentEventCreate = jest.fn();
const mockOrderFindOne = jest.fn();
const mockOrderUpdateOne = jest.fn();

jest.mock('../models', () => ({
    Order: {
        findOne: (...args) => mockOrderFindOne(...args),
        updateOne: (...args) => mockOrderUpdateOne(...args)
    },
    PaymentEvent: {
        create: (...args) => mockPaymentEventCreate(...args)
    }
}));

jest.mock('../controllers/orderController', () => ({
    markOrderPaidAndFulfil: (...args) => mockMarkPaid(...args),
    cancelPendingOrder: (...args) => mockCancelPending(...args)
}));

jest.mock('../controllers/helpers', () => ({
    createLog: jest.fn().mockResolvedValue(true),
    sendTelegramAlert: jest.fn().mockResolvedValue(true)
}));

const SHARED_SECRET = 'webhook-test-secret';
process.env.NODE_ENV = 'test';
process.env.PAYMENT_GATEWAY = 'mock';
process.env.PAYMENT_WEBHOOK_SECRET = SHARED_SECRET;
process.env.STORE_CURRENCY = 'ILS';

const paymentRoutes = require('../routes/paymentRoutes');

const app = express();
// نفس ترتيب app.js: الجسم الخام للـwebhook قبل أي JSON parser
app.use((req, res, next) => {
    if (req.method === 'POST' && req.path === '/api/payments/webhook') {
        return express.raw({ type: '*/*' })(req, res, next);
    }
    return express.json()(req, res, next);
});
app.use('/api', paymentRoutes);

function sign(raw) {
    return crypto.createHmac('sha256', SHARED_SECRET).update(raw).digest('hex');
}

function makeOrder(overrides = {}) {
    return {
        _id: 'order-object-id',
        orderId: 'ABC123',
        price: 40,
        paymentStatus: 'awaiting_payment',
        status: 'pending',
        gatewayRef: 'mock_ABC123_ref',
        productName: 'منتج',
        paymentMode: 'online',
        ...overrides
    };
}

function sendEvent(payload, { signature } = {}) {
    const raw = JSON.stringify(payload);
    const sig = signature === undefined ? sign(raw) : signature;
    return request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-mock-signature', sig)
        .send(raw);
}

function basePayload(overrides = {}) {
    return {
        id: `evt_${Math.random().toString(16).slice(2)}`,
        ref: 'mock_ABC123_ref',
        orderId: 'ABC123',
        status: 'paid',
        amount: 40,
        currency: 'ILS',
        ...overrides
    };
}

describe('POST /api/payments/webhook', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPaymentEventCreate.mockResolvedValue({});
        mockOrderFindOne.mockResolvedValue(makeOrder());
        mockMarkPaid.mockResolvedValue({ ok: true });
        mockCancelPending.mockResolvedValue({ ok: true });
        mockOrderUpdateOne.mockResolvedValue({});
    });

    it('يرفض التوقيع غير الصالح قبل أي تأثير على الطلب', async () => {
        const res = await sendEvent(basePayload(), { signature: 'deadbeef' });

        expect(res.statusCode).toBe(401);
        expect(mockPaymentEventCreate).not.toHaveBeenCalled();
        expect(mockMarkPaid).not.toHaveBeenCalled();
    });

    it('يعالج الدفعة الصحيحة وينفّذ الطلب تلقائياً', async () => {
        const res = await sendEvent(basePayload());

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, fulfilled: true });
        expect(mockMarkPaid).toHaveBeenCalledWith('ABC123', expect.any(Object));
    });

    it('لا يعالج نفس الحدث مرتين (idempotency)', async () => {
        const duplicate = Object.assign(new Error('duplicate key'), { code: 11000 });
        mockPaymentEventCreate.mockRejectedValue(duplicate);

        const res = await sendEvent(basePayload());

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, duplicate: true });
        expect(mockMarkPaid).not.toHaveBeenCalled();
    });

    it('يرفض دفعة بمبلغ غير مطابق ولا ينفّذ الطلب', async () => {
        const res = await sendEvent(basePayload({ amount: 1 }));

        expect(res.statusCode).toBe(200);
        expect(res.body.ignored).toBe('amount_mismatch');
        expect(mockMarkPaid).not.toHaveBeenCalled();
        expect(mockCancelPending).toHaveBeenCalledWith('ABC123', expect.objectContaining({
            paymentStatus: 'failed',
            reason: 'amount_mismatch'
        }));
    });

    it('يرفض دفعة بعملة مختلفة عن عملة المتجر', async () => {
        const res = await sendEvent(basePayload({ currency: 'USD' }));

        expect(res.statusCode).toBe(200);
        expect(res.body.ignored).toBe('amount_mismatch');
        expect(mockMarkPaid).not.toHaveBeenCalled();
    });

    it('يتجاهل مرجعاً غير معروف دون كسر الاستجابة', async () => {
        mockOrderFindOne.mockResolvedValue(null);

        const res = await sendEvent(basePayload());

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, ignored: 'unknown_order' });
        expect(mockMarkPaid).not.toHaveBeenCalled();
    });

    it('لا يكرر التنفيذ إذا كان الطلب مدفوعاً مسبقاً', async () => {
        mockOrderFindOne.mockResolvedValue(makeOrder({ paymentStatus: 'paid' }));

        const res = await sendEvent(basePayload());

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, duplicate: true });
        expect(mockMarkPaid).not.toHaveBeenCalled();
    });

    it('يلغي الطلب ويحرّر مخزونه عند إبلاغ البوابة بالفشل', async () => {
        const res = await sendEvent(basePayload({ status: 'failed' }));

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, status: 'failed' });
        expect(mockCancelPending).toHaveBeenCalledWith('ABC123', expect.objectContaining({
            paymentStatus: 'failed'
        }));
        expect(mockMarkPaid).not.toHaveBeenCalled();
    });
});

describe('GET /api/payments/config', () => {
    it('يرجع التفعيل بدون أي أسرار', async () => {
        const res = await request(app).get('/api/payments/config');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.config.enabled).toBe(true);
        expect(res.body.config.gateway).toBe('mock');
        expect(JSON.stringify(res.body)).not.toContain(SHARED_SECRET);
    });
});
