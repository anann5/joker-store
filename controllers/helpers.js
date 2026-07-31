const { Log } = require('../models');
const axios = require('axios');

// Define external providers here, as they are used by multiple controllers
exports.externalProviders = [
    { 
        name: 'SMM_Global', 
        apiUrl: 'https://api.provider-a.com/v2/items', 
        apiKey: process.env.PROVIDER_A_KEY, 
        balanceApiUrl: 'https://api.provider-a.com/v2/balance',
        purchaseUrl: 'https://api.provider-a.com/v2/buy' 
    },
    { 
        name: 'GameKeys_Pro', 
        apiUrl: 'https://api.provider-b.com/v1/products', 
        apiKey: process.env.PROVIDER_B_KEY, 
        balanceApiUrl: 'https://api.provider-b.com/v1/user/balance',
        purchaseUrl: 'https://api.provider-b.com/v1/order'
    }
];

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

// Helper function to fetch provider balances
exports.fetchProviderBalances = async (providers) => {
    // This function would contain the logic to call each provider's balance API
    // For now, return dummy data or an empty array
    return providers.map(p => ({ name: p.name, balance: Math.random() * 100, currency: '$', status: 'متصل' }));
};