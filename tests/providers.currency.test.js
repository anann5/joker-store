jest.mock('axios');

const axios = require('axios');
const currency = require('../providers/currency');

describe('Currency Engine', () => {
    beforeAll(() => {
        process.env.STORE_CURRENCY = 'USD';
        process.env.FX_USD_TRY = '32.5';
        currency.clearCache();
    });

    afterEach(() => {
        currency.clearCache();
        axios.get.mockReset();
    });

    it('يحوّل من عملة المتجر إلى عملة المزود بالتجاوز اليدوي', async () => {
        const result = await currency.convert(100, 'USD', 'TRY');
        expect(result).toBe(3250);
    });

    it('يحوّل من عملة المزود إلى عملة المتجر', async () => {
        const result = await currency.convert(3250, 'TRY', 'USD');
        expect(result).toBeCloseTo(100, 5);
    });

    it('نفس العملة يعيد المبلغ دون تغيير', async () => {
        await expect(currency.getRate('USD', 'USD')).resolves.toBe(1);
        await expect(currency.convert(50, 'USD', 'USD')).resolves.toBe(50);
    });

    it('يرفض التحويل عند غياب السعر وتَفشل الخدمة التلقائية', async () => {
        axios.get.mockRejectedValue(new Error('network down'));
        await expect(currency.convert(10, 'USD', 'JPY')).rejects.toThrow('لا يوجد سعر صرف');
    });

    it('يقرب المبالغ إلى منزلتين عشريتين', () => {
        expect(currency.roundMoney(12.345)).toBe(12.35);
        expect(currency.roundMoney(12.344)).toBe(12.34);
        expect(currency.roundMoney(10)).toBe(10);
    });

    it('يقرأ أسعار الصرف من الخدمة التلقائية ويخزنها في الكاش', async () => {
        axios.get.mockResolvedValue({ data: { rates: { USD: 1, EUR: 0.92, TRY: 32.5 } } });
        const result = await currency._internal.getUsdRates();
        expect(result.TRY).toBe(32.5);
        await currency._internal.getUsdRates();
        expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it('يحوّل من الدولار إلى الشيكل عبر الخدمة التلقائية', async () => {
        axios.get.mockResolvedValue({ data: { base_code: 'USD', rates: { USD: 1, ILS: 3.7 } } });
        const result = await currency.convert(10, 'USD', 'ILS');
        expect(result).toBeCloseTo(37, 5);
    });

    it('يسوّي أسعار الخدمة ذات الأساس غير الدولار إلى أساس الدولار', async () => {
        axios.get.mockResolvedValue({ data: { base_code: 'ILS', rates: { ILS: 1, USD: 0.27, EUR: 0.25 } } });
        const result = await currency._internal.getUsdRates();
        expect(result.USD).toBe(1);
        expect(result.EUR).toBeCloseTo(0.25 / 0.27, 5);
    });

    it('يحوّل سعر المزود من الدولار إلى عملة المتجر (الشيكل)', async () => {
        axios.get.mockResolvedValue({ data: { base_code: 'USD', rates: { USD: 1, ILS: 3.7 } } });
        const result = await currency.convert(50, 'USD', currency.STORE_CURRENCY);
        expect(result).toBeCloseTo(185, 5);
    });

    it('يعرض رمز ورمز عملة المتجر في الحالة', async () => {
        const status = await currency.status();
        expect(status.code).toBe(currency.STORE_CURRENCY);
        expect(typeof status.symbol).toBe('string');
    });
});
