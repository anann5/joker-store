// اختبارات نقاط الولاء:
//   - حماية CSRF على /api/loyalty/redeem (مسار يعتمد على كوكي الجلسة)
//   - خصم النقاط ذرّياً (شرط $gte) لمنع الاستبدال المزدوج
//   - تعويض النقاط عند فشل حفظ الطلب في /api/checkout

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-for-loyalty';

const mockOrderSave = jest.fn().mockResolvedValue(true);

jest.mock('../models', () => ({
    Product: { find: jest.fn() },
    Order: jest.fn().mockImplementation(() => ({ save: mockOrderSave })),
    Category: {},
    User: {
        findOneAndUpdate: jest.fn(),
        updateOne: jest.fn().mockResolvedValue({ acknowledged: true })
    }
}));

jest.mock('../controllers/helpers', () => ({
    createLog: jest.fn().mockResolvedValue(true),
    sendTelegramAlert: jest.fn().mockResolvedValue(true),
    getSafeBaseHost: jest.fn().mockReturnValue('http://localhost')
}));

jest.mock('../controllers/notification', () => ({
    sendOrderCreatedEmail: jest.fn().mockResolvedValue(true),
    sendOrderConfirmationEmail: jest.fn().mockResolvedValue(true),
    sendOrderRejectedEmail: jest.fn().mockResolvedValue(true)
}));

const storeRoutes = require('../routes/storeRoutes');
const csrfProtection = require('../middleware/csrf');
const { Product, User } = require('../models');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.get('/api/csrf-token', csrfProtection.issueToken);
app.use('/api', storeRoutes);

const USER_ID = '507f191e810c19729de860ec';
const PRODUCT_ID = '507f191e810c19729de860ea';

function userToken() {
    return jwt.sign({ userId: USER_ID, email: 'user@example.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function csrfCookies() {
    const res = await request(app).get('/api/csrf-token');
    const cookie = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]);
    return { token: res.body.csrfToken, cookie };
}

function makeProduct() {
    return {
        _id: PRODUCT_ID,
        productName: { ar: 'منتج', en: 'Product' },
        price: 20,
        isActive: true,
        isExternal: false,
        codes: [{ value: 'C1', status: 'available' }],
        category: 'pubg',
        region: 'global'
    };
}

describe('POST /api/loyalty/redeem', () => {
    beforeEach(() => jest.clearAllMocks());

    it('يرفض الطلب بدون توكن CSRF', async () => {
        const res = await request(app)
            .post('/api/loyalty/redeem')
            .set('Cookie', [`user_token=${userToken()}`])
            .send({ points: 10 });

        expect(res.statusCode).toBe(403);
        expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('يخصم النقاط ذرّياً عند صلاحية التوكن', async () => {
        const csrf = await csrfCookies();
        User.findOneAndUpdate.mockResolvedValue({ loyaltyPoints: 5 });

        const res = await request(app)
            .post('/api/loyalty/redeem')
            .set('Cookie', [`user_token=${userToken()}`, ...csrf.cookie])
            .set('X-CSRF-Token', csrf.token)
            .send({ points: 10 });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, discount: 1, remaining: 5 });
        expect(User.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ loyaltyPoints: { $gte: 10 } }),
            expect.anything(),
            expect.anything()
        );
    });

    it('يعيد 400 عند عدم كفاية النقاط', async () => {
        const csrf = await csrfCookies();
        User.findOneAndUpdate.mockResolvedValue(null);

        const res = await request(app)
            .post('/api/loyalty/redeem')
            .set('Cookie', [`user_token=${userToken()}`, ...csrf.cookie])
            .set('X-CSRF-Token', csrf.token)
            .send({ points: 10 });

        expect(res.statusCode).toBe(400);
    });
});

describe('POST /api/checkout — نقاط الولاء', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockOrderSave.mockResolvedValue(true);
    });

    function checkout(loyaltyPoints) {
        return request(app)
            .post('/api/checkout')
            .set('Cookie', [`user_token=${userToken()}`])
            .send({
                customerEmail: 'test@example.com',
                cartItems: [{ id: PRODUCT_ID, qty: 1 }],
                paymentGateway: 'jawwal_pay',
                paymentRef: 'ref-123',
                loyaltyPoints
            });
    }

    it('يخصم النقاط قبل إنشاء الطلب بنجاح', async () => {
        Product.find.mockResolvedValue([makeProduct()]);
        User.findOneAndUpdate.mockResolvedValue({ loyaltyPoints: 0 });

        const res = await checkout(10);

        expect(res.statusCode).toBe(201);
        expect(User.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ loyaltyPoints: { $gte: 10 } }),
            expect.anything(),
            expect.anything()
        );
    });

    it('يعيد النقاط (تعويض) عند فشل حفظ الطلب', async () => {
        Product.find.mockResolvedValue([makeProduct()]);
        User.findOneAndUpdate.mockResolvedValue({ loyaltyPoints: 0 });
        mockOrderSave.mockRejectedValueOnce(new Error('db down'));

        const res = await checkout(10);

        expect(res.statusCode).toBe(500);
        expect(User.updateOne).toHaveBeenCalledWith(
            expect.objectContaining({ _id: USER_ID }),
            expect.objectContaining({ $inc: { loyaltyPoints: 10 } })
        );
    });
});
