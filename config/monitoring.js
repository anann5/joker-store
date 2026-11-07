// تهيئة مراقبة الأخطاء (Sentry) بشكل اختياري وآمن.
// - بدون SENTRY_DSN لا يُحمَّل أي شيء ولا يتغيّر سلوك التطبيق.
// - أي فشل في التحميل يُسجَّل تحذيراً فقط ولا يوقف الإقلاع.

let sentry = null;
let initialized = false;

/**
 * هل المراقبة الخارجية مفعّلة؟ (يُستخدم في الاختبارات والصحة)
 * @returns {boolean}
 */
function isEnabled() {
    return Boolean(sentry);
}

/**
 * تهيئة Sentry مرة واحدة عند إقلاع الخادم.
 * @returns {boolean} true إذا نجحت التهيئة.
 */
function initMonitoring() {
    if (initialized) return isEnabled();
    initialized = true;

    const dsn = String(process.env.SENTRY_DSN || '').trim();
    if (!dsn) return false;

    try {
        // تحميل كسول: الحزمة لا تُستورد إطلاقاً إذا لم تُفعّل المراقبة.
        const Sentry = require('@sentry/node');
        Sentry.init({
            dsn,
            environment: process.env.NODE_ENV || 'development',
            release: process.env.RENDER_GIT_COMMIT || process.env.APP_VERSION || undefined,
            // نسبة منخفضة من التتبع لتجنّب التكلفة/الأداء دون إعداد صريح
            tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.05,
            sendDefaultPii: false,
            // لا نرسل محتوى الطلبات (قد يحتوي بيانات دفع أو أسراراً)
            beforeSend(event) {
                if (event.request) {
                    delete event.request.data;
                    delete event.request.cookies;
                    if (event.request.headers) {
                        for (const key of Object.keys(event.request.headers)) {
                            if (/authorization|cookie|x-csrf|token|secret/i.test(key)) {
                                delete event.request.headers[key];
                            }
                        }
                    }
                }
                return event;
            }
        });
        sentry = Sentry;
        return true;
    } catch (error) {
        console.warn(`⚠️ تعذّر تحميل Sentry (${error.message}) — تُعطَّل المراقبة الخارجية.`);
        return false;
    }
}

/**
 * إرسال استثناء إلى المراقبة إن كانت مفعّلة.
 * @param {Error|unknown} error - الخطأ.
 * @param {Object} [context] - بيانات إضافية (requestId، المسار...).
 * @returns {void}
 */
function captureException(error, context = {}) {
    if (!sentry) return;
    try {
        sentry.withScope((scope) => {
            if (context.requestId) scope.setTag('request_id', context.requestId);
            if (context.route) scope.setTag('route', context.route);
            if (context.userId) scope.setUser({ id: String(context.userId) });
            sentry.captureException(error);
        });
    } catch (_error) {
        // المراقبة لا يجب أن تُسقط الطلب أبداً
    }
}

/**
 * تفريغ الأحداث المعلّقة قبل الخروج (graceful shutdown).
 * @param {number} [timeoutMs] - أقصى انتظار.
 * @returns {Promise<void>}
 */
async function flushMonitoring(timeoutMs = 2000) {
    if (!sentry) return;
    try {
        await sentry.flush(timeoutMs);
    } catch (_error) {
        // تجاهل
    }
}

module.exports = { initMonitoring, isEnabled, captureException, flushMonitoring };
