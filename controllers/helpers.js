const { Log } = require('../models');
const axios = require('axios');
const registry = require('../providers/registry');
const adapter = require('../providers/adapter');

// المزودون الخارجيون (صيغة توافقية للكنترولرات القديمة)
// يُبنى من سجل المزودين في providers/registry.js مباشرة حتى تُستخدم نفس
// الحقول التي يعتمد عليها المحول (balanceUrl, itemsUrl, purchaseUrl...)
exports.externalProviders = registry.getProviders();

function mdEscape(text) {
    return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

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

// Helper function to send Telegram alerts — يتحمّل أخطاء Markdown ويعيد المحاولة كنص عادي
exports.sendTelegramAlert = async (message) => {
    const telegramBotToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const telegramChatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();

    if (!telegramBotToken || !telegramChatId) {
        console.warn('⚠️ لم يتم إعداد توكن بوت التلجرام أو معرف الدردشة. لن يتم إرسال التنبيهات.');
        return;
    }

    const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    const payload = { chat_id: telegramChatId, text: message, parse_mode: 'Markdown' };
    try {
        await axios.post(url, payload, { timeout: 8000 });
    } catch (error) {
        const status = error.response?.status;
        const resp = error.response?.data;
        if (status === 400) {
            // إعادة محاولة صامتة بدون تنسيق — غالباً بسبب حرف Markdown في اسم منتج
            try {
                await axios.post(url, { chat_id: telegramChatId, text: message }, { timeout: 8000 });
                return;
            } catch (retryErr) {
                console.error('⚠️ فشل إرسال تنبيه تلجرام (حتى كنص عادي):', retryErr.response?.data?.description || retryErr.message);
                return;
            }
        }
        console.error('⚠️ فشل إرسال تنبيه تلجرام:', resp?.description || error.message);
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
                    + `🏢 *المزود:* ${mdEscape(result.name)}\n`
                    + `🚫 *السبب:* ${mdEscape(result.error)}`
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
                + `🏢 *المزود:* ${mdEscape(result.name)}\n`
                + `💳 *الرصيد المتبقي:* \`${mdEscape(result.balance)} ${mdEscape(result.currency)}\`\n`
                + `📉 *العتبة:* ${mdEscape(threshold)} ${mdEscape(result.currency)}`
            );
        }
    }

    await Promise.all(alertsToSend.map(message => exports.sendTelegramAlert(message)));

    return { checked: results.length, alerted };
};

const lowStockAlertState = new Map();

/**
 * فحص المخزون المنخفض وإرسال تنبيه تيليجرام عند هبوط أي منتج تحت العتبة.
 * لا يكرر التنبيه لنفس المنتج قبل مرور LOW_STOCK_REALERT_HOURS ساعات.
 * @returns {Promise<{checked:number, lowCount:number, alerted:number}>}
 */
exports.checkLowStockAlert = async () => {
    const threshold = Number.parseInt(process.env.LOW_STOCK_THRESHOLD, 10) || 5;
    const reAlertMs = (Number.parseFloat(process.env.LOW_STOCK_REALERT_HOURS) || 24) * 60 * 60 * 1000;
    const now = Date.now();
    const { Product } = require('../models');
    const products = await Product.find({ isActive: true, isExternal: false }).select('productName codes category').lean();
    let alerted = 0;
    const msgs = [];
    for (const p of products) {
        const available = Array.isArray(p.codes) ? p.codes.filter(c => c.status === 'available').length : 0;
        const key = String(p._id);
        if (available === 0 || available >= threshold) {
            lowStockAlertState.delete(key);
            if (available === 0) {
                const last = lowStockAlertState.get(`${key}:out`) || 0;
                if (now - last > reAlertMs) {
                    lowStockAlertState.set(`${key}:out`, now);
                    const name = mdEscape(p.productName?.ar || p.productName?.en || key);
                    msgs.push(`🔴 *نفاد مخزون*\n📦 *المنتج:* ${name}\n🏷️ *الفئة:* ${mdEscape(p.category || '—')}\n📉 *المتبقي:* 0`);
                    alerted += 1;
                }
            }
            continue;
        }
        const last = lowStockAlertState.get(key) || 0;
        if (now - last > reAlertMs) {
            lowStockAlertState.set(key, now);
            const name = mdEscape(p.productName?.ar || p.productName?.en || key);
            msgs.push(`⚠️ *مخزون منخفض*\n📦 *المنتج:* ${name}\n🏷️ *الفئة:* ${mdEscape(p.category || '—')}\n📉 *المتبقي:* ${mdEscape(available)} (عتبة ${mdEscape(threshold)})`);
            alerted += 1;
        }
    }
    if (msgs.length > 0) {
        const chunkSize = 6;
        for (let i = 0; i < msgs.length; i += chunkSize) {
            await exports.sendTelegramAlert(msgs.slice(i, i + chunkSize).join('\n\n'));
        }
    }
    const lowCount = products.filter(p => {
        const a = Array.isArray(p.codes) ? p.codes.filter(c => c.status === 'available').length : 0;
        return a > 0 && a < threshold;
    }).length;
    return { checked: products.length, lowCount, alerted };
};

exports.checkAbandonedCarts = async () => {
    const { CartSession } = require('../models');
    const { sendAbandonedCartEmail } = require('./notification');
    const carts = await CartSession.find({ notified: false, email: { $ne: null }, updatedAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) } }).limit(20).lean();
    let sent = 0;
    for (const c of carts) {
        try {
            const r = await sendAbandonedCartEmail(c);
            if (!r.skipped) {
                await CartSession.updateOne({ _id: c._id }, { $set: { notified: true } });
                sent += 1;
            }
        } catch (_e) {}
    }
    return { checked: carts.length, sent };
};