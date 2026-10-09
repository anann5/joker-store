const { createCaptcha, verifyCaptcha } = require('../middleware/captcha');

describe('Captcha (كابتشا رياضية موقّعة)', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = 'test-jwt-secret-for-captcha';
    });

    it('ينشئ تحدياً ويقبل الإجابة الصحيحة', () => {
        const { token, prompt } = createCaptcha();
        expect(typeof token).toBe('string');
        expect(typeof prompt).toBe('string');

        // نحسب الإجابة من العبارة ("a + b" أو "a - b")
        const parts = prompt.split(' ');
        const a = Number(parts[0]);
        const op = parts[1];
        const b = Number(parts[2]);
        const answer = op === '+' ? a + b : a - b;

        expect(verifyCaptcha(token, answer)).toBe(true);
    });

    it('يرفض الإجابة الخاطئة', () => {
        const { token } = createCaptcha();
        expect(verifyCaptcha(token, -999)).toBe(false);
    });

    it('التحدي أحادي الاستخدام (يرفض الاستعمال المكرر)', () => {
        const { token, prompt } = createCaptcha();
        const parts = prompt.split(' ');
        const a = Number(parts[0]);
        const op = parts[1];
        const b = Number(parts[2]);
        const answer = op === '+' ? a + b : a - b;

        expect(verifyCaptcha(token, answer)).toBe(true);
        expect(verifyCaptcha(token, answer)).toBe(false); // ثاني استعمال مرفوض
    });

    it('يرفض توكنات مزورة أو منتهية', () => {
        expect(verifyCaptcha('not-a-token', 5)).toBe(false);
        expect(verifyCaptcha('', 5)).toBe(false);
        expect(verifyCaptcha('x.y.z', 5)).toBe(false);
    });

    it('لا يقبل دون JWT_SECRET', () => {
        delete process.env.JWT_SECRET;
        const { token, prompt } = createCaptcha();
        const parts = prompt.split(' ');
        const a = Number(parts[0]);
        const op = parts[1];
        const b = Number(parts[2]);
        const answer = op === '+' ? a + b : a - b;
        expect(verifyCaptcha(token, answer)).toBe(false);
    });
});