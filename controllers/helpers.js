const { Log } = require('../models');
const axios = require('axios');
const registry = require('../providers/registry');
const adapter = require('../providers/adapter');

// المزودون الخارجيون (صيغة توافقية للكنترولرات القديمة)
// يُبنى من سجل المزودين في providers/registry.js مباشرة حتى تُستخدم نفس
// الحقول التي يعتمد عليها المحول (balanceUrl, itemsUrl, purchaseUrl...)
exports.externalProviders = registry.getProviders();

// Helper function to create logs
exports.createLog = async (action, details, req, targetId = null, targetName = null) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const newLog = new Log({ action, details, ip, targetId, targetName });
        await newLog.save();
    } catch (err) {
        console.error('⚠️ فشل تسجيل النشاط:', err.message);
    }
};

// عنوان مضيف آمن لبناء روابط مطلقة (إعادة توجيه HTTPS / روابط Stripe):
// - يفضّل النطاق الثابت SITE_URL إن وُجد (مصدر واحد للحقيقة)
// - وإلا يُعيد Host الخام بعد تنظيفه من أي حرف خطر (يمنع CRLF والحقن في Location)
exports.getSafeBaseHost = (req) => {
    const siteUrl = process.env.SITE_URL;
    if (siteUrl) {
        try { return new URL(siteUrl).host; } catch (_e) { /* ننتقل للحل البديل */ }
    }
    return String((req && req.get && req.get('host')) || '').replace(/[^a-zA-Z0-9.:[\]-]/g, '');
};

// Helper function to send Telegram alerts
exports.sendTelegramAlert = async (message) => {
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    if (!telegramBotToken || !telegramChatId) {
        console.warn('⚠️ لم يتم إعداد توكن بوت التلجرام أو معرف الدردشة. لن يتم إرسال التنبيهات.');
        return;
    }

    const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: telegramChatId,
            text: message,
            parse_mode: 'Markdown'
        }, {
            // مهلة صارمة: لا نسمح لمكالمة تيليغرام متعثرة بتعليق معالجة الطلبات/الدخول
            timeout: 8000
        });
    } catch (error) {
        console.error('⚠️ فشل إرسال تنبيه تلجرام:', error.message);
    }
};

// Helper function to fetch provider balances (حقيقية عبر واجهات المزودين)
exports.fetchProviderBalances = async (providers) => {
    const results = await Promise.all(providers.map(provider => adapter.fetchBalance(provider)));
    return results;
};

// حالة تنبيه الأرصدة: نُنبّه مرة عند الهبوط تحت العتبة، ولا نكرر التنبيه قبل
// مرور BALANCE_REALERT_HOURS ساعات (أو حتى يتعافى الرصيد فوق العتبة).
const balanceAlertState = new Map();

// حالة تنبيه الانقطاع: نُنبّه عند تعذر الوصول للمزود، ونعيد التنبيه فقط بعد
// مرور BALANCE_REALERT_HOURS ساعات من آخر تنبيه، ونُصفّر الحالة عند عودة الاتصال.
const providerDownAlertState = new Map();

/**
 * فحص أرصدة المزودين وتنبيه تيليغرام عند الانخفاض دون العتبة أو عند انقطاع المزود.
 * العتبة قابلة للضبط عبر LOW_BALANCE_THRESHOLD (بوحدة عملة المزود).
 * @returns {Promise<{checked: number, alerted: number}>}
 */
exports.checkProviderBalancesAlert = async () => {
    const threshold = Number.parseFloat(process.env.LOW_BALANCE_THRESHOLD);
    if (!Number.isFinite(threshold) || threshold <= 0) {
        return { checked: 0, alerted: 0 };
    }

    const providers = registry.getProviders();
    if (providers.length === 0) return { checked: 0, alerted: 0 };

    const results = await exports.fetchProviderBalances(providers);
    const reAlertMs = (Number.parseFloat(process.env.BALANCE_REALERT_HOURS) || 24) * 60 * 60 * 1000;
    const now = Date.now();
    let alerted = 0;

    const alertsToSend = [];
    for (const result of results) {
        // تنبيه انقطاع/تعطل المزود (فشل جلب الرصيد): أبلغ مرة ثم لا تكرر قبل الموعد،
        // وحال عودة الاتصال تُصفَّر الحالة ويُعاد التقييم من جديد.
        if (result.error) {
            const lastDownAlertAt = providerDownAlertState.get(result.name) || 0;
            if (now - lastDownAlertAt > reAlertMs) {
                providerDownAlertState.set(result.name, now);
                alerted += 1;
                alertsToSend.push(
                    `🛑 *مزود غير متصل*\n`
                    + `🏢 *المزود:* ${result.name}\n`
                    + `🚫 *السبب:* ${result.error}`
                );
            }
            balanceAlertState.delete(result.name);
            continue;
        }
        providerDownAlertState.delete(result.name);

        if (Number(result.balance) > threshold) {
            balanceAlertState.delete(result.name);
            continue;
        }
        const lastAlertAt = balanceAlertState.get(result.name) || 0;
        if (now - lastAlertAt > reAlertMs) {
            balanceAlertState.set(result.name, now);
            alerted += 1;
            alertsToSend.push(
                `⚠️ *رصيد مزود منخفض*\n`
                + `🏢 *المزود:* ${result.name}\n`
                + `💳 *الرصيد المتبقي:* \`${result.balance} ${result.currency}\`\n`
                + `📉 *العتبة:* ${threshold} ${result.currency}`
            );
        }
    }

    await Promise.all(alertsToSend.map(message => exports.sendTelegramAlert(message)));

    return { checked: results.length, alerted };
};