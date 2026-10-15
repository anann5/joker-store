const request = require('supertest');
const express = require('express');

const mockSave = jest.fn().mockResolvedValue(true);
let savedOrderData = null;

jest.mock('../models', () => {
    const OrderMock = jest.fn().mockImplementation((data) => {
        savedOrderData = data;
        return { ...data, save: mockSave };
    });
    OrderMock.findOne = jest.fn();
    OrderMock.find = jest.fn();
    OrderMock.updateOne = jest.fn().mockResolvedValue({});
    return {
        Product: { find: jest.fn(), findOne: jest.fn(), findById: jest.fn() },
        Order: OrderMock,
        Category: {},
        User: {},
        Promotion: {},
        StockAlert: { find: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateMany: jest.fn() },
        PushSubscription: { find: jest.fn(), findOne: jest.fn() }
    };
});

const storeRoutes = require('../routes/storeRoutes');

const app = express();
app.use(express.json());
app.use('/api', storeRoutes);

const PRODUCT_ID = '507f191e810c19729de860ea';

function makeProduct(overrides = {}) {
    return {
        _id: PRODUCT_ID,
        productName: { ar: 'بطاقة اختبار', en: 'Test card' },
        description: { ar: 'وصف', en: 'Description' },
        price: 10,
        isActive: true,
        isExternal: false,
        codes: [{ value: 'GIFT-CODE-1', status: 'available' }],
        category: 'pubg',
        region: 'global',
        ...overrides
    };
}

const { Product, Order } = require('../models');

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

beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockClear();
    savedOrderData = null;
});

describe('POST /api/checkout with gift', () => {
    it('stores gift fields + token and returns it', async () => {
        Product.find.mockResolvedValue([makeProduct()]);
        const res = await checkout({
            gift: { toName: 'Ahmad', toPhone: '0599123456', message: 'Enjoy!' }
        });
        expect(res.statusCode).toBe(201);
        expect(res.body.giftToken).toMatch(/^[0-9a-f-]{36}$/);
        expect(Order).toHaveBeenCalledTimes(1);
        expect(savedOrderData).toEqual(expect.objectContaining({
            isGift: true,
            giftToName: 'Ahmad',
            giftToPhone: '0599123456',
            giftMessage: 'Enjoy!'
        }));
        expect(savedOrderData.giftToken).toBe(res.body.giftToken);
    });

    it('creates a normal order without gift fields when gift omitted', async () => {
        Product.find.mockResolvedValue([makeProduct()]);
        const res = await checkout();
        expect(res.statusCode).toBe(201);
        expect(res.body.giftToken).toBeUndefined();
        expect(savedOrderData.isGift).toBe(false);
        expect(savedOrderData.giftToken).toBeNull();
    });

    it('treats an empty gift object as no gift', async () => {
        Product.find.mockResolvedValue([makeProduct()]);
        const res = await checkout({ gift: { toName: '', toPhone: '', message: '' } });
        expect(res.statusCode).toBe(201);
        expect(res.body.giftToken).toBeUndefined();
        expect(savedOrderData.isGift).toBe(false);
    });

    it('rejects an invalid recipient phone (400)', async () => {
        const res = await checkout({ gift: { toName: 'Ahmad', toPhone: 'abc!!' } });
        expect(res.statusCode).toBe(400);
        expect(Order).not.toHaveBeenCalled();
    });
});

describe('GET /api/gift/:token', () => {
    const TOKEN = '123e4567-e89b-12d3-a456-426614174000';

    function mockOrder(order) {
        Order.findOne.mockReturnValue({ select: () => ({ lean: async () => order }) });
    }

    it('reveals codes for completed gift orders without leaking buyer data', async () => {
        mockOrder({
            _id: 'o1',
            giftToken: TOKEN,
            status: 'completed',
            productName: 'Test card',
            items: [{ name: { ar: 'x', en: 'y' }, qty: 1 }],
            giftToName: 'Ahmad',
            giftMessage: 'Enjoy!',
            deliveredCodes: ['CODE-1', 'CODE-2'],
            buyerEmail: 'buyer@example.com',
            price: 99
        });
        const res = await request(app).get(`/api/gift/${TOKEN}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.gift.codes).toEqual(['CODE-1', 'CODE-2']);
        expect(res.body.gift.completed).toBe(true);
        const raw = JSON.stringify(res.body);
        expect(raw).not.toContain('buyer@example.com');
        expect(raw).not.toContain('99');
    });

    it('hides codes while the order is pending', async () => {
        mockOrder({
            _id: 'o2',
            giftToken: TOKEN,
            status: 'pending',
            productName: 'Test card',
            items: [],
            giftToName: null,
            giftMessage: null,
            deliveredCodes: ['CODE-1']
        });
        const res = await request(app).get(`/api/gift/${TOKEN}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.gift.codes).toEqual([]);
        expect(res.body.gift.completed).toBe(false);
    });

    it('returns 404 for malformed tokens', async () => {
        const res = await request(app).get('/api/gift/not-a-token');
        expect(res.statusCode).toBe(404);
    });

    it('returns 404 for unknown tokens', async () => {
        mockOrder(null);
        const res = await request(app).get(`/api/gift/${TOKEN}`);
        expect(res.statusCode).toBe(404);
    });
});
