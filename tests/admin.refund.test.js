// اختبارات زر الاسترجاع الآمن (ضوابط عالية):
//   Backend:
//     - مرفوض إن لم يكن مدفوعاً إلكترونياً (paid + online)
//     - سبب إلزامي ≥5 أحرف
//     - مبلغ موجب ولا يتجاوز سعر الطلب
//     - مرفوض إن سبق استرجاعه
//     - rate limit 20/ساعة على المسار
//   Frontend:
//     - زر يظهر فقط للطلبات paid+online
//     - نافذة تأكيد تتطلب كتابة رقم الطلب + سبب
//     - تحذير العمولة موجود

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../models', () => ({
    Order: {
        findOne: jest.fn()
    },
    Product: {
        releaseReservedCodes: jest.fn().mockResolvedValue({})
    },
    User: {}
}));

jest.mock('../providers/payments', () => ({
    getGatewayByName: jest.fn()
}));

jest.mock('../controllers/helpers', () => ({
    createLog: jest.fn().mockResolvedValue(true),
    sendTelegramAlert: jest.fn().mockResolvedValue(true)
}));

jest.mock('../controllers/notification', () => ({
    sendOrderConfirmationEmail: jest.fn(),
    sendOrderRejectedEmail: jest.fn(),
    sendOrderFailedEmail: jest.fn(),
    sendOrderExpiredEmail: jest.fn()
}));

jest.mock('../controllers/push', () => ({}));

jest.mock('../providers/registry', () => ({}));
jest.mock('../providers/adapter', () => ({}));
jest.mock('../config/siteSettings', () => ({}));
jest.mock('../middleware/upload', () => ({}));
jest.mock('../providers/regions', () => ({ normalizeRegion: jest.fn() }));
jest.mock('../providers/currency', () => ({}));
jest.mock('../providers/fxPricing', () => ({}));
jest.mock('../controllers/promo', () => ({}));
jest.mock('../services/objectStorage', () => ({}));

const ADMIN_HTML = path.join(__dirname, '..', 'private', 'admin.html');
const ADMIN_CSS = path.join(__dirname, '..', 'private', 'admin-style.css');
const ADMIN_JS = path.join(__dirname, '..', 'private', 'admin.js');

const html = fs.readFileSync(ADMIN_HTML, 'utf8');
const js = fs.readFileSync(ADMIN_JS, 'utf8');

describe('Refund UI: markup وازرار', () => {
    it('يوجد modal استرجاع مع تحذير العمولة', () => {
        expect(html).toContain('id="refundModal"');
        expect(html).toContain('id="refundConfirmInput"');
        expect(html).toContain('id="refundAmount"');
        expect(html).toContain('id="refundReasonSelect"');
        expect(html).toContain('عمولة البوابة');
        expect(html).toContain('id="confirmRefundBtn"');
    });

    it('المسار الإداري مربوط بـ limiter صارم ومخطط Joi', () => {
        const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminRoutes.js'), 'utf8');
        expect(routes).toContain('refundLimiter');
        expect(routes).toContain('refundSchema');
        expect(routes).toContain('/orders/:orderId/refund');
    });

    it('زر الاسترجاع يظهر فقط للطلبات paid+online', () => {
        expect(js).toContain("order.paymentMode === 'online'");
        expect(js).toContain("paymentStatus === 'paid'");
        expect(js).toContain('data-action="refund-order"');
    });

    it('التأكيد يتطلب كتابة رقم الطلب', () => {
        expect(js).toContain('typed === expected');
        expect(js).toContain('updateRefundConfirmState');
        expect(js).toContain('_refundSubmitting');
    });

    it('السبب الإلزامي والاسترجاع عبر CSRF', () => {
        expect(js).toContain('confirmRefund');
        expect(js).toContain('/refund');
        expect(js).toContain('ensureAdminCsrfToken');
    });
});

describe('Refund backend: الضوابط', () => {
    const { Order } = require('../models');
    const payments = require('../providers/payments');
    const orderController = require('../controllers/orderController');

    const app = express();
    app.use(express.json());
    app.post('/api/admin/orders/:orderId/refund', orderController.refundOrder);

    const mockGateway = {
        refund: jest.fn().mockResolvedValue({ ok: true, refundRef: 'refund_123' })
    };

    function paidOnlineOrder(overrides = {}) {
        return {
            _id: 'order-mongo-id',
            orderId: 'ABC123',
            price: 100,
            paymentMode: 'online',
            paymentStatus: 'paid',
            paymentGateway: 'mock',
            gatewayRef: 'mock_ABC123_ref',
            productName: 'منتج',
            refundRef: null,
            save: jest.fn().mockResolvedValue(true),
            ...overrides
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        payments.getGatewayByName.mockReturnValue(mockGateway);
    });

    it('يرفض إن لم يكن مدفوعاً (paid)', async () => {
        Order.findOne.mockResolvedValue(paidOnlineOrder({ paymentStatus: 'awaiting_payment' }));
        const res = await request(app)
            .post('/api/admin/orders/ABC123/refund')
            .send({ reason: 'customer request legitimate' });
        expect(res.statusCode).toBe(400);
        expect(mockGateway.refund).not.toHaveBeenCalled();
    });

    it('يرفض إن لم يكن إلكترونياً', async () => {
        Order.findOne.mockResolvedValue(paidOnlineOrder({ paymentMode: 'manual' }));
        const res = await request(app)
            .post('/api/admin/orders/ABC123/refund')
            .send({ reason: 'customer request legitimate' });
        expect(res.statusCode).toBe(400);
    });

    it('يرفض إن سبق استرجاعه', async () => {
        Order.findOne.mockResolvedValue(paidOnlineOrder({ refundRef: 'refund_existing' }));
        const res = await request(app)
            .post('/api/admin/orders/ABC123/refund')
            .send({ reason: 'customer request legitimate' });
        expect(res.statusCode).toBe(409);
    });

    it('يرفض سبباً قصيراً', async () => {
        Order.findOne.mockResolvedValue(paidOnlineOrder());
        const res = await request(app)
            .post('/api/admin/orders/ABC123/refund')
            .send({ reason: 'abc' });
        expect(res.statusCode).toBe(400);
        expect(mockGateway.refund).not.toHaveBeenCalled();
    });

    it('يرفض مبلغاً يتجاوز سعر الطلب', async () => {
        Order.findOne.mockResolvedValue(paidOnlineOrder());
        const res = await request(app)
            .post('/api/admin/orders/ABC123/refund')
            .send({ amount: 500, reason: 'customer request legitimate' });
        expect(res.statusCode).toBe(400);
    });

    it('يرفض مبلغاً سالباً أو غير موجب', async () => {
        Order.findOne.mockResolvedValue(paidOnlineOrder());
        const res = await request(app)
            .post('/api/admin/orders/ABC123/refund')
            .send({ amount: -10, reason: 'customer request legitimate' });
        expect(res.statusCode).toBe(400);
    });

    it('ينجح بالاسترجاع الكامل عند سبب صحيح', async () => {
        const order = paidOnlineOrder();
        Order.findOne.mockResolvedValue(order);
        const res = await request(app)
            .post('/api/admin/orders/ABC123/refund')
            .send({ reason: 'faulty_code: الكود تالف' });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.full).toBe(true);
        expect(order.paymentStatus).toBe('refunded');
        expect(mockGateway.refund).toHaveBeenCalledWith(
            expect.objectContaining({ gatewayRef: 'mock_ABC123_ref', amount: 100 })
        );
    });

    it('ينجح بالاسترجاع الجزئي', async () => {
        const order = paidOnlineOrder();
        Order.findOne.mockResolvedValue(order);
        const res = await request(app)
            .post('/api/admin/orders/ABC123/refund')
            .send({ amount: 40, reason: 'partial: العميل ألغى جزءاً' });
        expect(res.statusCode).toBe(200);
        expect(res.body.full).toBe(false);
        expect(order.paymentStatus).toBe('paid'); // لا يُغلق كـ refunded عند الجزئي
    });
});

describe('Refund schema: Joi', () => {
    const { refundSchema } = require('../middleware/validate');

    it('يرفض غياب السبب', () => {
        const { error } = refundSchema.validate({});
        expect(error).toBeDefined();
    });

    it('يقبل سبباً كافياً ومبلغاً صالحاً', () => {
        const { error } = refundSchema.validate({ amount: 50, reason: 'customer request legitimate' });
        expect(error).toBeUndefined();
    });

    it('يرفض مبلغاً غير موجب', () => {
        const { error } = refundSchema.validate({ amount: 0, reason: 'customer request legitimate' });
        expect(error).toBeDefined();
    });
});
