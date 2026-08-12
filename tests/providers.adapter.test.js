const { resolvePath, normalizeItem, mapCategory, mapRegion, extractProviderCodes } = require('../providers/adapter');

const fakeProvider = {
    name: 'Fake',
    itemsUrl: 'https://api.example.com/items',
    currency: 'USD',
    defaultCategory: 'gaming_general',
    defaultRegion: 'global',
    fields: {
        id: 'id',
        price: 'price',
        priceCurrency: 'currency',
        nameAr: 'name_ar',
        nameEn: 'name_en',
        image: 'image',
        stock: 'stock',
        category: 'cat',
        region: 'country',
        description: 'desc'
    },
    categoryMapping: { games: 'steam', cards: 'gift-cards' },
    regionMapping: { US: 'united-states' }
};

describe('Provider Adapter', () => {
    it('يقرأ حقولاً متداخلة عبر مسار نقطي', () => {
        const obj = { a: { b: { c: 42 } } };
        expect(resolvePath(obj, 'a.b.c')).toBe(42);
        expect(resolvePath(obj, 'a.b.missing')).toBeUndefined();
        expect(resolvePath(null, 'a')).toBeUndefined();
    });

    it('يطبّع بيانات عنصر من المزود إلى الشكل الموحّد', () => {
        const item = {
            id: 10,
            name_ar: 'تذاكر فورتنايت',
            name_en: 'Fortnite 1000 V-Bucks',
            cat: 'games',
            country: 'US',
            price: '25.00',
            currency: 'USD',
            stock: 5,
            desc: 'Code delivered by email',
            image: 'https://img.example.com/f.png'
        };

        const normalized = normalizeItem(fakeProvider, item);
        expect(normalized.id).toBe('10');
        expect(normalized.name.ar).toBe('تذاكر فورتنايت');
        expect(normalized.name.en).toBe('Fortnite 1000 V-Bucks');
        expect(normalized.category).toBe('steam');
        expect(normalized.region).toBe('united-states');
        expect(normalized.price).toBe(25);
        expect(normalized.currency).toBe('USD');
        expect(normalized.stock).toBe(5);
        expect(normalized.description.ar).toBe('Code delivered by email');
        expect(normalized.image).toBe(item.image);
    });

    it('يستخدم القيم الافتراضية عند غياب الحقول', () => {
        const normalized = normalizeItem(fakeProvider, { id: 1 });
        expect(normalized.id).toBe('1');
        expect(normalized.price).toBeNull();
        expect(normalized.currency).toBe('USD');
        expect(normalized.stock).toBeNull();
        expect(normalized.category).toBe('gaming_general');
        expect(normalized.region).toBe('global');
        expect(normalized.name.ar).toBe('');
        expect(normalized.name.en).toBe('');
    });

    it('يعين الفئات والمناطق عبر التعيين أو مباشرة عند غياب التطابق', () => {
        expect(mapCategory(fakeProvider, 'games')).toBe('steam');
        expect(mapCategory(fakeProvider, 'other')).toBe('other');
        expect(mapCategory(fakeProvider, null)).toBeNull();
        expect(mapRegion(fakeProvider, 'US')).toBe('united-states');
        expect(mapRegion(fakeProvider, 'DE')).toBe('DE');
    });

    it('يستخرج الأكواد من استجابات الشراء بصيغ متعددة', () => {
        expect(extractProviderCodes({ codes: ['a', 'b'] }, 2)).toEqual(['a', 'b']);
        expect(extractProviderCodes({ items: [{ code: 'x' }, { pin: 'y' }] }, 2)).toEqual(['x', 'y']);
        expect(extractProviderCodes({ code: 'z' }, 1)).toEqual(['z']);
        expect(() => extractProviderCodes({ codes: ['a'] }, 2)).toThrow('المزود لم يرسل العدد المطلوب');
    });
});
