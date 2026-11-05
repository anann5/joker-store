const crypto = require('crypto');

jest.mock('bcrypt', () => ({ compare: jest.fn() }));
jest.mock('jsonwebtoken', () => ({
    verify: jest.fn(),
    sign: jest.fn(),
    decode: jest.fn()
}));
jest.mock('../controllers/helpers', () => ({
    createLog: jest.fn(),
    sendTelegramAlert: jest.fn()
}));
jest.mock('../middleware/securityLogger', () => ({ logSecurityEvent: jest.fn() }));
jest.mock('../middleware/totp', () => ({ verifyTotp: jest.fn() }));
jest.mock('../middleware/clientIp', () => ({
    resolveClientIp: jest.fn(() => '203.0.113.5')
}));
jest.mock('../models', () => ({
    AdminSession: {
        findOne: jest.fn(),
        deleteOne: jest.fn().mockResolvedValue({}),
        updateOne: jest.fn().mockResolvedValue({}),
        create: jest.fn()
    },
    User: {}
}));

const jwt = require('jsonwebtoken');
const { AdminSession } = require('../models');
const authController = require('../controllers/authController');

const IP = '203.0.113.5';
const USER_AGENT = 'jest-agent';
const FINGERPRINT = crypto.createHash('sha256').update(`${IP}:${USER_AGENT}`).digest('hex');
const MINUTE = 60 * 1000;

function buildReq() {
    return {
        cookies: { admin_token: 'token-1' },
        headers: { 'user-agent': USER_AGENT },
        ip: IP,
        socket: {}
    };
}

function buildRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.redirect = jest.fn(() => res);
    return res;
}

function sessionWith(lastActivityAt) {
    return { _id: 'session-1', fingerprint: FINGERPRINT, lastActivityAt, createdAt: lastActivityAt };
}

describe('Admin session idle timeout', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jwt.verify.mockReturnValue({ role: 'admin', jti: 'jti-1' });
    });

    it('accepts an admin whose last activity is within 30 minutes', async () => {
        AdminSession.findOne.mockResolvedValue(sessionWith(new Date(Date.now() - 5 * MINUTE)));
        const next = jest.fn();

        await authController.verifyAdminToken(buildReq(), buildRes(), next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(AdminSession.deleteOne).not.toHaveBeenCalled();
    });

    it('rejects and deletes a session idle for more than 30 minutes', async () => {
        AdminSession.findOne.mockResolvedValue(sessionWith(new Date(Date.now() - 31 * MINUTE)));
        const next = jest.fn();
        const res = buildRes();

        await authController.verifyAdminToken(buildReq(), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(AdminSession.deleteOne).toHaveBeenCalledWith({ _id: 'session-1' });
    });

    it('refreshes lastActivityAt when the owner is active', async () => {
        AdminSession.findOne.mockResolvedValue(sessionWith(new Date(Date.now() - 5 * MINUTE)));
        const next = jest.fn();

        await authController.verifyAdminToken(buildReq(), buildRes(), next);

        expect(AdminSession.updateOne).toHaveBeenCalledWith(
            { _id: 'session-1' },
            { $set: { lastActivityAt: expect.any(Date) } }
        );
    });

    it('skips the activity write when it was refreshed less than a minute ago', async () => {
        AdminSession.findOne.mockResolvedValue(sessionWith(new Date(Date.now() - 10 * 1000)));
        const next = jest.fn();

        await authController.verifyAdminToken(buildReq(), buildRes(), next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(AdminSession.updateOne).not.toHaveBeenCalled();
    });

    it('ignores auto-refresh requests when tracking activity', async () => {
        AdminSession.findOne.mockResolvedValue(sessionWith(new Date(Date.now() - 5 * MINUTE)));
        const req = buildReq();
        req.headers['x-admin-auto'] = '1';
        const next = jest.fn();

        await authController.verifyAdminToken(req, buildRes(), next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(AdminSession.updateOne).not.toHaveBeenCalled();
    });

    it('falls back to createdAt for sessions created before the idle field existed', async () => {
        AdminSession.findOne.mockResolvedValue({
            _id: 'session-legacy',
            fingerprint: FINGERPRINT,
            createdAt: new Date(Date.now() - 2 * MINUTE)
        });
        const next = jest.fn();

        await authController.verifyAdminToken(buildReq(), buildRes(), next);

        expect(next).toHaveBeenCalledTimes(1);
    });
});
