// اختبارات إخفاء المنتجات غير القابلة للتسليم من واجهة المتجر:
// المنتج الخارجي بلا مخزون معروف (providerStock = null) أو بصفر
// يجب ألا يظهر في القوائم أو البحث أو الترشيحات أو صفحة المنتج،
// بينما يبقى المنتج المحلي ظاهراً دائماً (نقص المخزون يُعرض «نفد»).
//
// نتحقق من شرط الاستعلام نفسه لأن القاعدة مطبّقة على مستوى قاعدة البيانات،
// وهذا يضمن عدم إمكانية تجاوزها من أي مسار عرض.

const request = require('supertest');
const express = require('express');

jest.mock('../models', () => ({
    Product: {
        find: jest.fn(),
        findOne: jest.fn(),
        findById: jest.fn()
    },
    Order: {},
    Category: {},
    Promotion: {},
    User: {}
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

const DELIVERY_CLAUSE = {
    $or: [
        { isExternal: { $ne: true } },
        { providerStock: { $gt: 0 } }
    ]
};

/**
 * سلسلة استعلام وهمية (find().sort().limit() وقابلة للانتظار معاً).
 */
function chain(result = []) {
    const query = {
        sort: () => query,
        limit: () => query,
        select: () => query,
        lean: () => Promise.resolve(result),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    };
    return query;
}

function makeApp() {
    const app = express();
    app.use(express.json());
    app.get('/api/products/search-index', storeController.getSearchIndex);
    app.get('/api/products/newly-added', storeController.getNewlyAddedProducts);
    app.get('/api/products/related/:productId', storeController.getRelatedProducts);
    app.get('/api/products/:categoryKey', storeController.getProductsByCategory);
    app.get('/api/products/item/:productId', storeController.getProductItem);
    app.get('/api/search', storeController.searchAll);
    app.post('/api/products/suggested', storeController.getSuggestedProducts);
    return app;
}

function lastFindFilter() {
    const calls = Product.find.mock.calls;
    return calls[calls.length - 1][0];
}

describe('إخفاء المنتجات غير القابلة للتسليم', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        Product.find.mockReturnValue(chain([]));
        Product.findOne.mockReturnValue(chain(null));
        Product.findById.mockReturnValue({ select: () => chain({ category: 'pubg' }) });
        app = makeApp();
    });

    it('قائمة القسم تُرشّح المنتجات غير القابلة للتسليم', async () => {
        const res = await request(app).get('/api/products/pubg');

        expect(res.statusCode).toBe(200);
        expect(lastFindFilter()).toEqual(expect.objectContaining({
            category: 'pubg',
            isActive: true,
            $and: [DELIVERY_CLAUSE]
        }));
    });

    it('فهرس البحث السريع يستبعد المنتجات المخفية', async () => {
        await request(app).get('/api/products/search-index');

        expect(lastFindFilter()).toEqual(expect.objectContaining({
            isActive: true,
            $and: [DELIVERY_CLAUSE]
        }));
    });

    it('قسم «وصل حديثاً» يستبعد المنتجات المخفية', async () => {
        await request(app).get('/api/products/newly-added');

        expect(lastFindFilter()).toEqual(expect.objectContaining({
            isActive: true,
            $and: [DELIVERY_CLAUSE]
        }));
    });

    it('المنتجات ذات الصلة تستبعد المنتجات المخفية', async () => {
        await request(app).get(`/api/products/related/${PRODUCT_ID}`);

        expect(lastFindFilter()).toEqual(expect.objectContaining({
            isActive: true,
            $and: [DELIVERY_CLAUSE]
        }));
    });

    it('البحث الشامل لا يُرجع منتجات مخفية', async () => {
        await request(app).get('/api/search?q=pubg&lang=ar');

        expect(lastFindFilter()).toEqual(expect.objectContaining({
            isActive: true,
            $and: [DELIVERY_CLAUSE]
        }));
    });

    it('اقتراحات السلة تستبعد المنتجات المخفية', async () => {
        await request(app)
            .post('/api/products/suggested')
            .send({ productIds: [PRODUCT_ID] });

        expect(lastFindFilter()).toEqual(expect.objectContaining({
            isActive: true,
            $and: [DELIVERY_CLAUSE]
        }));
    });

    it('صفحة المنتج المباشرة تُرجع 404 للمنتج المخفي', async () => {
        const res = await request(app).get(`/api/products/item/${PRODUCT_ID}`);

        expect(res.statusCode).toBe(404);
        expect(Product.findOne).toHaveBeenCalledWith(expect.objectContaining({
            isActive: true,
            $and: [DELIVERY_CLAUSE]
        }));
    });

    it('يعرض المنتج المحلي حتى لو كان مخزونه صفراً (نفد لا مخفي)', async () => {
        Product.findOne.mockReturnValue(chain({
            _id: PRODUCT_ID,
            productName: { ar: 'بطاقة محلية', en: 'Local card' },
            description: { ar: 'وصف', en: 'Description' },
            price: 20,
            category: 'gaming',
            isActive: true,
            isExternal: false,
            codes: []
        }));

        const res = await request(app).get(`/api/products/item/${PRODUCT_ID}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.product.availableStock).toBe(0);
    });

    it('يعرض المنتج الخارجي عند وجود مخزون موجب', async () => {
        Product.findOne.mockReturnValue(chain({
            _id: PRODUCT_ID,
            productName: { ar: 'ببجي', en: 'PUBG' },
            description: { ar: 'وصف', en: 'Description' },
            price: 20,
            category: 'pubg',
            isActive: true,
            isExternal: true,
            providerStock: 3
        }));

        const res = await request(app).get(`/api/products/item/${PRODUCT_ID}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.product.availableStock).toBe(3);
    });
});
