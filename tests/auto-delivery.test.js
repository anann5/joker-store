// اختبارات التسليم التلقائي (autoFulfilOrder) + الفاتورة (getInvoice):
//   - ينجز الطلب المعلّق (pending) آلياً فقط ويرفض الطلبات غير النظيفة
//   - الفاتورة تكشف الأكواد فقط عند اكتمال الطلب وبطرف المالك

const request = require('supertest');
const express = require('express');

jest.mock('../models', () => ({
    Product: {
        findById: jest.fn(),
        claimCodeAtomic: jest.fn()
    },
    Order: {
        findOne: jest.fn()
    }
}));

jest.mock('../controllers/helpers', () => ({
    createLog: jest.fn().mockResolvedValue(true),
    sendTelegramAlert: jest.fn().mockResolvedValue(true),
    getSafeBaseHost: jest.fn().mockReturnValue('http://localhost')
}));

jest.mock('../controllers/notification', () => ({
    sendOrderConfirmationEmail: jest.fn().mockResolvedValue(true)
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

const { Product, Order } = require('../models');
const { sendTelegramAlert } = require('../controllers/helpers');
const { sendOrderConfirmationEmail } = require('../controllers/notification');
const registry = require('../providers/registry');
const adapter = require('../providers/adapter');
const orderController = require('../controllers/orderController');
const storeController = require('../controllers/storeController');

const PRODUCT_ID = '507f191e810c19729de860ea';

const app = express();
app.use(express.json());
app.post('/api/internal/auto-fulfil/:orderId', (req, res) => {
    orderController.autoFulfilOrder(req.params.orderId, null)
        .then(() => res.json({ success: true }))
        .catch(err => res.status(500).json({ success: false, error: err.message }));
});
app.get('/api/invoice/:orderId', storeController.getInvoice);

function makeOrder(status = 'pending') {
    return {
        orderId: 'AUTO1',
        buyerEmail: 'buyer@example.com',
        status,
        items: [{
            productId: PRODUCT_ID,
            qty: 1,
            fulfilmentType: 'local',
            fulfilmentStatus: 'pending'
        }],
        price: 10,
        deliveredCodes: [],
        code: null,
        costPrice: 0,
        save: jest.fn().mockResolvedValue(true)
    };
}

describe('autoFulfilOrder — التسليم التلقائي', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('ينجز الطلب المعلّق (pending) آلياً من المخزون المحلي', async () => {
        const order = makeOrder('pending');
        Order.findOne.mockResolvedValue(order);
        Product.findById.mockResolvedValue({
            _id: PRODUCT_ID,
            isActive: true,
            isExternal: false,
            price: 10,
            basePrice: 0,
            profitMargin: 1.1,
            productName: { ar: 'منتج', en: 'Product' }
        });
        Product.claimCodeAtomic.mockResolvedValue('AUTO-CODE-1');

        const res = await request(app).post('/api/internal/auto-fulfil/AUTO1');

        expect(res.statusCode).toBe(200);
        expect(order.status).toBe('completed');
        expect(order.deliveredCodes).toEqual(['AUTO-CODE-1']);
        expect(sendOrderConfirmationEmail).toHaveBeenCalled();
    });

    it('يفشل بهدوء عندما يكون الطلب خارج حالة pending (لا تنفيذ مزدوج)', async () => {
        const order = makeOrder('processing');
        Order.findOne.mockResolvedValue(order);

        const res = await request(app).post('/api/internal/auto-fulfil/AUTO1');

        expect(res.statusCode).toBe(200);
        expect(order.save).not.toHaveBeenCalled();
        expect(Product.claimCodeAtomic).not.toHaveBeenCalled();
    });
});

describe('getInvoice — الفاتورة', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    function invoiceOrder(status) {
        return {
            orderId: 'INV1',
            status,
            price: 30,
            discount: 0,
            discountCode: null,
            buyerEmail: 'buyer@example.com',
            paymentGateway: 'stripe',
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