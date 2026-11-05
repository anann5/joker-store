// اختبارات قسم IPTV والاشتراكات في لوحة الأدمن:
//   - قبول الفئة iptv وإنشاء صف القسم تلقائياً عند أول منتج
//   - عدم تكرار إنشاء القسم إذا كان موجوداً
//   - حفظ حقول الاشتراك (النوع + المدة) على المنتج

const request = require('supertest');
const express = require('express');

const mockProductSave = jest.fn().mockResolvedValue(true);
const MockProduct = jest.fn().mockImplementation(cfg => ({
    ...cfg,
    _id: '507f191e810c19729de860ea',
    save: mockProductSave
}));

jest.mock('../models', () => ({
    Product: MockProduct,
    Category: {
        findOne: jest.fn(),
        create: jest.fn().mockResolvedValue({ _id: '507f191e810c19729de860eb' })
    }
}));

jest.mock('../controllers/helpers', () => ({
    createLog: jest.fn().mockResolvedValue(true)
}));

jest.mock('../controllers/storeController', () => ({
    clearStorefrontCache: jest.fn()
}));

jest.mock('../providers/sync', () => ({}));

jest.mock('../providers/currency', () => ({
    STORE_CURRENCY: 'ILS'
}));

jest.mock('../providers/pricing', () => ({
    normalizeMargin: jest.fn(() => 1.10),
    computeSellingPrice: jest.fn()
}));

jest.mock('../providers/fxPricing', () => ({
    normalizeCurrencyCode: jest.fn(value => String(value || 'USD').toUpperCase()),
    computeIlsPrice: jest.fn(),
    getRateToIls: jest.fn()
}));

jest.mock('../controllers/push', () => ({
    notifyNewProduct: jest.fn()
}));

const { Category } = require('../models');
const { clearStorefrontCache } = require('../controllers/storeController');
const productController = require('../controllers/productController');

const app = express();
app.use(express.json());
app.post('/api/admin/inventory/add-manual', productController.createProductWithManualCodes);

function addManual(body = {}) {
    return request(app)
        .post('/api/admin/inventory/add-manual')
        .send({
            productName: { ar: 'IPTV 12 شهر', en: 'IPTV 12 Months' },
            category: 'iptv',
            price: 120,
            autoPrice: false,
            manualCodes: ['IPTV-AAAA-1111', 'IPTV-BBBB-2222'],
            isSubscription: true,
            subscriptionType: 'fixed',
            subscriptionDuration: 12,
            ...body
        });
}

describe('قسم IPTV والاشتراكات', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockProductSave.mockResolvedValue(true);
        Category.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
        Category.create.mockResolvedValue({ _id: '507f191e810c19729de860eb' });
    });

    it('يقبل الفئة iptv ويُنشئ صف القسم تلقائياً بالصورة الافتراضية', async () => {
        const res = await addManual();

        expect(res.statusCode).toBe(201);
        expect(res.body.product.category).toBe('iptv');

        expect(Category.findOne).toHaveBeenCalledWith({ key: 'iptv' });
        expect(Category.create).toHaveBeenCalledWith(expect.objectContaining({
            key: 'iptv',
            title: { ar: 'IPTV', en: 'IPTV' },
            image: 'image/iptv.svg',
            isActive: true
        }));
        expect(clearStorefrontCache).toHaveBeenCalled();
    });

    it('لا يُنشئ القسم مرة أخرى إذا كان موجوداً', async () => {
        Category.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'existing' }) });

        const res = await addManual();

        expect(res.statusCode).toBe(201);
        expect(Category.create).not.toHaveBeenCalled();
    });

    it('يحفظ نوع الاشتراك ومدته على المنتج', async () => {
        const res = await addManual({ subscriptionType: 'recurring', subscriptionDuration: 3 });

        expect(res.statusCode).toBe(201);
        const saved = MockProduct.mock.calls[0][0];
        expect(saved.isSubscription).toBe(true);
        expect(saved.subscriptionType).toBe('recurring');
        expect(saved.subscriptionDuration).toBe(3);
        expect(saved.codes).toHaveLength(2);
        expect(res.body.product.isSubscription).toBe(true);
    });

    it('ينجح إنشاء المنتج حتى لو تعذّر إنشاء صف القسم', async () => {
        Category.create.mockRejectedValue(new Error('db down'));

        const res = await addManual();

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
    });
});
