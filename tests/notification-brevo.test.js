describe('controllers/notification — إرسال البريد عبر Brevo API', () => {
    const MANAGED_KEYS = ['BREVO_API_KEY', 'BREVO_API_URL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'MAIL_FROM_NAME', 'EMAIL_NOTIFICATIONS_ENABLED'];
    const originalEnv = {};
    const originalFetch = global.fetch;
    let fetchMock;
    let warnSpy;
    let errorSpy;

    function loadNotification(overrides = {}) {
        jest.resetModules();
        MANAGED_KEYS.forEach((key) => delete process.env[key]);
        Object.assign(process.env, {
            MAIL_FROM: 'Joker Store <sender@example.com>',
            EMAIL_NOTIFICATIONS_ENABLED: 'true',
            ...overrides
        });
        return require('../controllers/notification');
    }

    beforeEach(() => {
        MANAGED_KEYS.forEach((key) => { originalEnv[key] = process.env[key]; });
        fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201, text: async () => '' });
        global.fetch = fetchMock;
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        MANAGED_KEYS.forEach((key) => {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        });
        if (originalFetch) global.fetch = originalFetch;
        else delete global.fetch;
    });

    it('يرسل بريد الاستعادة عبر Brevo عند وجود المفتاح', async () => {
        const { sendPasswordResetEmail } = loadNotification({ BREVO_API_KEY: 'test-key' });

        const result = await sendPasswordResetEmail('user@example.com', 'https://shop.test/reset-password?token=abc');

        expect(result).toEqual({ skipped: false });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.brevo.com/v3/smtp/email');
        expect(init.method).toBe('POST');
        expect(init.headers['api-key']).toBe('test-key');
        expect(init.headers['content-type']).toBe('application/json');

        const body = JSON.parse(init.body);
        expect(body.sender).toEqual({ name: 'Joker Store', email: 'sender@example.com' });
        expect(body.to).toEqual([{ email: 'user@example.com' }]);
        expect(body.subject).toContain('إعادة تعيين كلمة المرور');
        expect(body.htmlContent).toContain('https://shop.test/reset-password?token=abc');
    });

    it('يستخدم MAIL_FROM_NAME عندما لا يحمل MAIL_FROM اسماً', async () => {
        const { sendAbandonedCartEmail } = loadNotification({
            BREVO_API_KEY: 'test-key',
            MAIL_FROM: 'sender@example.com',
            MAIL_FROM_NAME: 'Joker Store'
        });

        await sendAbandonedCartEmail({ email: 'user@example.com', items: [], total: 10 });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.sender).toEqual({ name: 'Joker Store', email: 'sender@example.com' });
    });

    it('يرجع خطأً مفهوماً عند رفض Brevo للطلب', async () => {
        const { sendPasswordResetEmail } = loadNotification({ BREVO_API_KEY: 'bad-key' });
        fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => '{"message":"Key not found"}' });

        const result = await sendPasswordResetEmail('user@example.com', 'https://shop.test/reset');

        expect(result.skipped).toBe(false);
        expect(result.error).toContain('Brevo 401');
        expect(result.error).toContain('Key not found');
        expect(errorSpy).toHaveBeenCalled();
    });

    it('يتخطى الإرسال عندما لا يوجد Brevo ولا SMTP', async () => {
        const { sendPasswordResetEmail } = loadNotification();

        const result = await sendPasswordResetEmail('user@example.com', 'https://shop.test/reset');

        expect(result.skipped).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
    });

    it('يحترم EMAIL_NOTIFICATIONS_ENABLED=false حتى مع وجود المفتاح', async () => {
        const { sendPasswordResetEmail } = loadNotification({
            BREVO_API_KEY: 'test-key',
            EMAIL_NOTIFICATIONS_ENABLED: 'false'
        });

        const result = await sendPasswordResetEmail('user@example.com', 'https://shop.test/reset');

        expect(result.skipped).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('يتخطى الإرسال عند غياب بريد المستلم', async () => {
        const { sendPasswordResetEmail } = loadNotification({ BREVO_API_KEY: 'test-key' });

        const result = await sendPasswordResetEmail('', 'https://shop.test/reset');

        expect(result.skipped).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
