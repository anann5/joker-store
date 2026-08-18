// اختبارات مسار جلب منتج عام واحد (deep-link fallback):
//   GET /api/products/item/:productId في storeController
//   - يعيد المنتج النشط بصيغته العامة الآمنة
//   - يعيد 404 عند غياب المنتج أو كونه غير نشط
//   - يرفض معرّفاً غير صالح بـ 400

const request = require('supertest');
const express = require('express');

jest.mock('../models', () => ({
    Product: {
        findOne: jest.fn()
    },
    Order: {},
    Category: {},
    Promotion: {}
}));

jest.mock('../providers/registry', () => ({
    getProviders: jest.fn(() => []),
    getProvider: jest.fn(),
    getProvidersSafe: jest.fn()
}));

jest.mock('../providers/adapter', () => ({
    purchaseItem: jest.fn(),
    fetchCatalog: jest.fn(),
    fetchBalance: jest.fn()
}));

const { Product } = require('../models');
const storeController = require('../controllers/storeController');

const PRODUCT_ID = '507f191e810c19729de860ea';

function makeApp() {
    const app = express();
    app.get('/api/products/item/:productId', storeController.getProductItem);
    return app;
}

function makeActiveProduct() {
    return {
        _id: PRODUCT_ID,
        productName: { ar: 'شدات ببجي', en: 'PUBG UC' },
        description: { ar: 'وصف المنتج', en: 'Product description' },
        category: 'pubg',
        region: 'global',
        price: 50,
        image: '/image/pubg.png',
        isActive: true,
        isExternal: true,
        rating: 4.5,
        reviewsCount: 12
    };
}

describe('GET /api/products/item/:productId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('يعيد المنتج النشط بصيغته العامة (بدون حقول داخلية)', async () => {
        Product.findOne.mockResolvedValue(makeActiveProduct());

        const res = await request(makeApp()).get(`/api/products/item/${PRODUCT_ID}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Product.findOne).toHaveBeenCalledWith({ _id: PRODUCT_ID, isActive: true });
        expect(res.body.product).toEqual(expect.objectContaining({
            _id: PRODUCT_ID,
            category: 'pubg',
            price: 50,
            rating: 4.5,
            reviewsCount: 12
        }));
        expect(res.body.product.productName).toEqual({ ar: 'شدات ببجي', en: 'PUBG UC' });
        // لا تكشف حقولاً داخلية (كأكواد المخزون مثلاً)
        expect(res.body.product.codes).toBeUndefined();
    });

    it('يعيد 404 عندما يكون المنتج غير موجود', async () => {
        Product.findOne.mockResolvedValue(null);

        const res = await request(makeApp()).get(`/api/products/item/${PRODUCT_ID}`);

        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
    });

    it('يرفض معرّفاً غير صالح بـ 400', async () => {
        const res = await request(makeApp()).get('/api/products/item/not-a-valid-id');

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });
});
