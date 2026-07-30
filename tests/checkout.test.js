const request = require('supertest');
const express = require('express');
const storeRoutes = require('../routes/storeRoutes');

const app = express();
app.use(express.json());
app.use('/api', storeRoutes);

describe('POST /api/checkout', () => {
    it('should return clientSecret', async () => {
        const res = await request(app)
            .post('/api/checkout')
            .send({
                customerEmail: 'test@example.com',
                cartItems: [
                    { id: '1', name: 'Test Product' },
                ],
                paymentMethod: 'card',
            });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('clientSecret');
    });
});