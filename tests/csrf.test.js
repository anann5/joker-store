const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const csrfProtection = require('../middleware/csrf');

function buildApp() {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.get('/api/csrf-token', csrfProtection.issueToken);
    app.post('/api/admin/test', csrfProtection.validate, (req, res) => {
        res.json({ success: true });
    });
    return app;
}

describe('CSRF protection', () => {
    it('issues a token and sets a cookie', async () => {
        const app = buildApp();
        const res = await request(app).get('/api/csrf-token');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.csrfToken).toBeTruthy();
        expect(res.headers['set-cookie'][0]).toContain('csrf_token=');
    });

    it('rejects admin mutations without a valid token', async () => {
        const app = buildApp();
        const res = await request(app).post('/api/admin/test').send({ foo: 'bar' });

        expect(res.statusCode).toBe(403);
        expect(res.body.success).toBe(false);
    });

    it('accepts admin mutations with a matching token', async () => {
        const app = buildApp();
        const tokenRes = await request(app).get('/api/csrf-token');
        const token = tokenRes.body.csrfToken;
        const cookie = tokenRes.headers['set-cookie'][0].split(';')[0];

        const res = await request(app)
            .post('/api/admin/test')
            .set('Cookie', cookie)
            .set('X-CSRF-Token', token)
            .send({ foo: 'bar' });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
