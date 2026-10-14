process.env.DEFAULT_PROFIT_MARGIN = '1.30';
process.env.CATEGORY_MARGIN_STEAM = '1.15';

const pricing = require('../providers/pricing');

describe('Pricing Engine', () => {
    it('يعيد هامش الفئة المعرّف من البيئة', () => {
        expect(pricing.categoryMargin('steam')).toBe(1.15);
        expect(pricing.categoryMargin('Steam')).toBe(1.15);
        expect(pricing.categoryMargin('unknown')).toBeNull();
    });

    it('يحدد الهامش بترتيب: تجاوز المنتج ثم الفئة ثم المزود ثم العام', () => {
        const product = { profitMargin: 1.20, profitMarginOverride: true, category: 'steam' };
        expect(pricing.getMarginForProduct(product, null)).toBe(1.20);

        const noOverride = { profitMargin: 1.20, profitMarginOverride: false, category: 'steam' };
        expect(pricing.getMarginForProduct(noOverride, null)).toBe(1.15);

        const noCategory = { category: 'unknown' };
        const provider = { margin: 1.25 };
        expect(pricing.getMarginForProduct(noCategory, provider)).toBe(1.25);

        const fallback = { category: 'unknown' };
        expect(pricing.getMarginForProduct(fallback, null)).toBe(1.30);
    });

    it('يحسب سعر البيع (ينتهي بـ 0 أو 5 دائماً)', () => {
        expect(pricing.computeSellingPrice({ basePrice: 10, margin: 1.15 })).toBe(15);
        expect(pricing.computeSellingPrice({ basePrice: 19.99, margin: 1.15 })).toBe(25);
        expect(pricing.computeSellingPrice({ basePrice: 50, margin: 30 })).toBe(65);
        expect(pricing.computeSellingPrice({ basePrice: 10, margin: '30%' })).toBe(15);
        expect(pricing.computeSellingPrice({ basePrice: 200, margin: 30 })).toBe(260);
        expect(pricing.computeSellingPrice({ basePrice: null, margin: 1.15 })).toBeNull();
        expect(pricing.computeSellingPrice({ basePrice: 0, margin: 1.15 })).toBeNull();
        expect(pricing.computeSellingPrice({ basePrice: 10, margin: 0.9 })).toBe(20);
    });

    it('يضيف ربحاً ثابتاً حسب طبقة سعر الشراء (بدون هامش)', () => {
        expect(pricing.computeSellingPrice({ basePrice: 10 })).toBe(15);      // أقل من 50 → +5
        expect(pricing.computeSellingPrice({ basePrice: 48 })).toBe(55);      // أقل من 50 → +5
        expect(pricing.computeSellingPrice({ basePrice: 50 })).toBe(60);      // 50→ +10
        expect(pricing.computeSellingPrice({ basePrice: 99 })).toBe(110);     // <100 → +10
        expect(pricing.computeSellingPrice({ basePrice: 100 })).toBe(115);    // 100→ +15
        expect(pricing.computeSellingPrice({ basePrice: 199 })).toBe(215);    // <200 → +15
        expect(pricing.computeSellingPrice({ basePrice: 200 })).toBe(220);    // 200→ +20
        expect(pricing.computeSellingPrice({ basePrice: 500 })).toBe(520);    // 200+ → +20
    });

    it('تحدد طبقة الربح المناسبة لسعر الشراء', () => {
        expect(pricing.tierProfit(10)).toBe(5);
        expect(pricing.tierProfit(49.9)).toBe(5);
        expect(pricing.tierProfit(50)).toBe(10);
        expect(pricing.tierProfit(99)).toBe(10);
        expect(pricing.tierProfit(100)).toBe(15);
        expect(pricing.tierProfit(199)).toBe(15);
        expect(pricing.tierProfit(200)).toBe(20);
        expect(pricing.tierProfit(0)).toBeNull();
        expect(pricing.tierProfit(-5)).toBeNull();
    });

    it('يوحّد صيغ هامش الربح: نسبة مئوية أو مضاعف أو كسر', () => {
        expect(pricing.normalizeMargin(30)).toBe(1.30);
        expect(pricing.normalizeMargin('30%')).toBe(1.30);
        expect(pricing.normalizeMargin(1.30)).toBe(1.30);
        expect(pricing.normalizeMargin(0.30)).toBe(1.30);
        expect(pricing.normalizeMargin(0)).toBeNull();
        expect(pricing.normalizeMargin(-5)).toBeNull();
        expect(pricing.normalizeMargin('abc')).toBeNull();
    });

    it('يحسب نسبة التغير بين سعرين', () => {
        expect(pricing.priceChangeRatio(40, 20)).toBe(2);
        expect(pricing.priceChangeRatio(0, 20)).toBeNull();
        expect(pricing.priceChangeRatio(40, null)).toBeNull();
    });

    it('يكشف القفزات السعرية المشبوهة من المصدر', () => {
        expect(pricing.isSuspicious(100, 20, 4)).toBe(true);
        expect(pricing.isSuspicious(40, 20, 4)).toBe(false);
        expect(pricing.isSuspicious(100, null, 4)).toBe(false);
    });
});
