const request = require('supertest');
const express = require('express');

const mockSendEach = jest.fn();

jest.mock('firebase-admin', () => ({
    initializeApp: jest.fn(() => ({ messaging: () => ({ sendEachForMulticast: mockSendEach }) })),
    credential: { cert: jest.fn((c) => c) }
}), { virtual: true });

function mockMakeModel() {
    return {
        findById: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateMany: jest.fn(),
        updateOne: jest.fn(),
        deleteOne: jest.fn(),
        deleteMany: jest.fn(),
        countDocuments: jest.fn(),
        estimatedDocumentCount: jest.fn()
    };
}

const mockFcmToken = mockMakeModel();

jest.mock('../models', () => ({
    FcmToken: mockFcmToken,
    StockAlert: mockMakeModel(),
    PushSubscription: mockMakeModel(),
    Product: mockMakeModel(),
    CartSession: mockMakeModel(),
    Order: {},
    User: {},
    Category: {},
    Promotion: {},
    Log: {},
    SupportTicket: {},
    ProviderSyncState: {},
    AdminSession: {}
}));

const FAKE_SVC = JSON.stringify({
    type: 'service_account',
    project_id: 'joker-test',
    client_email: 'test@joker-test.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n'
});

const storeRoutes = require('../routes/storeRoutes');
const fcm = require('../controllers/fcm');

const app = express();
app.use(express.json());
app.use('/api', storeRoutes);

beforeEach(() => {
    jest.clearAllMocks();
    process.env.FIREBASE_SERVICE_ACCOUNT = FAKE_SVC;
});

afterEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
});

describe('FCM wiring', () => {
    it('is disabled without service account', () => {
        delete process.env.FIREBASE_SERVICE_ACCOUNT;
        expect(fcm.isFcmEnabled()).toBe(false);
    });

    it('is enabled with a valid service account', () => {
        expect(fcm.isFcmEnabled()).toBe(true);
    });

    it('registers a token via POST /api/push/fcm-token (201)', async () => {
        mockFcmToken.findOneAndUpdate.mockResolvedValue({ createdAt: new Date('2026-01-01') });
        const res = await request(app)
            .post('/api/push/fcm-token')
            .send({ token: 'fcm-device-token-1234567890', lang: 'ar' });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(mockFcmToken.findOneAndUpdate).toHaveBeenCalledWith(
            { token: 'fcm-device-token-1234567890' },
            expect.objectContaining({ $set: expect.objectContaining({ lang: 'ar' }) }),
            expect.objectContaining({ upsert: true })
        );
    });

    it('rejects short tokens (400)', async () => {
        const res = await request(app)
            .post('/api/push/fcm-token')
            .send({ token: 'short' });
        expect(res.status).toBe(400);
    });

    it('sends to tokens and deletes dead ones', async () => {
        const docs = [
            { _id: 't1', token: 'good-token', lang: 'ar', failedCount: 0 },
            { _id: 't2', token: 'dead-token', lang: 'ar', failedCount: 0 }
        ];
        mockSendEach.mockResolvedValue({
            responses: [
                { success: true },
                { success: false, error: { code: 'messaging/registration-token-not-registered' } }
            ]
        });
        mockFcmToken.updateOne.mockResolvedValue({});
        mockFcmToken.deleteOne.mockResolvedValue({});
        const messages = { ar: { title: 'A', body: 'B' }, en: { title: 'C', body: 'D' } };
        const result = await fcm.sendToTokens(docs, messages, { url: '/offers', tag: 't1' });
        expect(result).toEqual({ sent: 1, deleted: 1, failed: 0 });
        expect(mockSendEach).toHaveBeenCalledTimes(1);
        const payload = mockSendEach.mock.calls[0][0];
        expect(payload.tokens).toEqual(['good-token', 'dead-token']);
        expect(payload.notification.title).toBe('A');
        expect(payload.data).toEqual({ url: '/offers', tag: 't1' });
        expect(mockFcmToken.deleteOne).toHaveBeenCalledWith({ _id: 't2' });
    });

    it('bumps failedCount on transient errors', async () => {
        mockSendEach.mockResolvedValue({
            responses: [{ success: false, error: { code: 'messaging/internal-error' } }]
        });
        mockFcmToken.updateOne.mockResolvedValue({});
        const result = await fcm.sendToTokens(
            [{ _id: 't3', token: 'flaky', lang: 'ar', failedCount: 0 }],
            { ar: { title: 'A', body: 'B' } },
            {}
        );
        expect(result).toEqual({ sent: 0, deleted: 0, failed: 1 });
        expect(mockFcmToken.updateOne).toHaveBeenCalledWith(
            { _id: 't3' },
            expect.objectContaining({ $inc: { failedCount: 1 } })
        );
    });

    it('sendToTokensAndUsers resolves tokens and reports coverage', async () => {
        mockFcmToken.find.mockReturnValue({
            select: () => ({ lean: async () => [{ _id: 'a', token: 'tok-1', lang: 'ar', failedCount: 0 }] })
        });
        mockSendEach.mockResolvedValue({ responses: [{ success: true }] });
        mockFcmToken.updateOne.mockResolvedValue({});
        const result = await fcm.sendToTokensAndUsers({
            tokens: ['tok-1', 'tok-unknown'],
            userIds: [],
            messages: { ar: { title: 'A', body: 'B' } },
            url: '/',
            tag: 'x'
        });
        expect(result.sent).toBe(1);
        expect(result.covered).toEqual(new Set(['tok-1']));
    });

    it('does nothing when disabled', async () => {
        delete process.env.FIREBASE_SERVICE_ACCOUNT;
        const result = await fcm.sendToTokens(
            [{ _id: 't', token: 'x', lang: 'ar', failedCount: 0 }],
            { ar: { title: 'A', body: 'B' } },
            {}
        );
        expect(result).toEqual({ sent: 0, deleted: 0, failed: 0 });
        expect(mockSendEach).not.toHaveBeenCalled();
    });
});
