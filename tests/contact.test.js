const request = require('supertest');
const app = require('../app');

describe('POST /api/contact', () => {
    it('accepts a valid contact message', async () => {
        const res = await request(app)
            .post('/api/contact')
            .send({
                name: 'أحمد',
                email: 'ahmed@example.com',
                message: 'أرغب في الاستفسار عن المنتج'
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('تم');
    });

    it('rejects invalid contact data', async () => {
        const res = await request(app)
            .post('/api/contact')
            .send({ name: '', email: 'not-an-email', message: '' });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });
});
