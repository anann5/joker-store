// اختبارات في التعامل مع اشتراكات إشعارات Web Push:
//   1) نقاط نهاية المتجر (vapid-public-key / subscribe / unsubscribe) عبر supertest
//   2) خدمة الإرسال broadcast و notifyOrderStatus مع محاكاة web-push
//   3) سلوك الأجهزة الميتة (404/410 → حذف) والفشل المؤقت (5xx → failedCount++)
const request = require('supertest');
const express = require('express');

// تفعيل الإشعارات افتراضياً قبل تحميل الوحدات (تُقرأ الثوابت عند الاستيراد)
process.env.VAPID_PUBLIC_KEY = 'test-public-key-value';
process.env.VAPID_PRIVATE_KEY = 'test-private-key-value';
process.env.PUSH_NOTIFICATIONS_ENABLED = 'true';

jest.mock('web-push', () => ({
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn().mockResolvedValue({}),
    generateVAPIDKeys: jest.fn(() => ({ publicKey: 'pub', privateKey: 'priv' }))
}));

jest.mock('../models', () => ({
    PushSubscription: {
        findOneAndUpdate: jest.fn(),
        deleteOne: jest.fn(),
        find: jest.fn(),
        countDocuments: jest.fn(),
        estimatedDocumentCount: jest.fn(),
        updateOne: jest.fn(),
        deleteMany: jest.fn()
    }
}));

const { PushSubscription } = require('../models');
const webPush = require('web-push');

const app = express();
app.use(express.json());
app.use('/api', require('../routes/storeRoutes'));

const VALID_SUBSCRIPTION = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/dGhpc0lzQVRlc3RVcmw6U2VjcmV0',
    keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7Dk', auth: '8p8pQH2X3fZmOFL4PjxFzg' }
};

describe('Push endpoints (storefront)', () => {
    it('يكشف المفتاح العام عند تفعيل الإشعارات', async () => {
        const res = await request(app).get('/api/push/vapid-public-key');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.enabled).toBe(true);
        expect(res.body.publicKey).toBe('test-public-key-value');
    });

    it('يسجّل اشتراكاً صالحاً ويُعيد 201', async () => {
        PushSubscription.findOneAndUpdate.mockResolvedValue({ createdAt: new Date('2026-01-01') });
        const res = await request(app)
            .post('/api/push/subscribe')
            .send({ ...VALID_SUBSCRIPTION, lang: 'ar', userAgent: 'Jest' });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(PushSubscription.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ endpoint: VALID_SUBSCRIPTION.endpoint }),
            expect.objectContaining({ $set: expect.objectContaining({ lang: 'ar' }) }),
            expect.objectContaining({ upsert: true })
        );
    });

    it('يرفض اشتراكاً ناقص المفاتيح (400)', async () => {
        const res = await request(app)
            .post('/api/push/subscribe')
            .send({ endpoint: VALID_SUBSCRIPTION.endpoint, keys: { p256dh: 'x' } });
        expect(res.status).toBe(400);
    });

    it('يُبطل اشتراكاً بصالح (200)', async () => {
        PushSubscription.deleteOne.mockResolvedValue({ deletedCount: 1 });
        const res = await request(app).post('/api/push/unsubscribe').send({ endpoint: VALID_SUBSCRIPTION.endpoint });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(PushSubscription.deleteOne).toHaveBeenCalledWith({ endpoint: VALID_SUBSCRIPTION.endpoint });
    });

    it('يرفض إبطالاً بنطاق غير صالح (400)', async () => {
        const res = await request(app).post('/api/push/unsubscribe').send({ endpoint: 'not-a-url' });
        expect(res.status).toBe(400);
    });
});

describe('Push service — sendToSubscriptions/broadcast', () => {
    let push;

    beforeAll(() => {
        push = require('../controllers/push');
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    const sub = { _id: 'sub1', endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' }, lang: 'ar', failedCount: 0 };
    const messages = { ar: { title: 'عرض', body: 'جديد' }, en: { title: 'Deal', body: 'New' } };

    it('broadcast يرسل لكل المشتركين باللغة المناسبة ويصفّر الفشل على النجاح', async () => {
        PushSubscription.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([sub]) });
        const result = await push.broadcast(messages, '/offers', 'test');
        expect(result).toEqual({ sent: 1, deleted: 0, failed: 0, skipped: false, total: 1 });
        expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(webPush.sendNotification.mock.calls[0][1]);
        expect(payload.title).toBe('عرض');
        expect(payload.url).toBe('/offers');
        expect(PushSubscription.updateOne).toHaveBeenCalledWith({ _id: 'sub1' }, expect.objectContaining({ $set: expect.objectContaining({ failedCount: 0 }) }));
    });

    it('يختار اللغة الإنجليزية عندما يكون lang=en', async () => {
        PushSubscription.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ ...sub, lang: 'en' }]) });
        await push.broadcast(messages, '/', 't');
        const payload = JSON.parse(webPush.sendNotification.mock.calls[0][1]);
        expect(payload.title).toBe('Deal');
    });

    it('يحذف الاشتراك عند 404 (الجهاز أزال الإذن)', async () => {
        PushSubscription.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([sub]) });
        const err404 = new Error('gone'); err404.statusCode = 404;
        webPush.sendNotification.mockRejectedValueOnce(err404);
        const result = await push.broadcast(messages, '/', 't');
        expect(result).toEqual({ sent: 0, deleted: 1, failed: 0, skipped: false, total: 1 });
        expect(PushSubscription.deleteOne).toHaveBeenCalledWith({ _id: 'sub1' });
    });

    it('يرفع failedCount عند فشل مؤقت 500 ولا يحذف', async () => {
        PushSubscription.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([sub]) });
        const err500 = new Error('boom'); err500.statusCode = 500;
        webPush.sendNotification.mockRejectedValueOnce(err500);
        const result = await push.broadcast(messages, '/', 't');
        expect(result).toEqual({ sent: 0, deleted: 0, failed: 1, skipped: false, total: 1 });
        expect(PushSubscription.updateOne).toHaveBeenCalledWith({ _id: 'sub1' }, expect.objectContaining({ $inc: { failedCount: 1 } }));
    });

    it('notifyOrderStatus يرسل لمالك الطلب عند الاكتمال فقط', async () => {
        const completed = { orderId: 'ORD123', userId: 'u1', status: 'completed' };
        PushSubscription.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ ...sub, userId: 'u1' }]) });
        const result = await push.notifyOrderStatus(completed);
        expect(result.skipped).toBe(false);
        expect(PushSubscription.find).toHaveBeenCalledWith({ userId: 'u1' });
        expect(JSON.parse(webPush.sendNotification.mock.calls[0][1]).title).toContain('اكتمل');
    });

    it('notifyOrderStatus يتجاهل حالة pending', async () => {
        const pending = { orderId: 'ORD123', userId: 'u1', status: 'pending' };
        const result = await push.notifyOrderStatus(pending);
        expect(result.skipped).toBe(true);
        expect(PushSubscription.find).not.toHaveBeenCalled();
    });

    it('notifyOrderStatus يتجاهل الطلبات المجهولة (بدون userId)', async () => {
        const anon = { orderId: 'ORD123', status: 'completed' };
        const result = await push.notifyOrderStatus(anon);
        expect(result.skipped).toBe(true);
    });
});

describe('Push service — معطّل بدون مفاتيح VAPID', () => {
    let push;

    beforeAll(() => {
        const savedPublic = process.env.VAPID_PUBLIC_KEY;
        const savedPrivate = process.env.VAPID_PRIVATE_KEY;
        delete process.env.VAPID_PUBLIC_KEY;
        delete process.env.VAPID_PRIVATE_KEY;
        jest.resetModules();
        push = require('../controllers/push');
        process.env.VAPID_PUBLIC_KEY = savedPublic;
        process.env.VAPID_PRIVATE_KEY = savedPrivate;
    });

    it('broadcast يُعيد skipped عندما تكون الإشعارات معطّلة', async () => {
        const result = await push.broadcast({ ar: { title: 'x', body: '' } }, '/', 't');
        expect(result.skipped).toBe(true);
        expect(webPush.sendNotification).not.toHaveBeenCalled();
    });
});