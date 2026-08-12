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

    it('يحسب سعر البيع من سعر الأساس والهامش', () => {
        expect(pricing.computeSellingPrice({ basePrice: 10, margin: 1.15 })).toBe(11.5);
        expect(pricing.computeSellingPrice({ basePrice: 19.99, margin: 1.15 })).toBe(22.99);
        expect(pricing.computeSellingPrice({ basePrice: null, margin: 1.15 })).toBeNull();
        expect(pricing.computeSellingPrice({ basePrice: 0, margin: 1.15 })).toBeNull();
        expect(pricing.computeSellingPrice({ basePrice: 10, margin: 0.9 })).toBeNull();
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
