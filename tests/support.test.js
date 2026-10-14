const request = require('supertest');
const express = require('express');
const storeRoutes = require('../routes/storeRoutes');
const { createCaptcha } = require('../middleware/captcha');

const mockTicketSave = jest.fn().mockResolvedValue(true);
const mockTicketFindOne = jest.fn();
const mockTicketCount = jest.fn();
const mockLogSave = jest.fn().mockResolvedValue(true);

// محاكاة كاملة لأنظمة النماذج لكل ما تلمسه storeRoutes في هذه الاختبارات
jest.mock('../models', () => ({
    User: jest.fn(),
    Order: jest.fn(),
    Product: jest.fn(),
    Category: jest.fn(),
    Log: jest.fn().mockImplementation(() => ({ save: mockLogSave })),
    Promotion: jest.fn(),
    CartSession: jest.fn(),
    PushSubscription: jest.fn(),
    SupportTicket: Object.assign(
        jest.fn().mockImplementation((data = {}) => ({ ...data, save: mockTicketSave })),
        {
            findOne: (...args) => ({ select: () => mockTicketFindOne(...args) }),
            find: jest.fn().mockReturnThis(),
            countDocuments: (...args) => mockTicketCount(...args),
            sort: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue([])
        }
    )
}));

const app = express();
app.use(express.json());
app.use('/api', storeRoutes);

// إنشاء تحدي كابتشا صحيح
function solveCaptcha() {
    const { token, prompt } = createCaptcha();
    const parts = prompt.split(' ');
    const a = Number(parts[0]);
    const op = parts[1];
    const b = Number(parts[2]);
    return { token, answer: op === '+' ? a + b : a - b };
}

beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-jwt-secret-for-support';
});

describe('Support tickets (تذاكر الدعم)', () => {
    it('GET /api/security/captcha يقدّم تحدياً', async () => {
        const res = await request(app).get('/api/security/captcha');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.challenge).toBeTruthy();
        expect(res.body.prompt).toMatch(/\d+ [+\-] \d+/);
    });

    it('يرفض إنشاء تذكرة بدون كابتشا', async () => {
        const res = await request(app)
            .post('/api/support/tickets')
            .send({ email: 'a@b.com', subject: 'مشكلة في الطلب', message: 'لم أستلم الكود حتى الآن', lang: 'ar' });
        expect(res.statusCode).toBe(400);
    });

    it('يرفض إنشاء تذكرة بإجابة كابتشا خاطئة', async () => {
        const { token } = createCaptcha();
        const res = await request(app)
            .post('/api/support/tickets')
            .send({ email: 'a@b.com', subject: 'مشكلة في الطلب', message: 'لم أستلم الكود حتى الآن', lang: 'ar', captchaToken: token, captchaAnswer: -5 });
        expect(res.statusCode).toBe(400);
        expect(mockTicketSave).not.toHaveBeenCalled();
    });

    it('ينشئ تذكرة صالحة بكابتشا صحيحة', async () => {
        const { token, answer } = solveCaptcha();
        const res = await request(app)
            .post('/api/support/tickets')
            .send({ email: 'ahmed@example.com', subject: 'مشكلة في الطلب', message: 'لم أستلم الكود حتى الآن', lang: 'ar', captchaToken: token, captchaAnswer: answer });
        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.ticket.ticketId).toMatch(/^TKT-[A-Z0-9]{6}$/);
        expect(mockTicketSave).toHaveBeenCalled();
    });

    it('يعيد بيانات التذكرة عند البحث ببريد+رقم صحيحين', async () => {
        mockTicketFindOne.mockResolvedValue({
            ticketId: 'TKT-ABC123',
            email: 'ahmed@example.com',
            subject: 'استفسار',
            status: 'open',
            messages: [{ from: 'customer', message: 'مرحباً', createdAt: new Date() }],
            createdAt: new Date()
        });
        const res = await request(app)
            .get('/api/support/tickets/TKT-ABC123?email=ahmed@example.com');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.ticket.ticketId).toBe('TKT-ABC123');
    });

    it('يعيد 404 عند عدم تطابق البريد مع التذكرة', async () => {
        mockTicketFindOne.mockResolvedValue(null);
        const res = await request(app)
            .get('/api/support/tickets/TKT-ABC123?email=other@example.com');
        expect(res.statusCode).toBe(404);
    });
});