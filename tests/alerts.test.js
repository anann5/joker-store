const request = require('supertest');
const express = require('express');

// Mongoose-style chainable query stubs.
const qSelect = (v) => ({ select: async () => v });
const qOne = (v) => ({ select: () => ({ lean: async () => v }) });
const qFind = (v) => ({ lean: async () => v });
const qFindSelect = (v) => ({ select: () => ({ lean: async () => v }) });
const qFindLimit = (v) => ({ limit: () => ({ lean: async () => v }) });

function makeModel() {
    return {
        findById: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateMany: jest.fn(),
        updateOne: jest.fn(),
        countDocuments: jest.fn()
    };
}

const mockStockAlert = makeModel();
const mockPushSubscription = makeModel();
const mockProduct = makeModel();
const mockCartSession = makeModel();
const mockSendToSubscriptions = jest.fn();
const mockSendAbandonedCartEmail = jest.fn();

jest.mock('../models', () => ({
    StockAlert: mockStockAlert,
    PushSubscription: mockPushSubscription,
    Product: mockProduct,
    CartSession: mockCartSession,
    Order: {},
    User: {},
    Category: {},
    Promotion: {},
    Log: {},
    SupportTicket: {},
    ProviderSyncState: {},
    AdminSession: {}
}));

jest.mock('../controllers/push', () => ({
    sendToSubscriptions: (...args) => mockSendToSubscriptions(...args)
}));

jest.mock('../controllers/notification', () => ({
    sendAbandonedCartEmail: (...args) => mockSendAbandonedCartEmail(...args)
}));

const storeRoutes = require('../routes/storeRoutes');
const alertsController = require('../controllers/alertsController');
const helpers = require('../controllers/helpers');

const app = express();
app.use(express.json());
app.use('/api', storeRoutes);

const PRODUCT_ID = '507f191e810c19729de860ea';
const ENDPOINT = 'https://fcm.googleapis.com/fake-endpoint-for-tests-1234567890';

beforeEach(() => {
    jest.clearAllMocks();
});

describe('POST /api/products/:productId/notify', () => {
    it('subscribes with a push endpoint (201)', async () => {
        mockProduct.findById.mockReturnValue(qSelect({ _id: PRODUCT_ID }));
        mockStockAlert.findOneAndUpdate.mockResolvedValue({ _id: 'alert1' });
        const res = await request(app)
            .post(`/api/products/${PRODUCT_ID}/notify`)
            .send({ endpoint: ENDPOINT, lang: 'ar' });
        expect(res.status).toBe(201);
        expect(res.body).toEqual({ success: true, subscribed: true });
        expect(mockStockAlert.findOneAndUpdate).toHaveBeenCalledWith(
            { productId: PRODUCT_ID, endpoint: ENDPOINT },
            expect.objectContaining({ $set: expect.objectContaining({ status: 'pending' }) }),
            expect.objectContaining({ upsert: true })
        );
    });

    it('treats duplicate-key races as already subscribed (200)', async () => {
        mockProduct.findById.mockReturnValue(qSelect({ _id: PRODUCT_ID }));
        const dup = new Error('duplicate');
        dup.code = 11000;
        mockStockAlert.findOneAndUpdate.mockRejectedValue(dup);
        const res = await request(app)
            .post(`/api/products/${PRODUCT_ID}/notify`)
            .send({ endpoint: ENDPOINT });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, subscribed: true });
    });

    it('rejects invalid product id (400)', async () => {
        const res = await request(app)
            .post('/api/products/not-an-id/notify')
            .send({ endpoint: ENDPOINT });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('rejects when neither endpoint nor user is present (400)', async () => {
        const res = await request(app)
            .post(`/api/products/${PRODUCT_ID}/notify`)
            .send({ lang: 'ar' });
        expect(res.status).toBe(400);
    });

    it('returns 404 for unknown product', async () => {
        mockProduct.findById.mockReturnValue(qSelect(null));
        const res = await request(app)
            .post(`/api/products/${PRODUCT_ID}/notify`)
            .send({ endpoint: ENDPOINT });
        expect(res.status).toBe(404);
    });
});

describe('GET /api/products/:productId/notify', () => {
    it('reports subscribed=true when a pending alert exists', async () => {
        mockStockAlert.findOne.mockReturnValue(qOne({ _id: 'a1' }));
        const res = await request(app)
            .get(`/api/products/${PRODUCT_ID}/notify`)
            .query({ endpoint: ENDPOINT });
        expect(res.body).toEqual({ success: true, subscribed: true });
    });

    it('reports subscribed=false otherwise', async () => {
        mockStockAlert.findOne.mockReturnValue(qOne(null));
        const res = await request(app)
            .get(`/api/products/${PRODUCT_ID}/notify`)
            .query({ endpoint: ENDPOINT });
        expect(res.body).toEqual({ success: true, subscribed: false });
    });
});

describe('DELETE /api/products/:productId/notify', () => {
    it('cancels pending alerts', async () => {
        mockStockAlert.updateMany.mockResolvedValue({ modifiedCount: 1 });
        const res = await request(app)
            .delete(`/api/products/${PRODUCT_ID}/notify`)
            .send({ endpoint: ENDPOINT });
        expect(res.body).toEqual({ success: true, subscribed: false });
        expect(mockStockAlert.updateMany).toHaveBeenCalledWith(
            { productId: PRODUCT_ID, endpoint: ENDPOINT, status: 'pending' },
            expect.anything()
        );
    });
});

describe('fireStockAlerts', () => {
    const product = {
        _id: PRODUCT_ID,
        productName: { ar: 'بطاقة اختبار', en: 'Test card' }
    };

    it('sends push and marks covered alerts notified', async () => {
        mockStockAlert.find.mockReturnValue(qFind([
            { _id: 'a1', endpoint: ENDPOINT, userId: null },
            { _id: 'a2', endpoint: null, userId: null }
        ]));
        mockPushSubscription.find.mockReturnValue(qFindSelect([
            { endpoint: ENDPOINT, keys: { p256dh: 'x', auth: 'y' }, lang: 'ar', failedCount: 0 }
        ]));
        mockSendToSubscriptions.mockResolvedValue({ sent: 1, deleted: 0, failed: 0 });
        const result = await alertsController.fireStockAlerts(product);
        expect(mockSendToSubscriptions).toHaveBeenCalledTimes(1);
        const payload = mockSendToSubscriptions.mock.calls[0][0];
        expect(payload.url).toBe(`/product/${PRODUCT_ID}`);
        expect(payload.tag).toBe(`stock-${PRODUCT_ID}`);
        expect(mockStockAlert.updateMany).toHaveBeenCalledWith(
            { _id: { $in: ['a1'] } },
            expect.objectContaining({ $set: expect.objectContaining({ status: 'notified' }) })
        );
        expect(result).toEqual({ fired: 1, sent: 1 });
    });

    it('does nothing when there are no pending alerts', async () => {
        mockStockAlert.find.mockReturnValue(qFind([]));
        const result = await alertsController.fireStockAlerts(product);
        expect(mockSendToSubscriptions).not.toHaveBeenCalled();
        expect(result).toEqual({ fired: 0 });
    });
});

describe('trackCartSession stores pushEndpoint', () => {
    it('persists a valid endpoint on upsert', async () => {
        mockCartSession.findOneAndUpdate.mockResolvedValue({});
        const res = await request(app)
            .post('/api/cart/track')
            .send({
                items: [{ productId: PRODUCT_ID, productName: 'x', qty: 1, price: 10 }],
                email: null,
                total: 10,
                pushEndpoint: ENDPOINT
            });
        expect(res.body.success).toBe(true);
        const update = mockCartSession.findOneAndUpdate.mock.calls[0][1];
        expect(update.pushEndpoint).toBe(ENDPOINT);
    });

    it('omits overlong endpoints', async () => {
        mockCartSession.findOneAndUpdate.mockResolvedValue({});
        await request(app)
            .post('/api/cart/track')
            .send({
                items: [{ productId: PRODUCT_ID, productName: 'x', qty: 1, price: 10 }],
                total: 10,
                pushEndpoint: `https://${'e'.repeat(700)}`
            });
        const update = mockCartSession.findOneAndUpdate.mock.calls[0][1];
        expect(update.pushEndpoint).toBeUndefined();
    });
});

describe('checkAbandonedCarts push path', () => {
    it('sends a push reminder for endpoint-only carts', async () => {
        const cart = {
            _id: 'cart1',
            email: null,
            pushEndpoint: ENDPOINT,
            items: [{ productName: 'x', qty: 2, price: 5 }],
            total: 10
        };
        mockCartSession.find.mockReturnValue(qFindLimit([cart]));
        mockPushSubscription.findOne.mockReturnValue(qOne({
            endpoint: ENDPOINT, keys: { p256dh: 'x', auth: 'y' }, lang: 'ar', failedCount: 0
        }));
        mockSendToSubscriptions.mockResolvedValue({ sent: 1, deleted: 0, failed: 0 });
        const result = await helpers.checkAbandonedCarts();
        expect(mockSendAbandonedCartEmail).not.toHaveBeenCalled();
        expect(mockSendToSubscriptions).toHaveBeenCalledTimes(1);
        expect(mockCartSession.updateOne).toHaveBeenCalledWith(
            { _id: 'cart1' },
            { $set: { notified: true } }
        );
        expect(result).toEqual({ checked: 1, sent: 1 });
    });

    it('keeps email path working', async () => {
        const cart = { _id: 'cart2', email: 'a@b.c', pushEndpoint: null, items: [], total: 0 };
        mockCartSession.find.mockReturnValue(qFindLimit([cart]));
        mockSendAbandonedCartEmail.mockResolvedValue({ skipped: false });
        const result = await helpers.checkAbandonedCarts();
        expect(mockSendAbandonedCartEmail).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ checked: 1, sent: 1 });
    });
});
