// اختبارات مزامنة المزودين الجديدة:
//   applyBestPrice — خطة «أفضل سعر» الواعية بالمخزون (إخفاء نافد المخزون)
//   syncCategoriesFromCatalog — إنشاء/تفعيل/إخفاء الأقسام التلقائية
// تعتمد على مذاكاة النماذج والمحول لإبقاء الاختبارات سريعة دون شبكة.

jest.mock('../models', () => ({
    Product: {
        find: jest.fn(),
        updateOne: jest.fn(),
        distinct: jest.fn()
    },
    Category: {
        find: jest.fn(),
        create: jest.fn(),
        updateOne: jest.fn()
    },
    ProviderSyncState: {}
}));

jest.mock('../providers/registry', () => ({
    getProviders: jest.fn(),
    getProvider: jest.fn(),
    getProvidersSafe: jest.fn()
}));

jest.mock('../providers/adapter', () => ({
    fetchCatalog: jest.fn(),
    normalizeItem: jest.fn(),
    fetchBalance: jest.fn()
}));

jest.mock('../controllers/helpers', () => ({
    sendTelegramAlert: jest.fn(),
    createLog: jest.fn()
}));

jest.mock('../providers/currency', () => ({
    convert: jest.fn(),
    roundMoney: jest.fn(),
    status: jest.fn(),
    STORE_CURRENCY: 'USD',
    STORE_CURRENCY_SYMBOL: '$'
}));

jest.mock('../providers/pricing', () => ({
    isSuspicious: jest.fn(),
    getMarginForProduct: jest.fn(),
    computeSellingPrice: jest.fn()
}));

const { Product, Category } = require('../models');
const { applyBestPrice, syncCategoriesFromCatalog } = require('../providers/sync');

function makeMember({ id, basePrice, stock, provider = 'P1', externalId = `e-${id}`, groupKey = 'g1' }) {
    return {
        _id: { toString: () => id },
        basePrice,
        providerStock: stock,
        currentProvider: provider,
        externalId,
        groupKey,
        isActive: true,
        save: jest.fn().mockResolvedValue(true)
    };
}

describe('applyBestPrice — اختيار الأرخص المتوفر بالمخزون', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('يختار الأرخص المتوفر ويخفي النسخ النافدة فقط', async () => {
        const cheaperOutOfStock = makeMember({ id: 'a', basePrice: 10, stock: 0 });
        const dearerInStock = makeMember({ id: 'b', basePrice: 12, stock: 5 });
        Product.find.mockResolvedValue([cheaperOutOfStock, dearerInStock]);
        Product.updateOne.mockResolvedValue({});

        const summary = await applyBestPrice();

        expect(Product.updateOne).toHaveBeenCalledTimes(2);
        expect(Product.updateOne).toHaveBeenCalledWith(
            { _id: cheaperOutOfStock._id },
            { $set: { isActive: false, providerOptions: expect.any(Array) } }
        );
        expect(Product.updateOne).toHaveBeenCalledWith(
            { _id: dearerInStock._id },
            { $set: { isActive: true, providerOptions: expect.any(Array) } }
        );
        expect(summary).toEqual({ grouped: 1, winners: 1 });
    });

    it('يحفظ خيارات التسليم مرتبة من الأرخص للأغلى', async () => {
        const out = makeMember({ id: 'a', basePrice: 11, stock: 0 });
        const first = makeMember({ id: 'b', basePrice: 9, stock: 3 });
        const last = makeMember({ id: 'c', basePrice: 15, stock: 8 });
        Product.find.mockResolvedValue([out, first, last]);
        Product.updateOne.mockResolvedValue({});

        await applyBestPrice();

        const optionsForWinner = Product.updateOne.mock.calls.find(
            call => call[0]._id === first._id
        )[1].$set.providerOptions;
        expect(optionsForWinner.map(option => option.provider)).toEqual(['P1', 'P1', 'P1']);
        expect(optionsForWinner[0].basePrice).toBe(9);
        expect(optionsForWinner[2].basePrice).toBe(15);
    });

    it('عند نفاد مخزون كل المزودين تُخفى جميع النسخ', async () => {
        const a = makeMember({ id: 'a', basePrice: 10, stock: 0 });
        const b = makeMember({ id: 'b', basePrice: 12, stock: 0 });
        Product.find.mockResolvedValue([a, b]);
        Product.updateOne.mockResolvedValue({});

        const summary = await applyBestPrice();

        expect(Product.updateOne).toHaveBeenCalledTimes(2);
        for (const call of Product.updateOne.mock.calls) {
            expect(call[1].$set.isActive).toBe(false);
        }
        expect(summary.winners).toBe(0);
    });

    it('سلعة بمزود واحد: مخزون غير معروف (null) لا تُخفى', async () => {
        const single = makeMember({ id: 's', basePrice: 15, stock: null, groupKey: 'g2' });
        Product.find.mockResolvedValue([single]);

        await applyBestPrice();

        expect(single.save).toHaveBeenCalledTimes(1);
        expect(single.isActive).toBe(true);
        expect(single.providerOptions).toHaveLength(1);
    });

    it('سلعة بمزود واحد نافدة المخزون تُخفى تلقائياً', async () => {
        const single = makeMember({ id: 's', basePrice: 15, stock: 0, groupKey: 'g2' });
        Product.find.mockResolvedValue([single]);

        await applyBestPrice();

        expect(single.isActive).toBe(false);
        expect(single.save).toHaveBeenCalledTimes(1);
    });
});

describe('syncCategoriesFromCatalog — إدارة الأقسام التلقائية', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('ينشئ قسماً تلقائياً بعنوان مترجم ويعيد تفعيل الموجود ذي المنتجات', async () => {
        Product.distinct.mockResolvedValue(['steam', 'pubg']);
        Category.find.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { key: 'steam', source: 'auto' },
                    { key: 'hand', source: 'manual' }
                ])
            })
        });
        Category.create.mockResolvedValue({ key: 'pubg', source: 'auto' });
        Category.updateOne.mockResolvedValue({ modifiedCount: 1 });

        const summary = await syncCategoriesFromCatalog();

        expect(Product.distinct).toHaveBeenCalledWith('category', { isActive: true, category: { $ne: null } });
        // الأقسام الجديدة تُنشأ بعنوان مترجم عبر prettifyCategoryTitle
        expect(Category.create).toHaveBeenCalledWith({
            key: 'pubg',
            title: { ar: 'ببجي', en: 'PUBG' },
            image: '',
            order: 1000,
            source: 'auto'
        });
        // steam موجود → shown، وpubg أُنشئ للتو ثم أُعيد تأكيد تفعيله → shown أيضاً
        expect(Category.updateOne).toHaveBeenCalledWith(
            { key: 'steam', source: 'auto' },
            { $set: { isActive: true } }
        );
        expect(Category.updateOne).not.toHaveBeenCalledWith(
            { key: 'hand', source: 'manual' },
            expect.anything()
        );
        expect(summary).toEqual({ created: 1, hidden: 0, shown: 2 });
    });

    it('ينظّم عناوين أقسام غير معروفة بدل مفتاح المزود الخام', async () => {
        Product.distinct.mockResolvedValue(['free-fire_topup', 'steam']);
        Category.find.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            })
        });
        Category.create.mockResolvedValue({});
        Category.updateOne.mockResolvedValue({ modifiedCount: 0 });

        await syncCategoriesFromCatalog();

        expect(Category.create).toHaveBeenCalledWith({
            key: 'free-fire_topup',
            title: { ar: 'Free Fire Topup', en: 'Free Fire Topup' },
            image: '',
            order: 1000,
            source: 'auto'
        });
        // steam الموجود في الخريطة يُترجم عند إنشائه
        expect(Category.create).toHaveBeenCalledWith(expect.objectContaining({
            key: 'steam',
            title: { ar: 'ستيم ستور', en: 'Steam' }
        }));
    });

    it('يُخفي الأقسام التلقائية التي أصبحت بلا منتجات ولا يلمس اليدوية', async () => {
        Product.distinct.mockResolvedValue(['still']);
        Category.find.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { key: 'still', source: 'auto' },
                    { key: 'gone', source: 'auto' },
                    { key: 'hand', source: 'manual' }
                ])
            })
        });
        Category.updateOne.mockResolvedValue({ modifiedCount: 1 });

        const summary = await syncCategoriesFromCatalog();

        expect(Category.updateOne).toHaveBeenCalledWith(
            { key: 'gone', source: 'auto' },
            { $set: { isActive: false } }
        );
        expect(Category.updateOne).toHaveBeenCalledTimes(2); // still + gone فقط
        expect(summary).toEqual({ created: 0, hidden: 1, shown: 1 });
    });

    it('لا يحتسب التفعيل/الإخفاء عند عدم تعديل المستند (modifiedCount=0)', async () => {
        Product.distinct.mockResolvedValue([]);
        Category.find.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([{ key: 'same', source: 'auto' }])
            })
        });
        Category.updateOne.mockResolvedValue({ modifiedCount: 0 });

        const summary = await syncCategoriesFromCatalog();

        expect(summary).toEqual({ created: 0, hidden: 0, shown: 0 });
    });
});