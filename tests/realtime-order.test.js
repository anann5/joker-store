// اختبارات الإشعارات اللحظية (WebSocket) لحالة الطلبات للعملاء المسجلين:
//   - approveOrder يرسل order_status إلى غرفة user:<id> عند اكتمال الطلب
//   - rejectOrder يرسل order_status (refunded) إلى غرفة user:<id>
//   - verifyUserSocket يقبل توكن user_token صالحاً وينضم لغرفة المستخدم

const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
    verify: jest.fn()
}));

jest.mock('../models', () => ({
    Product: {
        findById: jest.fn(),
        claimCodeAtomic: jest.fn()
    },
    Order: {
        findOneAndUpdate: jest.fn(),
        findOne: jest.fn()
    }
}));

jest.mock('../controllers/helpers', () => ({
    createLog: jest.fn().mockResolvedValue(true),
    sendTelegramAlert: jest.fn().mockResolvedValue(true)
}));

jest.mock('../controllers/notification', () => ({
    sendOrderConfirmationEmail: jest.fn().mockResolvedValue(true),
    sendOrderRejectedEmail: jest.fn().mockResolvedValue(true)
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

const jwt = require('jsonwebtoken');
const { Product, Order } = require('../models');
const { sendOrderConfirmationEmail, sendOrderRejectedEmail } = require('../controllers/notification');
const orderController = require('../controllers/orderController');
const authController = require('../controllers/authController');

const USER_ID = '507f191e810c19729de860eb';
const PRODUCT_ID = '507f191e810c19729de860ea';

function makeUserOrder(status = 'processing') {
    return {
        orderId: 'T200',
        productName: 'منتج تجريبي',
        buyerEmail: 'user@example.com',
        userId: USER_ID,
        status,
        items: [{
            productId: PRODUCT_ID,
            qty: 1,
            fulfilmentType: 'local',
            fulfilmentStatus: 'pending'
        }],
        price: 20,
        code: null,
        deliveredCodes: [],
        costPrice: 0,
        completedAt: null,
        failedAt: null,
        save: jest.fn().mockResolvedValue(true)
    };
}

function makeIoStub() {
    const emitMock = jest.fn();
    const toMock = jest.fn(() => ({ emit: emitMock }));
    return { io: { to: toMock }, toMock, emitMock };
}

function makeApp(io) {
    const app = express();
    app.use(express.json());
    app.set('io', io);
    app.post('/api/admin/orders/:orderId/approve', orderController.approveOrder);
    app.post('/api/admin/orders/:orderId/reject', orderController.rejectOrder);
    return app;
}

describe('approveOrder — إشعار لحظي للعميل المسجل', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('يرسل order_status (completed) إلى غرفة user:<id> عند نجاح التنفيذ', async () => {
        const { io, toMock, emitMock } = makeIoStub();
        const app = makeApp(io);

        const order = makeUserOrder('processing');
        Order.findOneAndUpdate.mockResolvedValue(order);
        Product.findById.mockResolvedValue({
            _id: PRODUCT_ID,
            isActive: true,
            isExternal: false,
            price: 10,
            basePrice: 0,
            profitMargin: 1.1,
            productName: { ar: 'منتج', en: 'Product' }
        });
        Product.claimCodeAtomic.mockResolvedValue('CODE-123');

        const res = await request(app).post('/api/admin/orders/T200/approve');

        expect(res.statusCode).toBe(200);
        expect(order.status).toBe('completed');
        expect(toMock).toHaveBeenCalledWith(`user:${USER_ID}`);
        expect(emitMock).toHaveBeenCalledWith('order_status', {
            orderId: 'T200',
            status: 'completed'
        });
        // الإشعار للأدمن يبقى كما هو
        expect(toMock).toHaveBeenCalledWith('admins');
        expect(emitMock).toHaveBeenCalledWith('order_approved', expect.objectContaining({ orderId: 'T200' }));
        expect(sendOrderConfirmationEmail).toHaveBeenCalled();
    });

    it('لا يرسل إشعاراً للعميل عندما لا يرتبط الطلب بمستخدم', async () => {
        const { io, toMock } = makeIoStub();
        const app = makeApp(io);

        const order = makeUserOrder('processing');
        order.userId = null;
        Order.findOneAndUpdate.mockResolvedValue(order);
        Product.findById.mockResolvedValue({
            _id: PRODUCT_ID,
            isActive: true,
            isExternal: false,
            price: 10,
            basePrice: 0,
            profitMargin: 1.1,
            productName: { ar: 'منتج', en: 'Product' }
        });
        Product.claimCodeAtomic.mockResolvedValue('CODE-123');

        const res = await request(app).post('/api/admin/orders/T200/approve');

        expect(res.statusCode).toBe(200);
        expect(toMock).not.toHaveBeenCalledWith(`user:${USER_ID}`);
        expect(toMock).toHaveBeenCalledWith('admins');
    });
});

describe('rejectOrder — إشعار لحظي للعميل المسجل', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('يرسل order_status (refunded) إلى غرفة user:<id> عند رفض الطلب', async () => {
        const { io, toMock, emitMock } = makeIoStub();
        const app = makeApp(io);

        const order = makeUserOrder('pending');
        Order.findOne.mockResolvedValue(order);

        const res = await request(app).post('/api/admin/orders/T200/reject');

        expect(res.statusCode).toBe(200);
        expect(order.status).toBe('refunded');
        expect(toMock).toHaveBeenCalledWith(`user:${USER_ID}`);
        expect(emitMock).toHaveBeenCalledWith('order_status', {
            orderId: 'T200',
            status: 'refunded'
        });
        expect(sendOrderRejectedEmail).toHaveBeenCalled();
    });

    it('لا يرسل إشعاراً عند غياب userId في الطلب', async () => {
        const { io, toMock } = makeIoStub();
        const app = makeApp(io);

        const order = makeUserOrder('pending');
        order.userId = null;
        Order.findOne.mockResolvedValue(order);

        const res = await request(app).post('/api/admin/orders/T200/reject');

        expect(res.statusCode).toBe(200);
        expect(toMock).not.toHaveBeenCalledWith(`user:${USER_ID}`);
    });
});

describe('verifyUserSocket — مصافحة مستخدم Socket.io', () => {
    const VALID_TOKEN = Buffer.from('signed.jwt.token').toString('base64');

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.JWT_USER_SECRET = 'test-user-secret';
    });

    afterAll(() => {
        delete process.env.JWT_USER_SECRET;
    });

    it('يقبل توكن user_token صالحاً وينضم لغرفة user:<id>', async () => {
        jwt.verify.mockReturnValue({ userId: USER_ID, email: 'user@example.com' });

        const socket = {
            userId: null,
            handshake: {
                headers: {
                    cookie: `user_token=${VALID_TOKEN}; admin_token=other`
                }
            },
            join: jest.fn()
        };
        const next = jest.fn();

        await authController.verifyUserSocket(socket, next);

        expect(jwt.verify).toHaveBeenCalledWith(VALID_TOKEN, 'test-user-secret');
        expect(socket.userId).toBe(USER_ID);
        expect(socket.join).toHaveBeenCalledWith(`user:${USER_ID}`);
        expect(next).toHaveBeenCalledWith();
    });

    it('يرفض توكن المستخدم غير الصالح', async () => {
        jwt.verify.mockImplementation(() => {
            throw new Error('invalid token');
        });

        const socket = {
            handshake: { headers: { cookie: 'user_token=expired.token.value' } },
            join: jest.fn()
        };
        const next = jest.fn();

        await authController.verifyUserSocket(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(socket.join).not.toHaveBeenCalled();
    });

    it('يرفض اتصالاً بلا توكن مستخدم', async () => {
        const socket = {
            handshake: { headers: { cookie: 'admin_token=abc' } },
            join: jest.fn()
        };
        const next = jest.fn();

        await authController.verifyUserSocket(socket, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(socket.join).not.toHaveBeenCalled();
    });
});
