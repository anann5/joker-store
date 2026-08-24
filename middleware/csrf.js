const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CSRF_TOKENS = 10000;
const csrfTokens = new Map();

// Periodic cleanup of expired CSRF tokens to prevent unbounded memory growth.
setInterval(() => {
    const now = Date.now();
    csrfTokens.forEach((expiresAt, token) => {
        if (expiresAt <= now) csrfTokens.delete(token);
    });
}, 60 * 60 * 1000).unref();

function issueToken(req, res) {
    if (csrfTokens.size >= MAX_CSRF_TOKENS) {
        return res.status(503).json({ success: false, message: 'Too many tokens, try later' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const cookieOptions = {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: TOKEN_TTL_MS / 1000
    };

    csrfTokens.set(token, Date.now() + TOKEN_TTL_MS);
    res.cookie(CSRF_COOKIE_NAME, token, cookieOptions);
    res.json({ success: true, csrfToken: token });
}

function validate(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return next();
    }

    if (req.path === '/login') {
        return next();
    }

    const token = req.get(CSRF_HEADER_NAME) || req.body?.csrfToken;
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];

    if (!token || !cookieToken || token !== cookieToken) {
        if (token) csrfTokens.delete(token);
        return res.status(403).json({ success: false, message: 'CSRF token missing or invalid' });
    }

    const expiresAt = csrfTokens.get(token);
    if (!expiresAt || expiresAt <= Date.now()) {
        csrfTokens.delete(token);
        return res.status(403).json({ success: false, message: 'CSRF token expired' });
    }

    next();
}

module.exports = { issueToken, validate, CSRF_COOKIE_NAME, CSRF_HEADER_NAME };
