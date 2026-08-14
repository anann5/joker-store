const request = require('supertest');
const app = require('../app');

describe('Admin API authentication', () => {
    const protectedRoutes = [
        ['/api/admin/dashboard', 'GET'],
        ['/api/admin/inventory', 'GET'],
        ['/api/admin/orders', 'GET'],
        ['/api/admin/categories', 'GET'],
        ['/api/admin/logs', 'GET'],
        ['/api/admin/balances', 'GET']
    ];

    protectedRoutes.forEach(([path, method]) => {
        it(`rejects unauthenticated ${method} ${path}`, async () => {
            const res = await request(app)[method.toLowerCase()](path);

            expect([401, 403]).toContain(res.statusCode);
        });
    });

    it('rejects a request with an invalid token', async () => {
        const res = await request(app)
            .get('/api/admin/dashboard')
            .set('Authorization', 'Bearer invalid.token.here');

        expect(res.statusCode).toBe(401);
    });

    it('does not serve admin.js without a valid token', async () => {
        const res = await request(app).get('/admin.js');

        expect([401, 403]).toContain(res.statusCode);
    });

    it('redirects unauthenticated requests for the admin page to login', async () => {
        const res = await request(app).get('/admin').redirects(0);

        expect([301, 302, 303, 307, 308]).toContain(res.statusCode);
        expect(res.headers.location).toContain('/login.html');
    });
});
