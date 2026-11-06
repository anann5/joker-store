const request = require('supertest');
const express = require('express');

const mockNotice = {
    create: jest.fn(),
    find: jest.fn()
};

jest.mock('../models', () => ({
    Notice: mockNotice,
    FcmToken: { find: jest.fn(), estimatedDocumentCount: jest.fn() },
    StockAlert: {},
    PushSubscription: { find: jest.fn(), countDocuments: jest.fn(), estimatedDocumentCount: jest.fn() },
    Product: {},
    CartSession: {},
    Order: {},
    User: {},
    Category: {},
    Promotion: {},
    Log: {},
    SupportTicket: {},
    ProviderSyncState: {},
    AdminSession: {}
}));

const notices = require('../controllers/notices');
const storeRoutes = require('../routes/storeRoutes');

const app = express();
app.use(express.json());
app.use('/api', storeRoutes);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('notices service', () => {
    it('يحفظ نص البث باللغتين مع الرابط ذا الصلة', async () => {
        mockNotice.create.mockResolvedValue({ _id: 'n1' });
        const messages = {
            ar: { title: 'عرض جديد', body: 'خصم 20%' },
            en: { title: 'New offer', body: '20% off' }
        };
        const doc = await notices.record({ messages, url: '/offers', tag: 'promo-1' });
        expect(doc._id).toBe('n1');
        expect(mockNotice.create).toHaveBeenCalledWith({
            title: { ar: 'عرض جديد', en: 'New offer' },
            body: { ar: 'خصم 20%', en: '20% off' },
            url: '/offers',
            tag: 'promo-1'
        });
    });

    it('يعيد null بلا عنوان عربي ولا يكتب في القاعدة', async () => {
        const doc = await notices.record({ messages: { en: { title: 'Offer' } } });
        expect(doc).toBeNull();
        expect(mockNotice.create).not.toHaveBeenCalled();
    });

    it('يرفض الروابط الخارجية وjavascript: والبروتوكول المزدوج', () => {
        expect(notices.safeLink('https://evil.example')).toBe('');
        expect(notices.safeLink('//evil.example')).toBe('');
        expect(notices.safeLink('javascript:alert(1)')).toBe('');
        expect(notices.safeLink('/offers')).toBe('/offers');
        expect(notices.safeLink('')).toBe('');
    });

    it('يعرض القائمة باللغة المطلوبة مع الاحتياطي العربي', async () => {
        const createdAt = new Date('2026-11-07T10:00:00Z');
        mockNotice.find.mockReturnValue({
            sort: () => ({
                limit: () => ({
                    lean: async () => ([
                        { _id: 'n1', title: { ar: 'عرض', en: '' }, body: { ar: 'نص', en: '' }, url: '/offers', createdAt },
                        { _id: 'n2', title: { ar: 'تنبيه', en: 'Alert' }, body: { ar: 'تفاصيل', en: 'Details' }, url: '', createdAt }
                    ])
                })
            })
        });
        const items = await notices.list('en');
        expect(items[0]).toEqual({ id: 'n1', title: 'عرض', body: 'نص', url: '/offers', createdAt });
        expect(items[1].title).toBe('Alert');
        expect(items[1].body).toBe('Details');
        const arabic = await notices.list('ar');
        expect(arabic[1].title).toBe('تنبيه');
    });
});

describe('GET /api/notifications', () => {
    it('يعيد عناصر مركز الإشعارات', async () => {
        mockNotice.find.mockReturnValue({
            sort: () => ({ limit: () => ({ lean: async () => ([{ _id: 'n1', title: { ar: 'عرض' }, body: { ar: 'نص' }, url: '', createdAt: new Date() }]) }) })
        });
        const res = await request(app).get('/api/notifications?lang=ar');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].title).toBe('عرض');
    });

    it('يعيد 500 عند فشل القاعدة', async () => {
        mockNotice.find.mockImplementation(() => { throw new Error('db down'); });
        const res = await request(app).get('/api/notifications');
        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });
});