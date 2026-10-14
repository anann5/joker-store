// اختبارات حماية هامش الربح عند تنفيذ الطلب (approveOrder في orderController):
//   - يوقف التنفيذ آلياً عندما ينخفض (سعر البيع / التكلفة) دون MIN_PROFIT_RATIO
//   - يحوّل الطلب للحالة failed ويُرسل تنبيهاً تيليغرامياً
//   - المسار السليم للمنتجات المحلية يكتمل ويُرسل إشعار التأكيد

const request = require('supertest');
const express = require('express');

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

const { Product, Order } = require('../models');
const { sendTelegramAlert, createLog } = require('../controllers/helpers');
const { sendOrderConfirmationEmail } = require('../controllers/notification');
const registry = require('../providers/registry');
const adapter = require('../providers/adapter');
const orderController = require('../controllers/orderController');

const PRODUCT_ID = '507f191e810c19729de860ea';

const app = express();
app.use(express.json());
app.post('/api/admin/orders/:orderId/approve', orderController.approveOrder);

function makeOrder(items) {
    return {
        orderId: 'T100',
        productName: 'منتج تجريبي',
        buyerEmail: 'test@example.com',
        status: 'processing',
        items,
        price: 20,
        code: null,
        deliveredCodes: [],
        costPrice: 0,
        completedAt: null,
        failedAt: null,
        save: jest.fn().mockResolvedValue(true)
    };
}

function makeExternalItem() {
    return {
        productId: PRODUCT_ID,
        qty: 1,
        fulfilmentType: 'external',
        fulfilmentStatus: 'pending'
    };
}

describe('approveOrder — حماية هامش الربح', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('يوقف التنفيذ عند هبوط الهامش دون الحد ويرجع 502', async () => {
        const order = makeOrder([makeExternalItem()]);
        Order.findOneAndUpdate.mockResolvedValue(order);
        Product.findById.mockResolvedValue({
            _id: PRODUCT_ID,
            isActive: true,
            isExternal: true,
            basePrice: 10,
            price: 9,
            productName: { ar: 'ستيم 10', en: 'Steam 10' }
        });

        const res = await request(app).post('/api/admin/orders/T100/approve');

        expect(res.statusCode).toBe(502);
        expect(sendTelegramAlert).toHaveBeenCalledWith(expect.stringContaining('هامش ربح منخفض'));
        expect(order.status).toBe('failed');
        expect(order.items[0].fulfilmentStatus).toBe('failed');
        expect(order.save).toHaveBeenCalled();
        expect(createLog).toHaveBeenCalled();
        expect(Product.claimCodeAtomic).not.toHaveBeenCalled();
        expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
    });

    it('يكمل التنفيذ من المزود عندما يكون الهامش سليماً', async () => {
        const order = makeOrder([makeExternalItem()]);
        Order.findOneAndUpdate.mockResolvedValue(order);
        // نسبة 30/10 = 3.0 أكبر من الحد الافتراضي MIN_PROFIT_RATIO=1.0
        Product.findById.mockResolvedValue({
            _id: PRODUCT_ID,
            isActive: true,
            isExternal: true,
            basePrice: 10,
            price: 30,
            productName: { ar: 'ستيم 10', en: 'Steam 10' }
        });
        registry.getProvider.mockReturnValue({
            name: 'P1',
            purchaseUrl: 'https://p.test/buy',
            apiKey: 'test-key'
        });
        adapter.purchaseItem.mockResolvedValue({ codes: ['EXT-CODE-1'], costPrice: 10 });

        const product = {
            _id: PRODUCT_ID,
            isActive: true,
            isExternal: true,
            basePrice: 10,
            price: 30,
            currentProvider: 'P1',
            externalId: 'ext-1',
            productName: { ar: 'ستيم 10', en: 'Steam 10' }
        };
        Product.findById.mockResolvedValue(product);

        const res = await request(app).post('/api/admin/orders/T100/approve');

        expect(res.statusCode).toBe(200);
        expect(order.status).toBe('completed');
        expect(order.deliveredCodes).toEqual(['EXT-CODE-1']);
        expect(order.items[0].costPrice).toBe(10);
        expect(sendOrderConfirmationEmail).toHaveBeenCalled();
        expect(sendTelegramAlert).not.toHaveBeenCalledWith(expect.stringContaining('هامش ربح منخفض'));
    });

    it('المنتج المحلي يكتمل بنجاح ويرسل إشعار التأكيد', async () => {
        const order = makeOrder([{
            productId: PRODUCT_ID,
            qty: 1,
            fulfilmentType: 'local',
            fulfilmentStatus: 'pending'
        }]);
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

        const res = await request(app).post('/api/admin/orders/T100/approve');

        expect(res.statusCode).toBe(200);
        expect(order.status).toBe('completed');
        expect(order.deliveredCodes).toEqual(['CODE-123']);
        expect(order.items[0].fulfilmentStatus).toBe('completed');
        expect(sendOrderConfirmationEmail).toHaveBeenCalled();
        expect(sendTelegramAlert).not.toHaveBeenCalled();
    });

    it('يرجع 404 عندما لا يوجد طلب بهذا المعرّف', async () => {
        Order.findOneAndUpdate.mockResolvedValue(null);
        Order.findOne.mockReturnValue({
            select: jest.fn().mockResolvedValue(null)
        });

        const res = await request(app).post('/api/admin/orders/UNKNOWN/approve');

        expect(res.statusCode).toBe(404);
    });
});