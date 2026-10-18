// اختبارات الفاتورة (getInvoice):
//   - لا تكشف الأكواد إلا لصاحب الطلب وعند اكتمال الطلب فقط

const request = require('supertest');
const express = require('express');

jest.mock('../models', () => ({
    Product: {},
    Order: { findOne: jest.fn() }
}));

jest.mock('../controllers/helpers', () => ({
    createLog: jest.fn().mockResolvedValue(true),
    sendTelegramAlert: jest.fn().mockResolvedValue(true),
    getSafeBaseHost: jest.fn().mockReturnValue('http://localhost')
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

const { Order } = require('../models');
const storeController = require('../controllers/storeController');

const app = express();
app.get('/api/invoice/:orderId', storeController.getInvoice);

function invoiceOrder(status) {
    return {
        orderId: 'INV1',
        status,
        price: 30,
        discount: 0,
        discountCode: null,
        buyerEmail: 'buyer@example.com',
        paymentGateway: 'jawwal_pay',
        createdAt: new Date(),
        completedAt: status === 'completed' ? new Date() : null,
        items: [{
            name: { ar: 'منتج', en: 'Product' },
            qty: '1',
            unitPrice: 30,
            price: 30,
            fulfilmentStatus: 'completed'
        }],
        code: 'SECRET-CODE',
        deliveredCodes: ['SECRET-CODE']
    };
}

describe('getInvoice — الفاتورة', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('يرفض الوصول بدون بريد أو بريد غير صالح', async () => {
        const res = await request(app).get('/api/invoice/INV1').query({ email: 'not-an-email' });
        expect(res.statusCode).toBe(400);
    });

    it('لا يكشف الأكواد ما دام الطلب غير مكتمل', async () => {
        Order.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(invoiceOrder('processing')) });
        const res = await request(app).get('/api/invoice/INV1').query({ email: 'buyer@example.com' });
        expect(res.statusCode).toBe(200);
        expect(res.body.invoice.codes).toEqual([]);
    });

    it('يكشف الأكواد فقط للمالك عند الاكتمال ويحسب الإجمالي الفرعي', async () => {
        Order.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(invoiceOrder('completed')) });
        const res = await request(app).get('/api/invoice/INV1').query({ email: 'buyer@example.com' });
        expect(res.statusCode).toBe(200);
        expect(res.body.invoice.codes).toEqual(['SECRET-CODE']);
        expect(res.body.invoice.items[0].name).toBe('منتج');
    });

    it('يعيد 404 عند عدم تطابق الطلب مع البريد', async () => {
        Order.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
        const res = await request(app).get('/api/invoice/INV1').query({ email: 'other@example.com' });
        expect(res.statusCode).toBe(404);
    });
});
