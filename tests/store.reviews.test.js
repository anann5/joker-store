// اختبارات المراجعات/التقييمات في واجهة المتجر:
//   POST /products/:productId/review — إرسال تقييم وإعادة حساب المعدل
//   GET  /products/:productId/reviews — جلب أحدث التقييمات
// تُستدعى الوظائف مباشرة (بدون وسائط المصادقة) لتركيز الاختبار على المنطق.

const request = require('supertest');
const express = require('express');

jest.mock('../models', () => ({
    Product: {
        findById: jest.fn(),
        find: jest.fn()
    },
    Order: {},
    Category: {}
}));

const storeController = require('../controllers/storeController');

const PRODUCT_ID = '507f191e810c19729de860ea';

const app = express();
app.use(express.json());
app.post('/api/products/:productId/review', storeController.submitProductReview);
app.get('/api/products/:productId/reviews', storeController.getProductReviews);

function makeProduct(overrides = {}) {
    return {
        _id: PRODUCT_ID,
        productName: { ar: 'منتج وهمي', en: 'Fake Product' },
        description: { ar: 'وصف', en: 'Description' },
        price: 10,
        image: '',
        isExternal: false,
        isActive: true,
        category: 'pubg',
        region: 'global',
        rating: 0,
        reviewsCount: 0,
        reviews: [],
        save: jest.fn().mockResolvedValue(true),
        ...overrides
    };
}

describe('POST /api/products/:productId/review', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('يحفظ التقييم ويعيد حساب المعدل وعدد المراجعات', async () => {
        const product = makeProduct({
            rating: 5,
            reviewsCount: 1,
            reviews: [{ rating: 5, comment: 'قديم', reviewerEmail: null }]
        });
        require('../models').Product.findById.mockResolvedValue(product);

        const res = await request(app)
            .post(`/api/products/${PRODUCT_ID}/review`)
            .send({ rating: 4, comment: 'ممتاز' });

        expect(res.statusCode).toBe(201);
        expect(res.body).toEqual(expect.objectContaining({
            success: true,
            rating: 4.5,
            reviewsCount: 2
        }));
        expect(product.reviews).toHaveLength(2);
        expect(product.reviews[1]).toEqual(expect.objectContaining({ rating: 4, comment: 'ممتاز' }));
        expect(product.save).toHaveBeenCalledTimes(1);
    });

    it('يرفض تقييماً خارج النطاق 1-5 أو معرفاً غير صالح', async () => {
        let res = await request(app)
            .post(`/api/products/${PRODUCT_ID}/review`)
            .send({ rating: 9 });
        expect(res.statusCode).toBe(400);

        res = await request(app)
            .post('/api/products/not-a-valid-id/review')
            .send({ rating: 5 });
        expect(res.statusCode).toBe(400);

        expect(require('../models').Product.findById).not.toHaveBeenCalled();
    });

    it('يرفض تعليقاً قصيراً جداً', async () => {
        const res = await request(app)
            .post(`/api/products/${PRODUCT_ID}/review`)
            .send({ rating: 5, comment: 'أب' });

        expect(res.statusCode).toBe(400);
        expect(require('../models').Product.findById).not.toHaveBeenCalled();
    });

    it('يرجع 404 لمنتج غير موجود أو غير نشط', async () => {
        require('../models').Product.findById.mockResolvedValue(null);
        let res = await request(app)
            .post(`/api/products/${PRODUCT_ID}/review`)
            .send({ rating: 5, comment: 'تقييم' });
        expect(res.statusCode).toBe(404);

        require('../models').Product.findById.mockResolvedValue(makeProduct({ isActive: false }));
        res = await request(app)
            .post(`/api/products/${PRODUCT_ID}/review`)
            .send({ rating: 5, comment: 'تقييم' });
        expect(res.statusCode).toBe(404);
    });
});

describe('GET /api/products/:productId/reviews', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('يعيد التقييمات الأحدث أولاً مع المعدل والعدد', async () => {
        require('../models').Product.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue({
                _id: PRODUCT_ID,
                rating: 4,
                reviewsCount: 2,
                reviews: [
                    { rating: 3, comment: 'أول', reviewerEmail: 'a@test.com', createdAt: new Date() },
                    { rating: 5, comment: 'ثاني', reviewerEmail: null, createdAt: new Date() }
                ]
            })
        });

        const res = await request(app).get(`/api/products/${PRODUCT_ID}/reviews`);

        expect(res.statusCode).toBe(200);
        expect(res.body.rating).toBe(4);
        expect(res.body.reviewsCount).toBe(2);
        expect(res.body.reviews).toHaveLength(2);
        expect(res.body.reviews[0].rating).toBe(5);
        expect(res.body.reviews[1].rating).toBe(3);
    });

    it('يرجع 400 لمعرف غير صالح و404 لمنتج غير موجود', async () => {
        let res = await request(app).get('/api/products/bad-id/reviews');
        expect(res.statusCode).toBe(400);

        require('../models').Product.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue(null)
        });
        res = await request(app).get(`/api/products/${PRODUCT_ID}/reviews`);
        expect(res.statusCode).toBe(404);
    });
});