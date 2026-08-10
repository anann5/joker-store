const fs = require('fs');
const path = require('path');

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
        
        // كتابة الحدث في ملف لوج أمني منفصل
        const logDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        const logFile = path.join(logDir, 'security.log');
        const logLine = `${JSON.stringify(logEntry)  }\n`;
        fs.appendFileSync(logFile, logLine);
        
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
