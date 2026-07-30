const axios = require('axios');

async function notifyAdminTelegram(orderId, amount, customer) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId   = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    const message = `🃏 *طلب شراء جديد!*\n` + `━━━━━━━━━━━━━━\n` + `🆔 *رقم الطلب:* \`${orderId}\` \n` + `👤 *العميل:* ${customer}\n` + `💰 *المبلغ:* \`${amount}$\` \n` + `━━━━━━━━━━━━━━\n` + `🚀 *افحص لوحة التحكم الآن!*`;

    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: chatId, text: message, parse_mode: 'Markdown' });
    } catch (err) {
        console.error('⚠️ خطأ تلجرام:', err.message);
    }
}

async function sendTelegramAlert(message) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId   = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: chatId, text: message, parse_mode: 'Markdown' });
    } catch (err) {
        console.error('⚠️ خطأ تلجرام في إرسال التنبيه:', err.message);
    }
}

async function fetchProviderBalances(externalProviders) {
    const balances = [];
    for (const provider of externalProviders) {
        if (!provider.balanceApiUrl || !provider.apiKey) continue;
        try {
            const response = await axios.get(provider.balanceApiUrl, { headers: { 'Authorization': `Bearer ${provider.apiKey}` }, timeout: 7000 });
            balances.push({ name: provider.name, balance: response.data.balance, currency: response.data.currency || 'USD', status: 'متصل' });
        } catch (err) {
            balances.push({ name: provider.name, status: `فشل الاتصال` });
        }
    }
    return balances;
}

module.exports = { notifyAdminTelegram, fetchProviderBalances, sendTelegramAlert };
