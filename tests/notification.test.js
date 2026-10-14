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

    it('skips the order-created email when SMTP is not configured', async () => {
        process.env.SMTP_HOST = '';
        const order = {
            orderId: 'TEST789',
            buyerEmail: 'buyer@example.com',
            price: 25.5,
            items: [{ name: { ar: 'منتج' }, qty: 1, unitPrice: 25.5 }]
        };
        const result = await notification.sendOrderCreatedEmail(order);
        expect(result).toEqual({ skipped: true, reason: 'email not configured' });
    });
});

describe('sendOrderCreatedEmail with SMTP configured', () => {
    const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
    let configuredNotification;

    beforeAll(() => {
        jest.resetModules();
        process.env.SMTP_HOST = 'smtp.test.local';
        process.env.MAIL_FROM = 'store@test.local';
        jest.doMock('nodemailer', () => ({
            createTransport: jest.fn(() => ({ sendMail: sendMailMock }))
        }));
        configuredNotification = require('../controllers/notification');
    });

    afterAll(() => {
        jest.dontMock('nodemailer');
        jest.resetModules();
        if (originalHost !== undefined) process.env.SMTP_HOST = originalHost;
        else delete process.env.SMTP_HOST;
    });

    it('sends an email with a summary of items, total and tracking note', async () => {
        sendMailMock.mockClear();

        const order = {
            orderId: 'TEST100',
            buyerEmail: 'buyer@example.com',
            price: 9,
            discountCode: 'JOKER10',
            items: [
                { name: { ar: 'منتج مميز', en: 'Premium' }, qty: 1, unitPrice: 9, price: 9 }
            ]
        };

        const result = await configuredNotification.sendOrderCreatedEmail(order);

        expect(result).toEqual({ skipped: false });
        expect(sendMailMock).toHaveBeenCalledTimes(1);

        const callArg = sendMailMock.mock.calls[0][0];
        expect(callArg.from).toBe('store@test.local');
        expect(callArg.to).toBe('buyer@example.com');
        expect(callArg.subject).toContain('#TEST100');
        expect(callArg.html).toContain('منتج مميز');
        expect(callArg.html).toContain('الإجمالي:');
        expect(callArg.html).toContain('تتبع طلبك');
    });

    it('escapes item names and order ids in the generated HTML', async () => {
        sendMailMock.mockClear();

        const order = {
            orderId: 'A&B<SCRIPT>',
            buyerEmail: 'buyer@example.com',
            price: 5,
            items: [
                { name: { ar: 'منتج <b>مميز</b>', en: 'Bad <b>Name</b>' }, qty: 2, unitPrice: 2.5 }
            ]
        };

        await configuredNotification.sendOrderCreatedEmail(order);

        const callArg = sendMailMock.mock.calls[0][0];
        expect(callArg.subject).toContain('#A&B<SCRIPT>');
        expect(callArg.html).toContain('#A&amp;B&lt;SCRIPT&gt;');
        expect(callArg.html).not.toContain('<b>مميز</b>');
        expect(callArg.html).toContain('منتج &lt;b&gt;مميز&lt;/b&gt;');
    });
});

afterAll(() => {
    if (originalHost !== undefined) process.env.SMTP_HOST = originalHost;
    else delete process.env.SMTP_HOST;
});