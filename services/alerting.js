// تنبيهات تشغيلية مباشرة إلى Telegram عبر Bot API.
// مستقلة عن طبقة النماذج حتى تعمل عند فشل قاعدة البيانات أو أثناء الإقلاع.
// كل تنبيه يخضع لتهدئة (throttle) بمفتاح ثابت لمنع إغراق المحادثة عند تكرار الخطأ.

const TELEGRAM_API = 'https://api.telegram.org';
const DEFAULT_THROTTLE_MS = 10 * 60 * 1000;
const lastSentAt = new Map();

/**
 * هل يحين وقت إرسال هذا المفتاح؟
 * @param {string} key - بصمة التنبيه.
 * @param {number} windowMs - نافذة التهدئة.
 * @returns {boolean}
 */
function shouldSend(key, windowMs) {
    const now = Date.now();
    const last = lastSentAt.get(key) || 0;
    if (now - last < windowMs) return false;
    lastSentAt.set(key, now);
    // تنظيف دوري بسيط لمنع تضخّم الخريطة
    if (lastSentAt.size > 200) {
        for (const [k, ts] of lastSentAt) {
            if (now - ts > 60 * 60 * 1000) lastSentAt.delete(k);
        }
    }
    return true;
}

/**
 * إرسال رسالة نصية إلى تلجرام.
 * @param {string} text - نص الرسالة (Markdown مسموح).
 * @param {Object} [options]
 * @param {number} [options.timeoutMs] - مهلة الطلب.
 * @returns {Promise<boolean>} نجاح الإرسال.
 */
async function sendTelegram(text, { timeoutMs = 5000 } = {}) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            }),
            signal: controller.signal
        });
        if (!response.ok) return false;
        return true;
    } catch (_error) {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * تنبيه حاد مع تهدئة (لا يُكرر نفس المفتاح خلال النافذة).
 * @param {string} kind - نوع التنبيه (fingerprint).
 * @param {string} message - نصقصير يصف المشكلة.
 * @param {Object} [meta] - تفاصيل إضافية تُلحق بالرسالة.
 * @param {number} [windowMs] - نافذة التهدئة.
 * @returns {Promise<boolean>}
 */
async function alertCritical(kind, message, meta = {}, windowMs = DEFAULT_THROTTLE_MS) {
    if (!shouldSend(kind, windowMs)) return false;
    const lines = [
        `🚨 *${kind}*`,
        message,
        meta.env ? `🌍 البيئة: \`${meta.env}\`` : '',
        meta.commit ? `🏷️ الإصدار: \`${meta.commit}\`` : '',
        meta.requestId ? `🆔 الطلب: \`${meta.requestId}\`` : '',
        meta.route ? `📍 المسار: \`${String(meta.route).slice(0, 200)}\`` : ''
    ].filter(Boolean);
    return sendTelegram(lines.join('\n'));
}

/**
 * إعادة ضبط التهدئة (للاختبارات فقط).
 * @returns {void}
 */
function resetThrottle() {
    lastSentAt.clear();
}

module.exports = { sendTelegram, alertCritical, resetThrottle };
