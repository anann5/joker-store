const crypto = require('crypto');
const axios = require('axios');
const { Order } = require('../models');
const { createLog, sendTelegramAlert } = require('./helpers');

const STRIPE_API = 'https://api.stripe.com/v1';

function getConfig() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return null;
    return {
        secretKey,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        enabled: true
    };
}

/**
 * هل Stripe مفعل؟ (يجب ضبط STRIPE_SECRET_KEY في .env)
 */
exports.isStripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** ترميز حقل إلى كجزء من body بصيغة application/x-www-form-urlencoded */
function enc(value) {
    return encodeURIComponent(String(value ?? ''));
}

/**
 * إنشاء جلسة Checkout سريعة الاستضافة على Stripe (بدون الحاجة لمكتبة عميل).
 * يعيد { id, url } من استجابة Stripe.
 */
async function createCheckoutSession({ orderId, amount, currency, name, baseUrl }) {
    const config = getConfig();
    if (!config) throw new Error('Stripe غير مفعل — أضف STRIPE_SECRET_KEY في .env');

    const body = [
        `mode=payment`,
        `success_url=${enc(`${baseUrl}/?order=${encodeURIComponent(orderId)}&paid=1`)}`,
        `cancel_url=${enc(`${baseUrl}/?order=${encodeURIComponent(orderId)}&cancelled=1`)}`,
        `metadata[orderId]=${enc(orderId)}`,
        `line_items[0][quantity]=1`,
        `line_items[0][price_data][currency]=${enc(String(currency).toLowerCase())}`,
        `line_items[0][price_data][unit_amount]=${enc(Math.round(Number(amount) * 100))}`,
        `line_items[0][price_data][product_data][name]=${enc(String(name || 'طلب متجر الجوكر').slice(0, 200))}`
    ].join('&');

    const response = await axios.post(`${STRIPE_API}/checkout/sessions`, body, {
        auth: { username: config.secretKey, password: '' },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
    });
    return response.data;
}

/**
 * التحقق من توقيع Webhook الخاص بـ Stripe (HMAC-SHA256) لمنع التزوير.
 * @param {Buffer} payload - النص الخام (RAW) كما أرسله Stripe.
 * @param {string} secret - STRIPE_WEBHOOK_SECRET.
 * @param {string} signatureHeader - رأس `stripe-signature`.
 */
function verifySignature(payload, secret, signatureHeader) {
    const parts = {};
    for (const item of signatureHeader.split(',')) {
        const index = item.indexOf('=');
        if (index === -1) continue;
        parts[item.slice(0, index).trim()] = item.slice(index + 1).trim();
    }
    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) return false;

    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${payload.toString('utf8')}`)
        .digest('hex');

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * معالج Webhook: يتلقى أحداث Stripe ويثبّت الدفع على الطلب.
 * يُسجَّل في app.js قبل express.json للحصول على النص الخام للتحقق من التوقيع.
 */
exports.stripeWebhook = async (req, res) => {
    const config = getConfig();
    if (!config) {
        return res.status(400).json({ error: 'Stripe not configured' });
    }
    if (!config.webhookSecret) {
        return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET is required' });
    }
    if (!req.headers['stripe-signature']) {
        return res.status(400).json({ error: 'Missing stripe-signature header' });
    }
    if (!Buffer.isBuffer(req.body)) {
        return res.status(400).json({ error: 'Expected raw body' });
    }
    if (!verifySignature(req.body, config.webhookSecret, req.headers['stripe-signature'])) {
        return res.status(400).json({ error: 'Invalid signature' });
    }

    let event;
    try {
        event = JSON.parse(req.body.toString('utf8'));
    } catch (_err) {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data?.object || {};
        const orderId = session.metadata?.orderId;
        if (orderId) {
            const order = await Order.findOneAndUpdate(
                { orderId },
                {
                    $set: {
                        paymentGateway: 'stripe',
                        paymentRef: session.id || null,
                        stripePaymentIntentId: session.payment_intent || null
                    }
                },
                { new: true }
            );
            if (order) {
                await createLog('دفع Stripe', `تم تأكيد دفع الطلب #${orderId} عبر Stripe`, null, orderId, order.productName);
                await sendTelegramAlert(
                    `💳 *دفع Stripe مكتمل*\n`
                    + `🧾 *الطلب:* #${orderId}\n`
                    + `💰 *المبلغ:* \`${order.price}\``
                );
            }
        }
    }

    // نرد دائماً 200 حتى تعتبر Stripe الحدث مقبولاً (يُعاد الإرسال عندما لا نرد 200)
    res.json({ received: true });
};

module.exports = {
    isStripeEnabled: exports.isStripeEnabled,
    createCheckoutSession,
    stripeWebhook: exports.stripeWebhook
};