const rateLimit = require('express-rate-limit');

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 1000, 
    message: { success: false, error: 'محاولات كثيرة، انتظر 15 دقيقة' }
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 150,
    standardHeaders: true, 
    legacyHeaders: false,
    message: { success: false, error: 'كثير طلبات، انتظر شوي' }
});

module.exports = { adminLimiter, generalLimiter };
