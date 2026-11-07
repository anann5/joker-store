const bcrypt = require('bcrypt');

jest.mock('../models', () => ({
    User: { findOne: jest.fn() },
    Order: {}
}));
jest.mock('../middleware/securityLogger', () => ({ logSecurityEvent: jest.fn() }));
jest.mock('bcrypt', () => ({ compare: jest.fn() }));
jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'token') }));

const { User } = require('../models');
const userAuthController = require('../controllers/userAuthController');

function makeRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.cookie = jest.fn(() => res);
    res.clearCookie = jest.fn(() => res);
    return res;
}

function makeReq(email, password, ip) {
    return {
        body: { email, password },
        clientIp: ip,
        hostname: 'localhost'
    };
}

function lookupReturning(user) {
    return { select: jest.fn().mockResolvedValue(user) };
}

describe('user login — الحماية من التخمين الموزّع', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        User.findOne.mockReturnValue(lookupReturning(null));
    });

    it('يقفل البريد بعد 20 فشلاً من عناوين IP مختلفة', async () => {
        const email = 'victim@example.com';
        // 20 محاولة فاشلة، كل واحدة من IP مختلف (كل IP أقل من حد 5 الخاص به)
        for (let i = 0; i < 20; i += 1) {
            const res = makeRes();
            await userAuthController.login(makeReq(email, 'wrong-password', `10.0.0.${i}`), res);
            expect(res.status).toHaveBeenCalledWith(401);
        }

        // محاولة إضافية من IP جديد تماماً يجب أن تُرفض بالقفل
        const res = makeRes();
        await userAuthController.login(makeReq(email, 'wrong-password', '10.0.1.99'), res);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('يعيد تصفير العدّاد بعد تسجيل دخول ناجح', async () => {
        const email = 'reset@example.com';
        for (let i = 0; i < 19; i += 1) {
            await userAuthController.login(makeReq(email, 'wrong-password', `10.0.2.${i}`), makeRes());
        }

        // دخول ناجح يُصفّر عدّاد البريد
        User.findOne.mockReturnValue(lookupReturning({ _id: 'u1', email, balance: 0, tokenVersion: 0 }));
        bcrypt.compare.mockResolvedValue(true);
        const successRes = makeRes();
        await userAuthController.login(makeReq(email, 'correct-password', '10.0.3.1'), successRes);
        expect(successRes.status).not.toHaveBeenCalledWith(429);
        expect(successRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

        // فشل واحد بعد النجاح يجب ألا يُفعّل القفل
        User.findOne.mockReturnValue(lookupReturning(null));
        const failRes = makeRes();
        await userAuthController.login(makeReq(email, 'wrong-password', '10.0.4.1'), failRes);
        expect(failRes.status).toHaveBeenCalledWith(401);
    });

    it('يبقي قفل IP+بريد بعد 5 محاولات من نفس العنوان', async () => {
        const email = 'ip@example.com';
        for (let i = 0; i < 5; i += 1) {
            await userAuthController.login(makeReq(email, 'wrong-password', '10.0.5.5'), makeRes());
        }
        const res = makeRes();
        await userAuthController.login(makeReq(email, 'wrong-password', '10.0.5.5'), res);
        expect(res.status).toHaveBeenCalledWith(429);
    });
});
