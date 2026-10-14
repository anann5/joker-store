// اختبارات قسم "قالوا عنا": GET /api/testimonials
// يُستدعى المنتج مباشرة (واجهة) مع محاكاة Product.find لتركيز الاختبار على المنطق:
//   - إرجاع تقييمات المنتجات التي لديها مراجعات فقط
//   - استبعاد المنتجات دون مراجعات
//   - عدم تسريب reviewerEmail نهائياً
//   - الحالة الفارغة (نجاح مع قائمة فارغة)
//   - استبعاد مراجعات دون `createdAt` صالح (لا تلفيق للتاريخ)

const request = require('supertest');
const express = require('express');

jest.mock('../models', () => ({
    Product: {
        find: jest.fn()
    },
    Order: {},
    Category: {},
    Promotion: {}
}));

const storeController = require('../controllers/storeController');

const app = express();
app.get('/api/testimonials', storeController.getTestimonials);

function makeProduct(overrides = {}) {
    return {
        productName: { ar: 'منتج وهمي', en: 'Fake Product' },
        reviews: [],
        ...overrides
    };
}

function makeReview(overrides = {}) {
    return {
        rating: 5,
        comment: 'تجربة ممتازة',
        reviewerEmail: 'should-not-leak@test.com',
        verified: true,
        createdAt: new Date('2026-08-01T10:00:00Z'),
        ...overrides
    };
}

function mockProductFind(products) {
    require('../models').Product.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(products)
        })
    });
}

describe('GET /api/testimonials', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('يعيد التقييمات الأحدث أولاً من المنتجات التي لديها مراجعات فقط', async () => {
        mockProductFind([
            makeProduct({
                productName: { ar: 'منتج قديم', en: 'Old Product' },
                reviews: [
                    makeReview({ rating: 4, comment: 'مراجعة قديمة', createdAt: new Date('2026-07-01T10:00:00Z') })
                ]
            }),
            makeProduct({
                productName: { ar: 'منتج بدون مراجعات', en: 'No Reviews Product' },
                reviews: []
            }), // بلا مراجعات → مستبعد
            makeProduct({
                productName: { ar: 'منتج حديث', en: 'New Product' },
                reviews: [
                    makeReview({ rating: 3, comment: '', createdAt: new Date('2026-08-05T10:00:00Z') }),
                    makeReview({ rating: 5, comment: 'الأحدث', createdAt: new Date('2026-08-10T10:00:00Z') })
                ]
            })
        ]);

        const res = await request(app).get('/api/testimonials');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.testimonials).toHaveLength(3);

        // الترتيب تنازلي حسب التاريخ
        const dates = res.body.testimonials.map(t => new Date(t.createdAt).getTime());
        expect(dates).toEqual([...dates].sort((a, b) => b - a));

        // يتضمن مراجعات من المنتجات التي لديها مراجعات فقط
        expect(res.body.testimonials).toEqual(expect.arrayContaining([
            expect.objectContaining({ productName: { ar: 'منتج حديث', en: 'New Product' }, rating: 5, comment: 'الأحدث' })
        ]));
        // المنتج بدون مراجعات لا يظهر إطلاقاً
        const fromEmptyProduct = res.body.testimonials.some(t => t.productName.ar === 'منتج بدون مراجعات');
        expect(fromEmptyProduct).toBe(false);
    });

    it('لا يكشف reviewerEmail إطلاقاً في الاستجابة', async () => {
        mockProductFind([
            makeProduct({
                productName: { ar: 'منتج بحسابات بريد', en: 'Email Product' },
                reviews: [
                    makeReview({ reviewerEmail: 'secret-user@test.com' }),
                    makeReview({ reviewerEmail: 'another-secret@test.com', rating: 4 })
                ]
            })
        ]);

        const res = await request(app).get('/api/testimonials');

        expect(res.statusCode).toBe(200);
        expect(res.body.testimonials).toHaveLength(2);
        expect(JSON.stringify(res.body)).not.toContain('@test.com');
        expect(JSON.stringify(res.body)).not.toContain('reviewerEmail');
        res.body.testimonials.forEach(t => {
            expect(t).not.toHaveProperty('reviewerEmail');
        });
    });

    it('يستبعد المراجعات التي تفتقر إلى createdAt صالح ولا يلفق تاريخاً', async () => {
        mockProductFind([
            makeProduct({
                productName: { ar: 'منتج مختلط', en: 'Mixed Product' },
                reviews: [
                    makeReview({ rating: 5, comment: 'بدون تاريخ', createdAt: undefined }),
                    makeReview({ rating: 4, comment: 'تاريخ فارغ', createdAt: null }),
                    makeReview({ rating: 3, comment: 'تاريخ غير صالح', createdAt: 'not-a-date' }),
                    makeReview({ rating: 5, comment: 'موثّقة بتاريخ', createdAt: new Date('2026-08-08T10:00:00Z') })
                ]
            })
        ]);

        const res = await request(app).get('/api/testimonials');

        expect(res.statusCode).toBe(200);
        expect(res.body.testimonials).toHaveLength(1);
        expect(res.body.testimonials[0]).toMatchObject({
            comment: 'موثّقة بتاريخ',
            rating: 5,
            createdAt: expect.any(String)
        });
    });

    it('يستبعد المراجعات خارج نطاق التقييم 1-5', async () => {
        mockProductFind([
            makeProduct({
                productName: { ar: 'منتج بتقييمات شاذة', en: 'Odd Ratings' },
                reviews: [
                    makeReview({ rating: 0 }),
                    makeReview({ rating: 6 }),
                    makeReview({ rating: 4, comment: 'مقبولة' })
                ]
            })
        ]);

        const res = await request(app).get('/api/testimonials');

        expect(res.body.testimonials).toHaveLength(1);
        expect(res.body.testimonials[0].rating).toBe(4);
    });

    it('يحد عدد النتائج بعشرة كحد أقصى (الأحدث أولاً)', async () => {
        const many = Array.from({ length: 14 }, (_, i) =>
            makeProduct({
                productName: { ar: `منتج ${i}`, en: `Product ${i}` },
                reviews: [makeReview({ rating: 5, createdAt: new Date(Date.UTC(2026, 7, i + 1)) })]
            })
        );
        mockProductFind(many);

        const res = await request(app).get('/api/testimonials');

        expect(res.body.testimonials).toHaveLength(10);
        const dates = res.body.testimonials.map(t => new Date(t.createdAt).getTime());
        expect(dates).toEqual([...dates].sort((a, b) => b - a));
    });

    it('يعيد استجابة ناجحة بقائمة فارغة عند عدم وجود مراجعات', async () => {
        mockProductFind([]);

        const res = await request(app).get('/api/testimonials');

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, testimonials: [] });
    });

    it('يرجع 500 عند فشل قاعدة البيانات', async () => {
        require('../models').Product.find.mockReturnValue({
            select: jest.fn().mockReturnValue({
                limit: jest.fn().mockRejectedValue(new Error('db down'))
            })
        });

        const res = await request(app).get('/api/testimonials');

        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
    });
});