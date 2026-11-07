const net = require('net');
const { ipKeyGenerator } = require('express-rate-limit');

const readIp = (value) => {
    if (typeof value !== 'string') return '';
    const ip = value.trim();
    return net.isIP(ip) ? ip : '';
};

// Render يضع Cloudflare أمام كل الطلبات، و req.ip يساوي عنوان الوكيل الداخلي
// (أو عنوان حافة Cloudflare) وليس الزائر. CF-Connecting-IP يضبطه Cloudflare
// ويستبدل أي قيمة يرسلها العميل، لذا نعتمده أولاً.
// لا نستخدم True-Client-IP: لا يستبدله Cloudflare، فيمكن تزويره لتحييد الحدود.
// وإذا غاب ترويسة Cloudflare نرجع إلى IP الاتصال الفعلي (req.ip).
//
// على استضافة خاصة بلا Cloudflare (طلب مباشر إلى Caddy/Nginx) يستطيع العميل
// إرسال CF-Connecting-IP مزوّراً، لذا اضبط TRUST_CF_CONNECTING_IP=false
// ليعتمد التطبيق على req.ip المشتق من X-Forwarded-For (مع trust proxy).
const trustCfConnectingIp = () => process.env.TRUST_CF_CONNECTING_IP !== 'false';

const resolveClientIp = (headers = {}, fallback = '') => {
    const fromCloudflare = trustCfConnectingIp() ? readIp(headers['cf-connecting-ip']) : '';
    return fromCloudflare
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
