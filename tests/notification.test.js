const notification = require('../controllers/notification');

// حذف أي إعداد قد يكون موجوداً في البيئة لضمان أن السلوك الافتراضي هو "معطّل"
const originalHost = process.env.SMTP_HOST;
delete process.env.SMTP_HOST;

describe('Email notification helper', () => {
    it('skips sending when SMTP is not configured', async () => {
        process.env.SMTP_HOST = '';
        const order = {
            orderId: 'TEST123',
            buyerEmail: 'buyer@example.com',
            items: [{ name: { ar: 'منتج' }, qty: 1, deliveredCodes: ['CODE1'] }]
        };
        const result = await notification.sendOrderConfirmationEmail(order);
        expect(result.skipped).toBe(true);
    });

    it('skips sending a rejection email when SMTP is not configured', async () => {
        process.env.SMTP_HOST = '';
        const order = {
            orderId: 'TEST456',
            buyerEmail: 'buyer@example.com'
        };
        const result = await notification.sendOrderRejectedEmail(order);
        expect(result.skipped).toBe(true);
    });
});

afterAll(() => {
    if (originalHost !== undefined) process.env.SMTP_HOST = originalHost;
    else delete process.env.SMTP_HOST;
});