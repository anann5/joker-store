const request = require('supertest');
const app = require('../app');

describe('Informational pages and missing-route handling', () => {
    it('serves the privacy page', async () => {
        const res = await request(app).get('/privacy');

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('سياسة الخصوصية');
    });

    it('serves the about page', async () => {
        const res = await request(app).get('/about');

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('من نحن');
    });

    it('serves the FAQ page', async () => {
        const res = await request(app).get('/faq');

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('الأسئلة الشائعة');
    });

    it('renders an HTML 404 page for unknown routes', async () => {
        const res = await request(app)
            .get('/does-not-exist')
            .set('Accept', 'text/html');

        expect(res.statusCode).toBe(404);
        expect(res.type).toBe('text/html');
        expect(res.text).toContain('الصفحة غير موجودة');
    });
});
