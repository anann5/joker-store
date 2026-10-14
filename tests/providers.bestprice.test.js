const { normalizeName, buildGroupKey, rankGroup } = require('../providers/bestPrice');

describe('Best Price Engine', () => {
    it('يوحّد الأسماء المختلفة لنفس السلعة عبر التطبيع', () => {
        expect(normalizeName('PUBG 100 UC')).toBe('pubg 100 uc');
        expect(normalizeName('  pubg   100   uc  ')).toBe('pubg 100 uc');
        expect(normalizeName('pubg_100_UC')).toBe('pubg 100 uc');
        expect(normalizeName('ببجي 100')).toBe('ببجي 100');
        expect(normalizeName('PUBG — 100 UC')).toBe('pubg 100 uc');
        expect(normalizeName('')).toBe('');
        expect(normalizeName(null)).toBe('');
    });

    it('يبني مفتاح مجموعة موحّداً من الفئة والمنطقة والاسم', () => {
        const a = buildGroupKey({ category: 'pubg', region: 'tr', name: 'PUBG 100 UC' });
        const b = buildGroupKey({ category: 'pubg', region: 'tr', name: 'pubg 100 uc' });
        const c = buildGroupKey({ category: 'pubg', region: 'global', name: 'PUBG 100 UC' });
        const d = buildGroupKey({ category: 'steam', region: 'tr', name: 'PUBG 100 UC' });

        expect(a).toBe(b);
        expect(a).not.toBe(c);
        expect(a).not.toBe(d);
    });

    it('يعيد null عند غياب اسم صالح للمجموعة', () => {
        expect(buildGroupKey({ category: 'pubg', region: 'tr', name: '' })).toBeNull();
        expect(buildGroupKey({ category: 'pubg', region: 'tr', name: '  !!!  ' })).toBeNull();
        expect(buildGroupKey({ category: 'pubg', region: 'tr', name: null })).toBeNull();
    });

    it('يرتّب عروض المجموعة من الأرخص للأغلى', () => {
        const ranked = rankGroup([
            { id: 'p3', basePrice: 30 },
            { id: 'p1', basePrice: 10 },
            { id: 'p2', basePrice: 20 }
        ]);
        expect(ranked.map(r => r.id)).toEqual(['p1', 'p2', 'p3']);
    });

    it('يحسم التساوي بالمعرّف ويستبعد الأسعار غير الصالحة', () => {
        const ranked = rankGroup([
            { id: 'b', basePrice: 15 },
            { id: 'a', basePrice: 15 },
            { id: 'zero', basePrice: 0 },
            { id: 'neg', basePrice: -5 },
            { id: 'nan', basePrice: Number.NaN }
        ]);
        expect(ranked.map(r => r.id)).toEqual(['a', 'b']);
    });
});