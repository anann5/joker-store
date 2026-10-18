// اختبارات خصوصية تتبع الطلب (trackOrder):
//   - البحث بالبريد وحده لا يكشف رقم الطلب الكامل ولا الأكواد
//   - كشف الأكواد ورقم الطلب الكامل يتطلّب تطابق البريد + رقم الطلب

const request = require('supertest');
const express = require('express');

function makeQuery(docs) {
    return {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(docs)
    };
}

jest.mock('../models', () => ({
    Product: {},
    Category: {},
    Promotion: {},
    Order: { find: jest.fn() }
}));

jest.mock('../controllers/notification', () => ({
    sendOrderConfirmationEmail: jest.fn(),
    sendOrderRejectedEmail: jest.fn()
}));

jest.mock('../controllers/push', () => ({
    notifyOrderStatus: jest.fn(),
    notifyNewOrder: jest.fn()
}));

const { Order } = require('../models');
const storeController = require('../controllers/storeController');

const app = express();
app.use(express.json());
app.post('/api/track-order', storeController.trackOrder);

function completedOrder() {
    return {
        orderId: 'ABCD1234',
        status: 'completed',
        price: 30,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        completedAt: new Date('2026-01-01T00:05:00Z'),
        items: [{ name: { ar: 'منتج', en: 'Product' }, qty: 1 }],
        code: 'SECRET-CODE',
        deliveredCodes: ['SECRET-CODE']
    };
}

describe('trackOrder — خصوصية الأكواد', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('لا يكشف رقم الطلب أو الأكواد عند البحث بالبريد وحده', async () => {
        Order.find.mockReturnValue(makeQuery([completedOrder()]));

        const res = await request(app).post('/api/track-order').send({ email: 'buyer@example.com' });

        expect(res.statusCode).toBe(200);
        expect(res.body.orders[0].masked).toBe(true);
        expect(res.body.orders[0].orderId).not.toBe('ABCD1234');
        expect(res.body.orders[0].orderId).toMatch(/•+34$/);
        expect(res.body.orders[0].codes).toEqual([]);
    });

    it('يكشف الأكواد ورقم الطلب الكامل عند تطابق البريد ورقم الطلب', async () => {
        Order.find.mockReturnValue(makeQuery([completedOrder()]));

        const res = await request(app).post('/api/track-order').send({ email: 'buyer@example.com', orderId: 'abcd1234' });

        expect(res.statusCode).toBe(200);
        expect(res.body.orders[0].orderId).toBe('ABCD1234');
        expect(res.body.orders[0].masked).toBe(false);
        expect(res.body.orders[0].codes).toEqual(['SECRET-CODE']);
    });
});
