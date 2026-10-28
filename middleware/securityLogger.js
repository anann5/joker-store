const fs = require('fs');
const path = require('path');

// ملف محلي للتطوير فقط — في الإنتاج يُكتب السجل في MongoDB
// لأن قرص Render مؤقت ويُفقد الملف مع كل إعادة نشر.
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'security.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

// Rotate the log file once it exceeds MAX_LOG_SIZE (keep one backup).
function rotateIfNeeded() {
    try {
        const stat = fs.statSync(LOG_FILE);
        if (stat.size > MAX_LOG_SIZE) {
            fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
        }
    } catch (_e) {
        // log file does not exist yet — nothing to rotate
    }
}

/**
 * تسجيل الأحداث الأمنية في MongoDB (دائم) وملف محلي في التطوير.
 * @param {string} eventType - نوع الحدث الامني
 * @param {string} message - رسالة الحدث
 * @param {Object} req - كائن الطلب
 */
exports.logSecurityEvent = (eventType, message, req) => {
    try {
        // req.clientIp يضبطه middleware/clientIp من CF-Connecting-IP
        const ip = req.clientIp || req.ip || req.socket?.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const userId = req.user?.userId || req.admin?.userId || 'anonymous';
        const originalPath = req.originalUrl || req.path;

        // كتابة غير حاجزة في قاعدة البيانات (لا تعطل مسار الطلب)
        try {
            const { SecurityEvent } = require('../models');
            SecurityEvent.create({
                eventType,
                message,
                ip,
                userAgent,
                userId: String(userId),
                path: originalPath
            }).catch(() => {});
        } catch (_err) {
            // النماذج غير محملة بعد أثناء الإقلاع أو قاعدة البيانات غير متصلة
        }

        if (process.env.NODE_ENV !== 'production') {
            const logEntry = {
                timestamp: new Date().toISOString(),
                eventType,
                message,
                ip,
                userAgent,
                userId,
                path: originalPath
            };
            ensureLogDir();
            rotateIfNeeded();
            fs.promises.appendFile(LOG_FILE, `${JSON.stringify(logEntry)}\n`).catch(() => {});
        }

        // أيضًا إرسال تنبيه للأدمن عبر تلغرام في حالات الطارئة
        const criticalEvents = ['FAILED_LOGIN', 'SUSPICIOUS_ACTIVITY', 'RATE_LIMIT_EXCEEDED'];
        if (criticalEvents.includes(eventType) && process.env.TELEGRAM_BOT_TOKEN) {
            const { sendTelegramAlert } = require('../controllers/helpers');
            sendTelegramAlert(`🛡️ *حدث أمني* ${eventType}\n📍 *${message}*\n🌐 IP: \`${ip}\``);
        }

    } catch (error) {
        console.error('Failed to log security event:', error);
    }
};
