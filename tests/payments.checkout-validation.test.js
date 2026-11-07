// اختبارات التحقق من مخطط إنشاء الطلب (checkoutSchema):
//   - الدفع الإلكتروني (online) لا يشترط رقم عملية/إثبات
//   - المحافظ اليدوية ما تزال تشترط رقم العملية
//   - أي بوابة غير معروفة تُرفض
//
// اكتُشف هذا أثناء الاختبار المحلي: الواجهة ترسل paymentGateway=online
// بدون paymentRef، فكان الخادم يرفضها بـ 400 قبل أن يصل الدفع للبوابة.

const { checkoutSchema } = require('../middleware/validate');

const PRODUCT_ID = '507f191e810c19729de860ea';

function payload(overrides = {}) {
    return {
        cartItems: [{ id: PRODUCT_ID, qty: 1 }],
        customerEmail: 'test@example.com',
        paymentGateway: 'jawwal_pay',
        paymentRef: 'MOCK-REF-123',
        ...overrides
    };
}

describe('checkoutSchema — بوابات الدفع', () => {
    it('يقبل المحفظة اليدوية مع رقم عملية', () => {
        const { error } = checkoutSchema.validate(payload());
        expect(error).toBeUndefined();
    });

    it('يرفض المحفظة اليدوية بدون رقم عملية', () => {
        const { error } = checkoutSchema.validate(payload({ paymentRef: undefined }));
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('paymentRef');
    });

    it('يرفض المحفظة اليدوية برقم قصير جداً', () => {
        const { error } = checkoutSchema.validate(payload({ paymentRef: 'x' }));
        expect(error).toBeDefined();
    });

    it('يقبل الدفع الإلكتروني (online) بدون رقم عملية', () => {
        const { error } = checkoutSchema.validate(
            payload({ paymentGateway: 'online', paymentRef: '' })
        );
        expect(error).toBeUndefined();
    });

    it('يقبل الدفع الإلكتروني (online) مع غياب الحقل تماماً', () => {
        const { error } = checkoutSchema.validate(
            payload({ paymentGateway: 'online', paymentRef: undefined })
        );
        expect(error).toBeUndefined();
    });

    it('يرفض بوابة دفع غير معروفة', () => {
        const { error } = checkoutSchema.validate(
            payload({ paymentGateway: 'unknown_gateway', paymentRef: 'ref-123' })
        );
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('paymentGateway');
    });
});
