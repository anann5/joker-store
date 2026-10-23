const fxPricing = require('../providers/fxPricing');

describe('FX pricing', () => {
    test('adds profit and rounds up to the nearest whole shekel', () => {
        expect(fxPricing.computeIlsPrice(10, 3.098)).toBe(36);
        expect(fxPricing.computeIlsPrice(11.5, 3.098)).toBe(41);
        expect(fxPricing.computeIlsPrice(5, 3.098)).toBe(21);
    });

    test('adds 15% for converted prices of 50 shekels or more', () => {
        expect(fxPricing.computeIlsPrice(20, 3.098)).toBe(72);
    });

    test('supports a per-product percentage margin override', () => {
        expect(fxPricing.computeIlsPrice(10, 3.098, {
            profitMarginOverride: true,
            profitMargin: 1.3
        })).toBe(41);
    });

    test('resolveUnitPrice uses the product source currency rate', () => {
        expect(fxPricing.resolveUnitPrice({ autoPrice: true, priceUsd: 10, price: 11 }, 3.098)).toBe(36);
        expect(fxPricing.resolveUnitPrice({
            autoPrice: true,
            priceUsd: 10,
            priceSourceCurrency: 'EUR',
            price: 11
        }, new Map([['EUR', 4]]))).toBe(45);
        expect(fxPricing.resolveUnitPrice({ autoPrice: false, priceUsd: 10, price: 11 }, 3.098)).toBe(11);
        expect(fxPricing.resolveUnitPrice({ autoPrice: true, priceUsd: 10, price: 11 }, null)).toBe(11);
    });
});
