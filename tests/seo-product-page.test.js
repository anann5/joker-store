// اختبارات حقن وسوم SEO في صفحة /product/:productId (app.js):
//   - title/description/canonical/og/twitter
//   - JSON-LD Product مع aggregateRating عند وجود تقييمات
//   - تهريب القيم الديناميكية (منع حقن HTML)
//   - الحفاظ على سلوك 404 للمنتجات غير الموجودة والمعرّفات غير الصالحة

const request = require('supertest');

jest.mock('../models', () => ({
    Product: {
        findById: jest.fn()
    },
    Order: {},
    Category: {},
    Promotion: {},
    User: {},
    AdminSession: {}
}));

const { Product } = require('../models');
const app = require('../app');

const PRODUCT_ID = '507f191e810c19729de860ea';

function makeProduct() {
    return {
        _id: PRODUCT_ID,
        productName: { ar: 'شدات ببجي 6600', en: 'PUBG 6600 UC' },
        description: { ar: 'شحن فوري مضمون', en: 'Instant guaranteed top-up' },
        price: 199,
        category: 'pubg',
        region: 'global',
        image: '/image/pubg.png',
        rating: 4.5,
        reviewsCount: 12,
        isActive: true
    };
}

function mockFindById(product) {
    Product.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(product)
    });
}

describe('GET /product/:productId — SEO meta injection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.SITE_URL = 'https://joker.example';
    });

    afterAll(() => {
        delete process.env.SITE_URL;
    });

    it('يحقن وسوم SEO (title/canonical/og/twitter/JSON-LD) في الصفحة', async () => {
        mockFindById(makeProduct());

        const res = await request(app).get(`/product/${PRODUCT_ID}`);

        expect(res.statusCode).toBe(200);
        expect(res.type).toBe('text/html');
        expect(Product.findById).toHaveBeenCalledWith(PRODUCT_ID);
        expect(res.text).toContain('<title>شدات ببجي 6600 | Joker Store</title>');
        expect(res.text).toContain('name="description" content="شحن فوري مضمون"');
        expect(res.text).toContain(`rel="canonical" href="https://joker.example/product/${PRODUCT_ID}"`);
        expect(res.text).toContain('property="og:type" content="product"');
        expect(res.text).toContain('property="og:url"');
        expect(res.text).toContain('name="twitter:card" content="summary"');
        expect(res.text).toContain('application/ld+json');
        expect(res.text).toContain('"@type":"Product"');
        expect(res.text).toContain('"price":199');
    });

    it('يترجم العنوان والوصف حسب ?lang=en مع الحفاظ على البيانات المتبقية', async () => {
        mockFindById(makeProduct());

        const res = await request(app).get(`/product/${PRODUCT_ID}?lang=en`);

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('<title>PUBG 6600 UC | Joker Store</title>');
        expect(res.text).toContain('name="description" content="Instant guaranteed top-up"');
        // XML-السكيمة: بدون تقييمات تُحذف aggregateRating
    });

    it('يحقن aggregateRating في JSON-LD عندما يكون التقييم أكبر من صفر', async () => {
        mockFindById(makeProduct());

        const res = await request(app).get(`/product/${PRODUCT_ID}`);

        expect(res.text).toContain('"@type":"AggregateRating"');
        expect(res.text).toContain('"ratingValue":4.5');
        expect(res.text).toContain('"reviewCount":12');
    });

    it('يحذف aggregateRating عندما لا توجد تقييمات', async () => {
        const product = makeProduct();
        product.rating = 0;
        mockFindById(product);

        const res = await request(app).get(`/product/${PRODUCT_ID}`);

        expect(res.text).not.toContain('AggregateRating');
    });

    it('يُهرب القيم الديناميكية داخل الوسوم (منع حقن HTML)', async () => {
        const product = makeProduct();
        product.productName = { ar: 'شدات <script>alert(1)</script>', en: 'UC' };
        product.description = { ar: 'وصف & <b>آمن</b>', en: 'desc' };
        mockFindById(product);

        const res = await request(app).get(`/product/${PRODUCT_ID}`);

        expect(res.statusCode).toBe(200);
        expect(res.text).not.toContain('<script>alert(1)</script>');
        expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(res.text).toContain('وصف &amp; &lt;b&gt;آمن&lt;/b&gt;');
    });

    it('يبقي السلوك القديم: منتج غير موجود يقع على 404', async () => {
        mockFindById(null);

        const res = await request(app)
            .get(`/product/${PRODUCT_ID}`)
            .set('Accept', 'text/html');

        expect(res.statusCode).toBe(404);
    });

    it('معرّف غير صالح لا يلمس قاعدة البيانات', async () => {
        const res = await request(app).get('/product/not-an-id');

        expect(res.statusCode).toBe(404);
        expect(Product.findById).not.toHaveBeenCalled();
    });
});
