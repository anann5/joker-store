// اختبارات استعادة كلمة المرور:
//   - طلب الرابط: رد عام دائماً (منع تعداد الحسابات) + توكن مُهشّر وواحد لكل مستخدم
//   - إعادة التعيين: أحادية الاستخدام، منع التوكن المنتهي، ونموذج كلمة مرور قوي
//   - إبطال الجلسات القديمة عبر tokenVersion

process.env.JWT_SECRET = 'test-secret-for-reset';
process.env.JWT_USER_SECRET = 'test-user-secret-for-reset';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

jest.mock('../models', () => ({
    User: {
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
        findById: jest.fn(() => ({ select: jest.fn().mockResolvedValue({ tokenVersion: 0 }) }))
    },
    PasswordResetToken: {
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        findOneAndDelete: jest.fn()
    }
}));

jest.mock('../controllers/notification', () => ({
    sendPasswordResetEmail: jest.fn().mockResolvedValue({ skipped: true, reason: 'email not configured' })
}));

jest.mock('../controllers/helpers', () => ({
    getSafeBaseHost: jest.fn(() => 'localhost:5850')
}));

const userRoutes = require('../routes/userRoutes');
const { User, PasswordResetToken } = require('../models');
const { sendPasswordResetEmail } = require('../controllers/notification');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', userRoutes);

const USER_ID = '507f191e810c19729de860ec';
const RESET_TOKEN = 'a'.repeat(64);

function userToken({ ver = 0, userId = USER_ID } = {}) {
    return jwt.sign({ userId, email: 'user@example.com', ver }, process.env.JWT_USER_SECRET, { expiresIn: '1h' });
}

function mockSessionVersion(version) {
    User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ tokenVersion: version })
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    PasswordResetToken.deleteMany.mockResolvedValue({});
    PasswordResetToken.create.mockResolvedValue({});
    sendPasswordResetEmail.mockResolvedValue({ skipped: true, reason: 'email not configured' });
    mockSessionVersion(0);
});

describe('POST /api/users/forgot-password', () => {
    it('ينشئ توكن مُهشّراً ويرسل البريد لبريد مسجل', async () => {
        User.findOne.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({ _id: USER_ID, email: 'user@example.com' })
            })
        });

        const res = await request(app).post('/api/users/forgot-password').send({ email: 'user@example.com' });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(PasswordResetToken.deleteMany).toHaveBeenCalledWith({ userId: USER_ID });
        expect(PasswordResetToken.create).toHaveBeenCalledTimes(1);

        const created = PasswordResetToken.create.mock.calls[0][0];
        expect(created.userId).toBe(USER_ID);
        expect(created.tokenHash).toMatch(/^[a-f0-9]{64}$/);
        expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now() + 25 * 60 * 1000);

        expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
        const [to, resetUrl] = sendPasswordResetEmail.mock.calls[0];
        expect(to).toBe('user@example.com');
        expect(resetUrl).toMatch(/^https?:\/\/.+\/reset-password\?token=[a-f0-9]{64}$/);
        // التوكن المرسل في الرابط لا يُخزَّن خاماً
        const rawToken = resetUrl.split('token=')[1];
        expect(created.tokenHash).toBe(crypto.createHash('sha256').update(rawToken).digest('hex'));
        expect(created.tokenHash).not.toBe(rawToken);
    });

    it('يرد بنفس الرسالة العامة لبريد غير مسجل دون إنشاء توكن', async () => {
        User.findOne.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            })
        });

        const res = await request(app).post('/api/users/forgot-password').send({ email: 'ghost@example.com' });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('إذا كان هذا البريد مسجلاً');
        expect(PasswordResetToken.create).not.toHaveBeenCalled();
        expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });
});

describe('POST /api/users/reset-password', () => {
    it('يحدّث كلمة المرور ويزيد إصدار الجلسة ويحذف بقية التوكنات', async () => {
        PasswordResetToken.findOneAndDelete.mockResolvedValue({
            userId: USER_ID,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });
        User.findOneAndUpdate.mockResolvedValue({ _id: USER_ID, email: 'user@example.com' });

        const res = await request(app)
            .post('/api/users/reset-password')
            .send({ token: RESET_TOKEN, password: 'NewStrong1' });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);

        expect(PasswordResetToken.findOneAndDelete).toHaveBeenCalledWith({
            tokenHash: crypto.createHash('sha256').update(RESET_TOKEN).digest('hex'),
            expiresAt: { $gt: expect.any(Date) }
        });

        const [filter, update] = User.findOneAndUpdate.mock.calls[0];
        expect(filter).toEqual({ _id: USER_ID });
        expect(update.$set.passwordHash).toMatch(/^\$2[aby]\$/);
        expect(update.$inc.tokenVersion).toBe(1);

        expect(PasswordResetToken.deleteMany).toHaveBeenCalledWith({ userId: USER_ID });
    });

    it('يرفض إعادة استخدام نفس الرابط', async () => {
        PasswordResetToken.findOneAndDelete.mockResolvedValue(null);

        const res = await request(app)
            .post('/api/users/reset-password')
            .send({ token: RESET_TOKEN, password: 'NewStrong1' });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain('غير صالح');
        expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('يرفض كلمة مرور ضعيفة قبل أي عملية في قاعدة البيانات', async () => {
        const res = await request(app)
            .post('/api/users/reset-password')
            .send({ token: RESET_TOKEN, password: 'weakpass' });

        expect(res.statusCode).toBe(400);
        expect(PasswordResetToken.findOneAndDelete).not.toHaveBeenCalled();
        expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('يرفض توكن غير مطابق للنمط', async () => {
        const res = await request(app)
            .post('/api/users/reset-password')
            .send({ token: 'not-a-token', password: 'NewStrong1' });

        expect(res.statusCode).toBe(400);
        expect(PasswordResetToken.findOneAndDelete).not.toHaveBeenCalled();
    });
});

describe('إبطال الجلسات بعد إعادة التعيين', () => {
    it('يعامل توكن إصداره قديم كزائر في المسارات الاختيارية', async () => {
        mockSessionVersion(1);
        const token = userToken({ ver: 0 });

        const res = await request(app)
            .get('/api/users/me')
            .set('Cookie', [`user_token=${token}`]);

        expect(res.statusCode).toBe(200);
        expect(res.body.user).toBeNull();
    });

    it('يرفض توكن إصداره قديم في المسارات المحمية', async () => {
        mockSessionVersion(1);
        User.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue({ tokenVersion: 1 })
        });

        const res = await request(app)
            .get('/api/users/orders')
            .set('Cookie', [`user_token=${userToken({ ver: 0 })}`]);

        expect(res.statusCode).toBe(401);
    });

    it('يقبل توكن إصداره مطابق للإصدار الحالي', async () => {
        mockSessionVersion(2);

        const res = await request(app)
            .get('/api/users/me')
            .set('Cookie', [`user_token=${userToken({ ver: 2 })}`]);

        expect(res.statusCode).toBe(200);
        expect(res.body.user).not.toBeNull();
    });
});
