const net = require('net');
const { ipKeyGenerator } = require('express-rate-limit');

const readIp = (value) => {
    if (typeof value !== 'string') return '';
    const ip = value.trim();
    return net.isIP(ip) ? ip : '';
};

// Render يضع Cloudflare أمام كل الطلبات، و req.ip يساوي عنوان الوكيل الداخلي
// (أو عنوان حافة Cloudflare) وليس الزائر. CF-Connecting-IP يضبطه Cloudflare
// ولا يمكن للزائر تزويره عبر النطاق، لذا نعتمده أولاً ثم True-Client-IP.
const resolveClientIp = (headers = {}, fallback = '') => {
    return readIp(headers['cf-connecting-ip'])
        || readIp(headers['true-client-ip'])
        || readIp(fallback)
        || 'unknown';
};

const clientIpMiddleware = (req, _res, next) => {
    req.clientIp = resolveClientIp(req.headers, req.ip || req.socket?.remoteAddress);
    next();
};

const rateLimitKey = (req) => ipKeyGenerator(req.clientIp || req.ip || 'unknown');

module.exports = {
    readIp,
    resolveClientIp,
    clientIpMiddleware,
    rateLimitKey
};
