const request = require('supertest');
const app = require('../app');

describe('GET /health', () => {
    it('returns an ok status payload', async () => {
        const res = await request(app).get('/health');

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({
            success: true,
            status: 'ok'
        }));
    });
});
