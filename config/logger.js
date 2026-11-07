// سجل منظّم (Structured logging) بصيغة JSON سطر واحد لكل حدث.
// الهدف: قابلية البحث والتصفية في منصات الاستضافة (Render/VPS/Docker)،
// مع إخفاء أي قيم حساسة قبل الكتابة.

const packageJson = require('../package.json');
const { captureException } = require('./monitoring');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACTED = '[redacted]';
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|otp|csrf|card|cvv|ssn/i;
const MAX_DEPTH = 4;
const MAX_STRING = 1000;

/**
 * يعيد نسخة آمنة من قيمة قابلة للتسجيل (يحذف الحقول الحساسة ويقصّ الطويل).
 * @param {unknown} value - القيمة الأصلية.
 * @param {number} [depth] - العمق الحالي.
 * @param {WeakSet} [seen] - الكائنات التي مررناها (لمنع الدوران).
 * @returns {unknown}
 */
function redact(value, depth = 0, seen = new WeakSet()) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
        return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return Number(value);
    if (value instanceof Error) return serializeError(value);
    if (typeof value !== 'object') return String(value);
    if (depth >= MAX_DEPTH) return '[depth-limit]';
    if (seen.has(value)) return '[circular]';
    seen.add(value);

    if (Array.isArray(value)) {
        return value.slice(0, 50).map((item) => redact(item, depth + 1, seen));
    }

    const output = {};
    for (const key of Object.keys(value)) {
        if (SENSITIVE_KEY.test(key)) {
            output[key] = REDACTED;
            continue;
        }
        output[key] = redact(value[key], depth + 1, seen);
    }
    return output;
}

/**
 * تحويل خطأ إلى كائن قابل للتسجيل دون كشف بيانات حساسة.
 * @param {unknown} error - الخطأ.
 * @returns {Object}
 */
function serializeError(error) {
    if (!error) return { name: 'UnknownError', message: 'unknown error' };
    if (!(error instanceof Error)) {
        return { name: 'NonError', message: String(redact(error)) };
    }
    return {
        name: error.name,
        message: error.message,
        code: error.code,
        status: error.status,
        stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    };
}

/**
 * مستوى التسجيل الفعلي من البيئة.
 * @returns {number}
 */
function currentLevel() {
    const configured = String(process.env.LOG_LEVEL || '').toLowerCase();
    if (LEVELS[configured]) return LEVELS[configured];
    // الاختبارات لا تحتاج سجلات الوصول (ضجيج فقط)
    if (process.env.NODE_ENV === 'test') return LEVELS.error;
    return process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug;
}

/**
 * كتابة حدث واحد.
 * @param {'debug'|'info'|'warn'|'error'} level - مستوى الحدث.
 * @param {string} message - رسالة قصيرة ثابتة (تُستخدم للتصفية).
 * @param {Object} [meta] - بيانات إضافية.
 * @returns {void}
 */
function write(level, message, meta = {}) {
    if (LEVELS[level] < currentLevel()) return;

    const entry = {
        time: new Date().toISOString(),
        level,
        message,
        service: 'joker-store',
        version: packageJson.version,
        env: process.env.NODE_ENV || 'development',
        ...(process.env.RENDER_GIT_COMMIT ? { commit: String(process.env.RENDER_GIT_COMMIT).slice(0, 7) } : {}),
        ...(redact(meta) || {})
    };

    let line;
    try {
        line = JSON.stringify(entry);
    } catch (_error) {
        line = JSON.stringify({ time: entry.time, level, message, metaError: 'unserializable' });
    }

    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
}

/**
 * تسجيل خطأ تشغيلي: سجل + مراقبة خارجية.
 * @param {unknown} error - الخطأ.
 * @param {Object} [context] - بيانات الطلب (requestId، route، userId...).
 * @param {'error'|'warn'} [level] - مستوى التسجيل.
 * @returns {void}
 */
function reportError(error, context = {}, level = 'error') {
    write(level, 'unhandled_error', {
        ...context,
        err: serializeError(error)
    });
    captureException(error, context);
}

/**
 * إنشاء سجل مرتبط بطلب معيّن (يضيف requestId تلقائياً).
 * @param {Object} req - طلب Express.
 * @returns {Object} دوال التسجيل الأربع.
 */
function childLogger(req) {
    const base = {
        requestId: req && req.id,
        route: req && req.originalUrl ? String(req.originalUrl).split('?')[0] : undefined
    };
    return {
        debug: (message, meta = {}) => write('debug', message, { ...base, ...meta }),
        info: (message, meta = {}) => write('info', message, { ...base, ...meta }),
        warn: (message, meta = {}) => write('warn', message, { ...base, ...meta }),
        error: (message, meta = {}) => write('error', message, { ...base, ...meta })
    };
}

module.exports = {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
    reportError,
    childLogger,
    serializeError,
    redact,
    LEVELS
};
