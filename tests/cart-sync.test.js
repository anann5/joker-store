const userAuthController = require('../controllers/userAuthController');

const mockUserFindById = jest.fn();
const mockUserSave = jest.fn().mockResolvedValue(true);

jest.mock('../models', () => ({
    User: { findById: (...args) => mockUserFindById(...args) },
    Order: {},
    Category: {}
}));

const VALID_ID = '507f191e810c19729de860ea';
const OTHER_VALID_ID = '507f191e810c19729de860eb';

function makeRes() {
    const res = { statusCode: 200, body: null };
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.body = data;
        return res;
    };
    return res;
}

function makeReq(payload) {
    return { body: payload, user: { userId: '507f191e810c19729de860ec' } };
}

// يحاكي كائن استعلام Mongoose: thenable قابل للـ await ويقبل .select()
function queryLike(resolveValue) {
    return { select: () => Promise.resolve(resolveValue) };
}

describe('GET /users/cart (getUserCart)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 401 when not authenticated', async () => {
        const res = makeRes();
        await userAuthController.getUserCart({ body: {} }, res);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ success: false });
    });

    it('returns the stored cart for an authenticated user', async () => {
        const storedUser = { cart: [{ productId: VALID_ID, qty: 2 }] };
        mockUserFindById.mockReturnValue(queryLike(storedUser));
        const req = makeReq({});
        const res = makeRes();

        await userAuthController.getUserCart(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, cart: [{ productId: VALID_ID, qty: 2 }] });
        expect(mockUserFindById).toHaveBeenCalledWith(req.user.userId);
    });

    it('returns an empty cart when the stored cart is missing', async () => {
        mockUserFindById.mockReturnValue(queryLike({ cart: undefined }));
        const res = makeRes();

        await userAuthController.getUserCart(makeReq({}), res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, cart: [] });
    });
});

describe('PUT /users/cart (saveUserCart)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUserSave.mockClear();
    });

    it('returns 401 when not authenticated', async () => {
        const res = makeRes();
        await userAuthController.saveUserCart({ body: {} }, res);

        expect(res.statusCode).toBe(401);
    });

    it('rejects a cart larger than MAX_CART_ITEMS', async () => {
        const bigCart = Array.from({ length: 201 }, (_, i) => ({ id: VALID_ID, qty: 1 }));

        mockUserFindById.mockResolvedValue({ cart: [], save: mockUserSave });
        const res = makeRes();

        await userAuthController.saveUserCart(makeReq({ cart: bigCart }), res);

        expect(res.statusCode).toBe(400);
        expect(mockUserFindById).not.toHaveBeenCalled();
    });

    it('drops invalid ids, dedupes, and clamps quantities', async () => {
        const user = { cart: [], save: mockUserSave };
        mockUserFindById.mockResolvedValue(user);
        const res = makeRes();

        await userAuthController.saveUserCart(makeReq({ cart: [
            { id: VALID_ID, qty: 1000 },
            { id: VALID_ID, qty: 1 },
            { id: 'not-a-valid-id', qty: 5 },
            { id: OTHER_VALID_ID, qty: -2 },
            { id: OTHER_VALID_ID, qty: 7 }
        ] }), res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true });
        expect(user.cart).toEqual([
            { productId: VALID_ID, qty: 99 },
            { productId: OTHER_VALID_ID, qty: 1 }
        ]);
        expect(mockUserSave).toHaveBeenCalledTimes(1);
    });

    it('stores an empty array when no valid items are provided', async () => {
        const user = { cart: [], save: mockUserSave };
        mockUserFindById.mockResolvedValue(user);
        const res = makeRes();

        await userAuthController.saveUserCart(makeReq({ cart: [] }), res);

        expect(res.statusCode).toBe(200);
        expect(user.cart).toEqual([]);
        expect(mockUserSave).toHaveBeenCalledTimes(1);
    });
});