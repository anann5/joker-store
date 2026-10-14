const request = require('supertest');
const express = require('express');
const storeRoutes = require('../routes/storeRoutes');
const promo = require('../controllers/promo');
const { Order } = require('../models');

const mockPromotionFindOne = jest.fn();
const mockProductFindOne = jest.fn();
const mockProductFind = jest.fn();
const mockOrderSave = jest.fn().mockResolvedValue(true);

jest.mock('../models', () => ({
    Promotion: { findOne: (...args) => mockPromotionFindOne(...args) },
    Product: {
        findOne: (...args) => mockProductFindOne(...args),
        find: (...args) => mockProductFind(...args)
    },
    Order: jest.fn().mockImplementation((data) => ({ ...data, save: mockOrderSave })),
    User: {},
    Category: {}
}));

const app = express();
app.use(express.json());
app.use('/api', storeRoutes);

const PRODUCT_ID = '507f191e810c19729de860ea';
const OTHER_PRODUCT_ID = '507f191e810c19729de860eb';

function makePromotion(overrides = {}) {
    return {
        code: 'JOKER10',
        discountPercent: 10,
        productId: PRODUCT_ID,
        category: null,
        expiresAt: new Date(Date.now() + 86400000),
        isActive: true,
        ...overrides
    };
}

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

describe('applyPromoCode (unit)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns invalid for a malformed code without querying the DB', async () => {
        const result = await promo.applyPromoCode({ code: 'a!', productId: PRODUCT_ID });
        expect(result).toEqual({ ok: false, error: 'invalid' });
        expect(mockPromotionFindOne).not.toHaveBeenCalled();
    });

    it('returns invalid when no active promo matches the code', async () => {
        mockPromotionFindOne.mockResolvedValue(null);
        const result = await promo.applyPromoCode({ code: 'JOKER10', productId: PRODUCT_ID });
        expect(result).toEqual({ ok: false, error: 'invalid' });
    });

    it('returns invalid for an expired promo (no active match found)', async () => {
        mockPromotionFindOne.mockResolvedValue(null);
        const result = await promo.applyPromoCodeToProductIds({ code: 'EXPIRED1', productIds: [PRODUCT_ID] });
        expect(result).toEqual({ ok: false, error: 'invalid' });
        expect(mockPromotionFindOne).toHaveBeenCalledWith({
            code: 'EXPIRED1',
            isActive: true,
            expiresAt: { $gt: expect.any(Date) }
        });
        expect(mockProductFind).not.toHaveBeenCalled();
    });

    it('applyPromoCodeToProducts rejects when not every product matches', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion());
        const result = await promo.applyPromoCodeToProducts({
            code: 'JOKER10',
            products: [makeProduct(), makeProduct({ _id: OTHER_PRODUCT_ID })]
        });
        expect(result).toEqual({ ok: false, error: 'not_applicable' });
    });

    it('applyPromoCodeToProducts accepts when every product matches', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion({ productId: null, category: 'pubg' }));
        const result = await promo.applyPromoCodeToProducts({
            code: 'JOKER10',
            products: [makeProduct(), makeProduct({ _id: '507f191e810c19729de860ec' })]
        });
        expect(result).toEqual({ ok: true, discountPercent: 10 });
    });

    it('normalizes code to uppercase and queries with future-expiry filter', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion());
        mockProductFindOne.mockResolvedValue(makeProduct());

        await promo.applyPromoCode({ code: '   joker10 ', productId: PRODUCT_ID });

        expect(mockPromotionFindOne).toHaveBeenCalledWith({
            code: 'JOKER10',
            isActive: true,
            expiresAt: { $gt: expect.any(Date) }
        });
    });

    it('returns not_applicable when the target product does not match', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion());
        mockProductFindOne.mockResolvedValue(makeProduct({ _id: OTHER_PRODUCT_ID }));
        const result = await promo.applyPromoCode({ code: 'JOKER10', productId: OTHER_PRODUCT_ID });
        expect(result).toEqual({ ok: false, error: 'not_applicable' });
    });

    it('applies a discount to a matching product', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion());
        mockProductFindOne.mockResolvedValue(makeProduct());
        const result = await promo.applyPromoCode({ code: 'JOKER10', productId: PRODUCT_ID });
        expect(result).toEqual({ ok: true, discountPercent: 10, finalUnitPrice: 9 });
    });

    it('matches by category when the promo targets a category', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion({ productId: null, category: 'pubg' }));
        mockProductFindOne.mockResolvedValue(makeProduct());
        const result = await promo.applyPromoCode({ code: 'JOKER10', productId: PRODUCT_ID });
        expect(result).toEqual({ ok: true, discountPercent: 10, finalUnitPrice: 9 });
    });
});

describe('POST /api/promotions/validate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns ok:true with the computed discount for a valid code', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion());
        mockProductFindOne.mockResolvedValue(makeProduct());

        const res = await request(app)
            .post('/api/promotions/validate')
            .send({ code: 'JOKER10', productId: PRODUCT_ID });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ ok: true, discountPercent: 10, finalUnitPrice: 9 });
    });

    it('returns ok:false with code invalid for an unknown code', async () => {
        mockPromotionFindOne.mockResolvedValue(null);

        const res = await request(app)
            .post('/api/promotions/validate')
            .send({ code: 'NOPE123', productId: PRODUCT_ID });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ ok: false, code: 'invalid' });
    });

    it('returns ok:false with code not_applicable for a non-matching product', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion());
        mockProductFindOne.mockResolvedValue(makeProduct({ _id: OTHER_PRODUCT_ID }));

        const res = await request(app)
            .post('/api/promotions/validate')
            .send({ code: 'JOKER10', productId: OTHER_PRODUCT_ID });

        expect(res.body).toEqual({ ok: false, code: 'not_applicable' });
    });

    it('validates an entire cart via productIds and rejects mixed carts', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion());
        const products = [
            makeProduct(),
            makeProduct({ _id: OTHER_PRODUCT_ID })
        ];
        mockProductFind.mockImplementation((query) => {
            const wanted = new Set((query?._id?.$in || []).map(String));
            return Promise.resolve(products.filter(p => wanted.has(String(p._id))));
        });

        const mixed = await request(app)
            .post('/api/promotions/validate')
            .send({ code: 'JOKER10', productIds: [PRODUCT_ID, OTHER_PRODUCT_ID] });
        expect(mixed.body).toEqual({ ok: false, code: 'not_applicable' });

        const allMatch = await request(app)
            .post('/api/promotions/validate')
            .send({ code: 'JOKER10', productIds: [PRODUCT_ID] });
        expect(allMatch.body).toEqual({ ok: true, discountPercent: 10 });
    });
});

describe('POST /api/checkout with promo code', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockOrderSave.mockClear();
    });

    it('applies a whole-order discount and stores discount fields on the order', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion());
        mockProductFindOne.mockResolvedValue(makeProduct());
        mockProductFind.mockResolvedValue([makeProduct()]);

        const res = await request(app)
            .post('/api/checkout')
            .send({
                customerEmail: 'test@example.com',
                cartItems: [{ id: PRODUCT_ID, qty: 1 }],
                paymentGateway: 'jawwal_pay',
                paymentRef: 'test-reference-123',
                promoCode: 'joker10'
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.total).toBe(9);
        expect(res.body.discount).toBe(1);
        expect(res.body.discountCode).toBe('JOKER10');

        expect(Order).toHaveBeenCalledTimes(1);
        expect(Order.mock.calls[0][0]).toEqual(expect.objectContaining({
            price: 9,
            discount: 1,
            discountCode: 'JOKER10',
            discountPercent: 10,
            items: [
                expect.objectContaining({ productId: PRODUCT_ID, unitPrice: 10, price: 10 })
            ]
        }));
    });

    it('rejects an order whose code does not apply to the cart items', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion());
        mockProductFind.mockResolvedValue([makeProduct({ _id: OTHER_PRODUCT_ID })]);

        const res = await request(app)
            .post('/api/checkout')
            .send({
                customerEmail: 'test@example.com',
                cartItems: [{ id: OTHER_PRODUCT_ID, qty: 1 }],
                paymentGateway: 'jawwal_pay',
                paymentRef: 'test-reference-123',
                promoCode: 'JOKER10'
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('رمز الخصم لا ينطبق على هذه المنتجات');
        expect(Order).not.toHaveBeenCalled();
    });

    it('rejects a mixed cart where only one product matches the promo', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion());
        mockProductFind.mockResolvedValue([
            makeProduct(),
            makeProduct({ _id: OTHER_PRODUCT_ID, price: 15 })
        ]);

        const res = await request(app)
            .post('/api/checkout')
            .send({
                customerEmail: 'test@example.com',
                cartItems: [
                    { id: PRODUCT_ID, qty: 1 },
                    { id: OTHER_PRODUCT_ID, qty: 1 }
                ],
                paymentGateway: 'jawwal_pay',
                paymentRef: 'test-reference-123',
                promoCode: 'JOKER10'
            });

        // لا ثغرة خصم المنتجات غير المشمولة — الطلب مرفوض تماماً برسالة واضحة
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('رمز الخصم لا ينطبق على هذه المنتجات');
        expect(Order).not.toHaveBeenCalled();
    });

    it('accepts the promo when every product in the cart matches (category promo)', async () => {
        mockPromotionFindOne.mockResolvedValue(makePromotion({ productId: null, category: 'pubg' }));
        mockProductFind.mockResolvedValue([
            makeProduct(),
            makeProduct({ _id: OTHER_PRODUCT_ID, price: 15, isExternal: true, codes: [] })
        ]);

        const res = await request(app)
            .post('/api/checkout')
            .send({
                customerEmail: 'test@example.com',
                cartItems: [
                    { id: PRODUCT_ID, qty: 1 },
                    { id: OTHER_PRODUCT_ID, qty: 2 }
                ],
                paymentGateway: 'jawwal_pay',
                paymentRef: 'test-reference-123',
                promoCode: 'JOKER10'
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.total).toBe(36); // (10 + 15*2) * 0.9
        expect(res.body.discount).toBe(4);
        expect(res.body.discountCode).toBe('JOKER10');
    });

    it('rejects an order with an unknown promo code before creating an order', async () => {
        mockPromotionFindOne.mockResolvedValue(null);

        const res = await request(app)
            .post('/api/checkout')
            .send({
                customerEmail: 'test@example.com',
                cartItems: [{ id: PRODUCT_ID, qty: 1 }],
                paymentGateway: 'jawwal_pay',
                paymentRef: 'test-reference-123',
                promoCode: 'FAKE99'
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('رمز الخصم غير صالح');
        expect(Order).not.toHaveBeenCalled();
    });

    it('does not attach discount when no promo code is sent', async () => {
        mockProductFind.mockResolvedValue([makeProduct()]);

        const res = await request(app)
            .post('/api/checkout')
            .send({
                customerEmail: 'test@example.com',
                cartItems: [{ id: PRODUCT_ID, qty: 1 }],
                paymentGateway: 'jawwal_pay',
                paymentRef: 'test-reference-123'
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.total).toBe(10);
        expect(res.body.discount).toBe(0);
        expect(res.body.discountCode).toBeNull();
    });
});