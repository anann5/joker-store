// يربط كل طلب بمعرّف فريد ويُسجّل سطر وصول منظّم عند اكتمال الاستجابة.
// المعرّف يُعاد في ترويسة X-Request-Id ليستطيع الدعم تتبّع أي شكوى بدقة.

const { randomUUID } = require('crypto');
const logger = require('../config/logger');

// الأصول الثابتة لا تُسجَّل (ضجيج بلا قيمة تشغيلية)
const STATIC_ASSET = /\.(?:css|js|mjs|map|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|eot|mp4|webm)$/i;
const MAX_DURATION_MS = 60 * 60 * 1000;

/**
 * يتحقق أن المعرّف القادم من العميل آمن للتسجيل والإعادة.
 * @param {unknown} value - القيمة من الترويسة.
 * @returns {string|null}
 */
function normalizeIncomingId(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.length < 8 || raw.length > 64) return null;
    return /^[A-Za-z0-9._-]+$/.test(raw) ? raw : null;
}

/**
 * ميدلوير معرّف الطلب + سجل الوصول.
 * @param {Object} req - طلب Express.
 * @param {Object} res - استجابة Express.
 * @param {Function} next - التالي.
 * @returns {void}
 */
function requestContext(req, res, next) {
    req.id = normalizeIncomingId(req.get('x-request-id')) || randomUUID();
    res.setHeader('X-Request-Id', req.id);
    req.log = logger.childLogger(req);

    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
        try {
            if (STATIC_ASSET.test(req.path)) return;
            const durationMs = Math.min(
                MAX_DURATION_MS,
                Number(process.hrtime.bigint() - startedAt) / 1e6
            );
            const status = res.statusCode;
            const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
            req.log[level]('http_request', {
                method: req.method,
                path: String(req.originalUrl || req.path).split('?')[0],
                status,
                durationMs: Math.round(durationMs * 10) / 10,
                ip: req.clientIp || req.ip,
                userAgent: String(req.get('user-agent') || '').slice(0, 180)
            });
        } catch (_error) {
            // السجل لا يوقف الاستجابة
        }
    });

    next();
}

module.exports = { requestContext, normalizeIncomingId };
