const fs = require('fs');
const path = require('path');

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
 * تسجيل الأحداث الأمنية في ملف لوج مخصص
 * @param {string} eventType - نوع الحدث الامني
 * @param {string} message - رسالة الحدث
 * @param {Object} req - كائن الطلب
 */
exports.logSecurityEvent = (eventType, message, req) => {
    try {
        const timestamp = new Date().toISOString();
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const userId = req.user?.userId || req.admin?.userId || 'anonymous';
        
        const logEntry = {
            timestamp,
            eventType,
            message,
            ip,
            userAgent,
            userId,
            path: req.originalUrl || req.path
        };
        
        ensureLogDir();
        rotateIfNeeded();

        // Non-blocking append (never blocks the request pipeline).
        const logLine = `${JSON.stringify(logEntry)  }\n`;
        fs.promises.appendFile(LOG_FILE, logLine).catch(() => {});
        
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
