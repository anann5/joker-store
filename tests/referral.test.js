const userAuthController = require('../controllers/userAuthController');

const mockUpdateOne = jest.fn();
const mockLogSave = jest.fn().mockResolvedValue(true);

const REFERRER_ID = '507f191e810c19729de860eb';

// سيناريو يتحكم بنتائج User.findOne
let scenario = { duplicateEmail: false, referrerByCode: {} };

jest.mock('../models', () => ({
    User: jest.fn().mockImplementation((data = {}) => {
        const instance = {
            ...data,
            balance: data.balance || 0,
            referralCode: data.referralCode || null,
            referralHistory: data.referralHistory || [],
            save: jest.fn(async function () {
                if (!this._id) this._id = '507f191e810c19729de860ea';
                return this;
            })
        };
        return instance;
    }),
    Order: {},
    Log: jest.fn().mockImplementation(() => ({ save: mockLogSave })),
    Category: {},
    Product: {},
    Promotion: {},
    CartSession: {},
    PushSubscription: {},
    SupportTicket: {},
    AdminSession: {}
}));

const { User } = require('../models');
User.updateOne = mockUpdateOne;
// findOne → كائن قابل للـ await ولسلسلة .select().lean()
User.findOne = jest.fn((query) => {
    const resolveValue = async () => {
        if (query.email) {
            if (scenario.duplicateEmail) return { _id: 'x', email: query.email };
            return null;
        }
        if (query.referralCode) {
            const ref = scenario.referrerByCode[String(query.referralCode).toUpperCase()];
            return ref || null;
        }
        return null;
    };
    const chain = {
        select: () => chain,
        lean: () => resolveValue(),
        then: (resolve) => resolveValue().then(resolve)
    };
    return chain;
});

const WEAK_PASSWORD = 'StrongPass123';

function makeRes() {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.body = data; return res; };
    return res;
}

const makeReq = (body = {}) => ({
    body,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    hostname: 'localhost'
});

const lastCreatedUser = () => User.mock.results[User.mock.results.length - 1].value;

describe('Referral (نظام الإحالة)', () => {
    const REFERRER = { _id: REFERRER_ID, email: 'referrer@example.com' };

    beforeEach(() => {
        jest.clearAllMocks();
        scenario = { duplicateEmail: false, referrerByCode: { JOKER5: REFERRER } };
        process.env.REFERRAL_REWARD = '5';
        process.env.REFERRAL_WELCOME = '2';
    });

    it('يسجل مستخدم بكود إحالة: رصيد للمُحيل ومكافأة ترحيبية للمحال', async () => {
        const res = makeRes();
        await userAuthController.register(makeReq({ email: 'new@example.com', password: WEAK_PASSWORD, referralCode: 'joker5' }), res);

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);

        expect(mockUpdateOne).toHaveBeenCalledWith(
            { _id: REFERRER_ID },
            expect.objectContaining({
                $inc: expect.objectContaining({ balance: 5, referralEarned: 5, referralCount: 1 })
            })
        );

        const created = lastCreatedUser();
        expect(created.balance).toBe(2);
        expect(created.referralCode).toBeTruthy();
        expect(created.referralHistory).toHaveLength(1);
        expect(created.referralHistory[0].type).toBe('welcome');
    });

    it('يرفض كود إحالة غير موجود', async () => {
        scenario.referrerByCode = {};
        const res = makeRes();
        await userAuthController.register(makeReq({ email: 'b@example.com', password: WEAK_PASSWORD, referralCode: 'GHOST99' }), res);

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(mockUpdateOne).not.toHaveBeenCalled();
    });

    it('يرفض استخدام كود الإحالة الخاص بالبريد نفسه', async () => {
        scenario.referrerByCode = { SELF123: { _id: 'y', email: 'me@example.com' } };
        const res = makeRes();
        await userAuthController.register(makeReq({ email: 'me@example.com', password: WEAK_PASSWORD, referralCode: 'SELF123' }), res);

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('يسمح بالتسجيل العادي بدون كود إحالة', async () => {
        const res = makeRes();
        await userAuthController.register(makeReq({ email: 'plain@example.com', password: WEAK_PASSWORD }), res);

        expect(res.statusCode).toBe(201);
        expect(User.findOne).toHaveBeenCalled();
        expect(mockUpdateOne).not.toHaveBeenCalled();
        expect(lastCreatedUser().balance).toBe(0);
    });

    it('يكرر إنشاء الكود عند التصادم النادر (findOne يرجع null دائماً للأكواد العشوائية)', async () => {
        const res = makeRes();
        await userAuthController.register(makeReq({ email: 'unique@example.com', password: WEAK_PASSWORD }), res);
        expect(res.statusCode).toBe(201);
        expect(lastCreatedUser().referralCode).toMatch(/^[A-Z2-9]{6}$/);
    });
});