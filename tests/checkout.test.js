const request = require('supertest');
const express = require('express');
const storeRoutes = require('../routes/storeRoutes');
const { Product, Order } = require('../models');

const mockSave = jest.fn().mockResolvedValue(true);

jest.mock('../models', () => ({
    Product: {
        find: jest.fn()
    },
    Order: jest.fn().mockImplementation(() => ({
        save: mockSave
    })),
    Category: {}
}));

const app = express();
app.use(express.json());
app.use('/api', storeRoutes);

const PRODUCT_ID = '507f191e810c19729de860ea';
const SECOND_PRODUCT_ID = '507f191e810c19729de860eb';

function makeProduct(overrides = {}) {
    return {
        _id: PRODUCT_ID,
        productName: { ar: 'منتج وهمي', en: 'Fake Product' },
        description: { ar: 'وصف', en: 'Description' },
        price: 10,
        isActive: true,
        isExternal: false,
        codes: [{ value: 'SAFE-TEST-CODE', status: 'available' }],
        category: 'pubg',
        region: 'global',
        ...overrides
    };
}

function checkout(cartItems = [{ id: PRODUCT_ID, qty: 1 }]) {
    return request(app)
        .post('/api/checkout')
        .send({
            customerEmail: 'test@example.com',
            cartItems,
            paymentGateway: 'jawwal_pay',
            paymentRef: 'test-reference-123'
        });
}

describe('public product APIs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSave.mockClear();
    });

    it('does not expose inventory or supplier fields', async () => {
        Product.find.mockResolvedValue([makeProduct({
            codes: [{ value: 'SECRET-CODE', status: 'available' }],
            basePrice: 4,
            externalId: 'provider-product-id',
            profitMargin: 1.5,
            currentProvider: 'SMM_Global'
        })]);

        const res = await request(app).get('/api/products/pubg');

        expect(res.statusCode).toBe(200);
        expect(res.body.products[0]).toEqual(expect.objectContaining({
            _id: PRODUCT_ID,
            productName: { ar: 'منتج وهمي', en: 'Fake Product' },
            price: 10
        }));
        expect(res.body.products[0]).not.toHaveProperty('codes');
        expect(res.body.products[0]).not.toHaveProperty('basePrice');
        expect(res.body.products[0]).not.toHaveProperty('externalId');
        expect(res.body.products[0]).not.toHaveProperty('profitMargin');
        expect(res.body.products[0]).not.toHaveProperty('currentProvider');
    });
});

describe('POST /api/checkout', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSave.mockClear();
    });

    it('creates a server-side multi-item order snapshot', async () => {
        const firstProduct = makeProduct();
        const secondProduct = makeProduct({
            _id: SECOND_PRODUCT_ID,
            productName: { ar: 'منتج ثان', en: 'Second product' },
            price: 15,
            isExternal: true,
            codes: []
        });
        Product.find.mockResolvedValue([firstProduct, secondProduct]);

        const res = await checkout([
            { id: PRODUCT_ID, qty: 1 },
            { id: SECOND_PRODUCT_ID, qty: 2 }
        ]);

        expect(res.statusCode).toBe(201);
        expect(res.body).toEqual(expect.objectContaining({
            success: true,
            message: 'تم استلام طلبك بنجاح.',
            orderId: expect.any(String)
        }));
        expect(Order).toHaveBeenCalledTimes(1);
        expect(Order.mock.calls[0][0]).toEqual(expect.objectContaining({
            productName: 'منتج وهمي، منتج ثان',
            price: 40,
            items: [
                expect.objectContaining({
                    productId: PRODUCT_ID,
                    unitPrice: 10,
                    price: 10,
                    fulfilmentType: 'local'
                }),
                expect.objectContaining({
                    productId: SECOND_PRODUCT_ID,
                    unitPrice: 15,
                    price: 30,
                    fulfilmentType: 'external'
                })
            ]
        }));
        expect(mockSave).toHaveBeenCalledTimes(1);
    });

    it('rejects a missing or inactive requested product', async () => {
        Product.find.mockResolvedValue([]);
        let res = await checkout();
        expect(res.statusCode).toBe(400);
        expect(Order).not.toHaveBeenCalled();

        Product.find.mockResolvedValue([makeProduct({ isActive: false })]);
        res = await checkout();
        expect(res.statusCode).toBe(400);
        expect(Order).not.toHaveBeenCalled();
    });

    it('rejects duplicate cart items before creating an order', async () => {
        const res = await checkout([
            { id: PRODUCT_ID, qty: 1 },
            { id: PRODUCT_ID, qty: 1 }
        ]);

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(Product.find).not.toHaveBeenCalled();
        expect(Order).not.toHaveBeenCalled();
    });

    it('rejects a local product with insufficient available codes', async () => {
        Product.find.mockResolvedValue([makeProduct({ codes: [] })]);

        const res = await checkout();

        expect(res.statusCode).toBe(409);
        expect(Order).not.toHaveBeenCalled();
    });
});
