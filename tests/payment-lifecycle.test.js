// اختبارات دورة حياة الدفع والحجز:
//   - حجز المخزون المحلي ذرياً عند إنشاء الطلب
//   - إثبات الدفع الخاص: under_review + منع إعادة استخدام نفس الإثبات (SHA-256)
//   - الاعتماد يستهلك الحجوزات القائمة بدل حجز كود جديد
//   - الرفض والانتهاء التلقائي يحرّران المخزون ويعيدان نقاط الولاء
//   - المهمة الدورية تُغلق الطلبات المنتهية وترسل الإشعارات

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const crypto = require('crypto');

const mockOrderSave = jest.fn().mockResolvedValue(true);

jest.mock('../models', () => {
    const actual = jest.requireActual('../models');
    const OrderMock = jest.fn().mockImplementation(cfg => ({ ...cfg, save: mockOrderSave }));
    OrderMock.exists = jest.fn().mockResolvedValue(null);
    OrderMock.countDocuments = jest.fn().mockResolvedValue(0);
    OrderMock.find = jest.fn();
    OrderMock.findOne = jest.fn();
    OrderMock.findOneAndUpdate = jest.fn();
    return {
        ...actual,
        Product: {
            find: jest.fn(),
            findById: jest.fn(),
            reserveCodesAtomic: jest.fn().mockResolvedValue(['R1']),
            releaseReservedCodes: jest.fn().mockResolvedValue({}),
            findReservedCodesForOrder: jest.fn().mockResolvedValue([]),
            claimCodeAtomic: jest.fn().mockResolvedValue('C-FALLBACK'),
            confirmReservedCodes: jest.fn().mockResolvedValue({})
        },
        Order: OrderMock,
        User: {
            findByIdAndUpdate: jest.fn().mockResolvedValue({}),
            findOneAndUpdate: jest.fn().mockResolvedValue({ loyaltyPoints: 0 }),
            updateOne: jest.fn().mockResolvedValue({})
        }
    };
});

jest.mock('../controllers/helpers', () => ({
    createLog: jest.fn().mockResolvedValue(true),
    sendTelegramAlert: jest.fn().mockResolvedValue(true)
}));

jest.mock('../controllers/notification', () => ({
    sendOrderCreatedEmail: jest.fn().mockResolvedValue(true),
    sendOrderConfirmationEmail: jest.fn().mockResolvedValue(true),
    sendOrderRejectedEmail: jest.fn().mockResolvedValue(true),
    sendOrderExpiredEmail: jest.fn().mockResolvedValue(true)
}));

jest.mock('../controllers/push', () => ({
    notifyOrderStatus: jest.fn().mockResolvedValue({})
}));

jest.mock('../providers/registry', () => ({
    getProviders: jest.fn(),
    getProvider: jest.fn(),
    getProvidersSafe: jest.fn()
}));

jest.mock('../providers/adapter', () => ({
    purchaseItem: jest.fn(),
    fetchCatalog: jest.fn(),
    fetchBalance: jest.fn()
}));

jest.mock('../services/objectStorage', () => ({
    isEnabled: jest.fn(() => false),
    putObject: jest.fn(),
    getObject: jest.fn(),
    getObjectBuffer: jest.fn(),
    contentTypeForFilename: jest.fn(() => 'image/png'),
    isNotFoundError: jest.fn(() => false)
}));

const { Product, Order, User } = require('../models');
const { createLog, sendTelegramAlert } = require('../controllers/helpers');
const { sendOrderExpiredEmail } = require('../controllers/notification');
const objectStorage = require('../services/objectStorage');
const storeController = require('../controllers/storeController');
const orderController = require('../controllers/orderController');

const PRODUCT_ID = '507f191e810c19729de860ea';
const USER_ID = '507f191e810c19729de860ec';
const ORDER_ID = '507f191e810c19729de860ed';

const app = express();
app.use(express.json());
app.post('/api/checkout', storeController.createOrder);
app.post('/api/admin/orders/:orderId/approve', orderController.approveOrder);
app.post('/api/admin/orders/:orderId/reject', orderController.rejectOrder);

function makeProduct(overrides = {}) {
    return {
        _id: PRODUCT_ID,
        productName: { ar: 'منتج', en: 'Product' },
        price: 10,
        costPrice: 4,
        isActive: true,
        isExternal: false,
        codes: [
            { value: 'R1', status: 'available' },
            { value: 'R2', status: 'available' }
        ],
        category: 'pubg',
        region: 'global',
        ...overrides
    };
}

function checkout(body = {}) {
    return request(app)
        .post('/api/checkout')
        .send({
            customerEmail: 'buyer@example.com',
            cartItems: [{ id: PRODUCT_ID, qty: 1 }],
            paymentGateway: 'jawwal_pay',
            paymentRef: 'ref-123',
            ...body
        });
}

function makeFindQuery(docs) {
    return {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(docs)
    };
}

function makeIoStub() {
    const emitMock = jest.fn();
    const toMock = jest.fn(() => ({ emit: emitMock }));
    return { io: { to: toMock }, toMock, emitMock };
}

describe('دورة حياة الدفع', () => {
    let existsSpy;
    let readSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOrderSave.mockResolvedValue(true);
        Product.find.mockResolvedValue([makeProduct()]);
        Product.reserveCodesAtomic.mockResolvedValue(['R1', 'R2']);
        Product.findReservedCodesForOrder.mockResolvedValue([]);
        Product.claimCodeAtomic.mockResolvedValue('C-FALLBACK');
        Product.releaseReservedCodes.mockResolvedValue({});
        Product.confirmReservedCodes.mockResolvedValue({});
        Order.exists.mockResolvedValue(null);
        Order.countDocuments.mockResolvedValue(0);
        User.findByIdAndUpdate.mockResolvedValue({});
        User.findOneAndUpdate.mockResolvedValue({ loyaltyPoints: 0 });
        objectStorage.isEnabled.mockReturnValue(false);
        objectStorage.isNotFoundError.mockReturnValue(false);
        objectStorage.getObjectBuffer.mockReset();

        existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('proof-bytes'));
    });

    afterEach(() => {
        existsSpy.mockRestore();
        readSpy.mockRestore();
    });

    it('يحجز المخزون المحلي عند إنشاء الطلب ويعيد awaiting_payment', async () => {
        const res = await checkout({ cartItems: [{ id: PRODUCT_ID, qty: 2 }] });

        expect(res.statusCode).toBe(201);
        expect(res.body.paymentStatus).toBe('awaiting_payment');
        expect(res.body.reservationExpiresAt).toBeTruthy();

        expect(Product.reserveCodesAtomic).toHaveBeenCalledWith(
            PRODUCT_ID,
            2,
            res.body.orderId,
            'buyer@example.com',
            expect.any(Date)
        );

        const savedOrder = Order.mock.calls[0][0];
        expect(savedOrder.stockReserved).toBe(true);
        expect(savedOrder.paymentStatus).toBe('awaiting_payment');
        expect(savedOrder.reservationExpiresAt).toBeInstanceOf(Date);
    });

    it('يضع الطلب تحت المراجعة عند وجود إثبات دفع ويمنع إعادة استخدامه', async () => {
        const proofUrl = '/private-proofs/1700000000000-0123456789abcdef.png';

        const first = await checkout({ paymentProofUrl: proofUrl });
        expect(first.statusCode).toBe(201);
        expect(first.body.paymentStatus).toBe('under_review');
        const savedOrder = Order.mock.calls[0][0];
        expect(savedOrder.paymentProofUrl).toBe(proofUrl);
        expect(savedOrder.paymentProofHash).toMatch(/^[a-f0-9]{64}$/);
        expect(savedOrder.paymentSubmittedAt).toBeInstanceOf(Date);

        const reservesBefore = Product.reserveCodesAtomic.mock.calls.length;
        Order.exists.mockResolvedValue({ _id: 'existing-order' });

        const second = await checkout({ paymentProofUrl: proofUrl });
        expect(second.statusCode).toBe(400);
        expect(second.body.error).toContain('إثبات الدفع');
        expect(Product.reserveCodesAtomic).toHaveBeenCalledTimes(reservesBefore);
    });

    it('يقرأ إثبات الدفع من R2 ويحسب بصمة SHA-256 من المحتوى', async () => {
        const proofUrl = '/private-proofs/1700000000000-0123456789abcdef.png';
        const proofBytes = Buffer.from('r2-proof-bytes');
        objectStorage.isEnabled.mockReturnValue(true);
        objectStorage.getObjectBuffer.mockResolvedValue(proofBytes);

        const res = await checkout({ paymentProofUrl: proofUrl });

        expect(res.statusCode).toBe(201);
        expect(res.body.paymentStatus).toBe('under_review');
        expect(objectStorage.getObjectBuffer).toHaveBeenCalledWith(
            'payment-proofs/1700000000000-0123456789abcdef.png',
            expect.any(Number)
        );
        const savedOrder = Order.mock.calls[0][0];
        expect(savedOrder.paymentProofHash).toBe(
            crypto.createHash('sha256').update(proofBytes).digest('hex')
        );
    });

    it('يرفض إثبات دفع غير موجود في R2', async () => {
        objectStorage.isEnabled.mockReturnValue(true);
        objectStorage.isNotFoundError.mockReturnValue(true);
        objectStorage.getObjectBuffer.mockRejectedValue({ name: 'NoSuchKey' });

        const res = await checkout({ paymentProofUrl: '/private-proofs/1700000000000-0123456789abcdef.png' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('غير موجود');
        expect(Product.reserveCodesAtomic).not.toHaveBeenCalled();
    });

    it('يعيد 503 عند تعذّر الوصول إلى R2 بدل ادعاء أن الإثبات غير موجود', async () => {
        objectStorage.isEnabled.mockReturnValue(true);
        objectStorage.isNotFoundError.mockReturnValue(false);
        objectStorage.getObjectBuffer.mockRejectedValue(new Error('network down'));

        const res = await checkout({ paymentProofUrl: '/private-proofs/1700000000000-0123456789abcdef.png' });

        expect(res.statusCode).toBe(503);
        expect(Product.reserveCodesAtomic).not.toHaveBeenCalled();
    });

    it('يعتمد الطلب مستهلكاً الأكواد المحجوزة مسبقاً دون حجز جديد', async () => {
        const order = {
            orderId: 'T500',
            productName: 'منتج',
            buyerEmail: 'buyer@example.com',
            userId: null,
            status: 'pending',
            items: [{
                productId: PRODUCT_ID,
                qty: 2,
                fulfilmentType: 'local',
                fulfilmentStatus: 'pending'
            }],
            price: 20,
            deliveredCodes: [],
            save: jest.fn().mockResolvedValue(true)
        };
        Order.findOneAndUpdate.mockResolvedValue(order);
        Product.findById.mockResolvedValue(makeProduct());
        Product.findReservedCodesForOrder.mockResolvedValue(['R1', 'R2']);

        const res = await request(app).post('/api/admin/orders/T500/approve');

        expect(res.statusCode).toBe(200);
        expect(Product.findReservedCodesForOrder).toHaveBeenCalledWith(PRODUCT_ID, 'T500');
        expect(Product.claimCodeAtomic).not.toHaveBeenCalled();
        expect(order.deliveredCodes).toEqual(['R1', 'R2']);
        expect(order.status).toBe('completed');
        expect(Product.confirmReservedCodes).toHaveBeenCalledWith('T500');

        const approvalUpdate = Order.findOneAndUpdate.mock.calls[0][1].$set;
        expect(approvalUpdate.paymentStatus).toBe('paid');
        expect(approvalUpdate.reservationExpiresAt).toBeNull();
    });

    it('يكمل النقص بالحجز الذرّي إذا كانت الحجوزات أقل من الكمية', async () => {
        const order = {
            orderId: 'T501',
            productName: 'منتج',
            buyerEmail: 'buyer@example.com',
            userId: null,
            status: 'pending',
            items: [{
                productId: PRODUCT_ID,
                qty: 2,
                fulfilmentType: 'local',
                fulfilmentStatus: 'pending'
            }],
            price: 20,
            deliveredCodes: [],
            save: jest.fn().mockResolvedValue(true)
        };
        Order.findOneAndUpdate.mockResolvedValue(order);
        Product.findById.mockResolvedValue(makeProduct());
        Product.findReservedCodesForOrder.mockResolvedValue(['R1']);

        const res = await request(app).post('/api/admin/orders/T501/approve');

        expect(res.statusCode).toBe(200);
        expect(Product.claimCodeAtomic).toHaveBeenCalledTimes(1);
        expect(order.deliveredCodes).toEqual(['R1', 'C-FALLBACK']);
    });

    it('يرفض الطلب ويحرّر المخزون ويعيد نقاط الولاء', async () => {
        const order = {
            _id: ORDER_ID,
            orderId: 'T502',
            productName: 'منتج',
            buyerEmail: 'buyer@example.com',
            userId: USER_ID,
            status: 'pending',
            paymentStatus: 'under_review',
            loyaltyPoints: 10,
            loyaltyPointsRefunded: false,
            save: jest.fn().mockResolvedValue(true)
        };
        Order.findOne.mockResolvedValue(order);
        Order.findOneAndUpdate.mockResolvedValue(order);

        const res = await request(app).post('/api/admin/orders/T502/reject');

        expect(res.statusCode).toBe(200);
        expect(order.status).toBe('refunded');
        expect(order.paymentStatus).toBe('cancelled');
        expect(Product.releaseReservedCodes).toHaveBeenCalledWith('T502');
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
            USER_ID,
            expect.objectContaining({ $inc: { loyaltyPoints: 10 } })
        );
    });

    it('المهمة الدورية تُلغي الطلبات المنتهية وتُعيد النقاط وتُعلم العميل', async () => {
        const candidate = {
            _id: ORDER_ID,
            orderId: 'T503',
            userId: USER_ID,
            loyaltyPoints: 10,
            loyaltyPointsRefunded: false,
            paymentStatus: 'under_review',
            buyerEmail: 'buyer@example.com',
            productName: 'منتج'
        };
        Order.find.mockReturnValue(makeFindQuery([candidate]));
        Order.findOneAndUpdate
            .mockResolvedValueOnce({ ...candidate, paymentStatus: 'expired' })
            .mockResolvedValueOnce(candidate);

        const { io, toMock, emitMock } = makeIoStub();
        const expired = await orderController.expireStaleOrders(io);

        expect(expired).toBe(1);
        const expiryUpdate = Order.findOneAndUpdate.mock.calls[0][1].$set;
        expect(expiryUpdate).toEqual(expect.objectContaining({
            status: 'cancelled',
            paymentStatus: 'expired',
            cancellationReason: 'payment_window_expired'
        }));
        expect(Product.releaseReservedCodes).toHaveBeenCalledWith('T503');
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
            USER_ID,
            expect.objectContaining({ $inc: { loyaltyPoints: 10 } })
        );
        expect(sendOrderExpiredEmail).toHaveBeenCalled();
        expect(createLog).toHaveBeenCalled();
        expect(sendTelegramAlert).toHaveBeenCalledWith(expect.stringContaining('انتهت مهلة مراجعة الدفع'));
        expect(toMock).toHaveBeenCalledWith(`user:${USER_ID}`);
        expect(emitMock).toHaveBeenCalledWith('order_status', {
            orderId: 'T503',
            status: 'cancelled'
        });
    });
});
