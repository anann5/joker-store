const { totpCodes, verifyTotp, base32Encode, base32Decode, generateSecret } = require('../middleware/totp');

describe('TOTP (RFC 6238)', () => {
    // قيم RFC 6238 الرسمية — السر ASCII: "12345678901234567890"
    const SECRET = '12345678901234567890';
    const VECTORS = [
        [59, '287082'],
        [1111111109, '081804'],
        [1111111111, '050471'],
        [1234567890, '005924'],
        [2000000000, '279037'],
        [20000000000, '353130']
    ];

    it('يولّد الأكواد المطابقة لقيم RFC', () => {
        for (const [timeSec, expected] of VECTORS) {
            const { codes } = totpCodes(SECRET, { now: timeSec * 1000, digits: 6, window: 0 });
            expect(codes[0]).toBe(expected);
        }
    });

    it('يتحقق من الكود الصحيح ضمن النافذة', () => {
        const secret = generateSecret();
        const { codes } = totpCodes(secret, { window: 1 });
        expect(verifyTotp(secret, codes[1]).valid).toBe(true); // اللحظة الحالية
        expect(verifyTotp(secret, codes[0]).valid).toBe(true); // نافذة سابقة
        expect(verifyTotp(secret, codes[2]).valid).toBe(true); // نافذة لاحقة
    });

    it('يرفض الأكواد الخاطئة أو العابرة', () => {
        const secret = generateSecret();
        expect(verifyTotp(secret, '000000').valid).toBe(false);
        expect(verifyTotp(secret, 'abcd12').valid).toBe(false);
        expect(verifyTotp(secret, '').valid).toBe(false);
        expect(verifyTotp(secret, '12345').valid).toBe(false); // طول خاطئ
    });

    it('يرفض كوداً من نافذة خارج النطاق', () => {
        const secret = generateSecret();
        const { codes } = totpCodes(secret, { now: Date.now() - 95 * 1000, window: 0 }); // ~3 نوافذ مضت
        expect(verifyTotp(secret, codes[0]).valid).toBe(false);
    });

    it('يأكل سر Base32 كما هو', () => {
        const secret = generateSecret();
        const { codes } = totpCodes(secret, { window: 0 });
        // نفس السر بصيغته النصية الأصلية (بدون مسافة بادئة/trailing) يجب أن يطابق
        const again = totpCodes(secret, { window: 0 });
        expect(again.codes[0]).toBe(codes[0]);
    });

    it('Base32 دائرية (ترميز ثم فكّ ترميز)', () => {
        const buf = Buffer.from('Joker Store Secret', 'utf8');
        const encoded = base32Encode(buf);
        expect(base32Decode(encoded)).toEqual(buf);
    });
});