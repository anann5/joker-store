const { Log } = require('../models');
const axios = require('axios');
const registry = require('../providers/registry');
const adapter = require('../providers/adapter');

// المزودون الخارجيون (صيغة توافقية للكنترولرات القديمة)
// يُبنى من سجل المزودين في providers/registry.js (قابل للضبط من .env)
exports.externalProviders = registry.getProviders().map(provider => ({
    name: provider.name,
    apiUrl: provider.itemsUrl,
    apiKey: provider.apiKey,
    balanceApiUrl: provider.balanceUrl,
    purchaseUrl: provider.purchaseUrl
}));

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