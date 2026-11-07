// ======================================================
// مسارات الدفع الإلكتروني (عامة — لا تتطلب جلسة أدمن)
// ------------------------------------------------------
// ملاحظة: /payments/webhook يجب أن يستقبل الجسم الخام (Buffer) للتحقق من
// التوقيع، ويُركَّب محلل raw في app.js قبل express.json لهذا المسار فقط.
// ======================================================

const express = require('express');
const rateLimit = require('express-rate-limit');
const paymentController = require('../controllers/paymentController');
const { rateLimitKey } = require('../middleware/clientIp');

const router = express.Router();

// إنشاء جلسة دفع: حد منخفض يمنع إغراق البوابة بجلسات وهمية.
const sessionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyGenerator: rateLimitKey,
    message: { success: false, message: 'عدد محاولات الدفع كبير جداً، حاول لاحقاً.' }
});

// الاستعلام عن الحالة يُستخدم من صفحة التتبع (polling قصير).
const statusLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 40,
    keyGenerator: rateLimitKey,
    message: { success: false, message: 'عدد الاستعلامات كبير جداً، حاول لاحقاً.' }
});

// webhook: حد مرتفع نسبياً (البوابات تعيد المحاولة) لكنه يمنع إغراق حساب التوقيع.
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    keyGenerator: rateLimitKey,
    message: { success: false, message: 'Too many webhook calls' }
});

router.get('/payments/config', paymentController.getConfig);
router.post('/payments/session', sessionLimiter, paymentController.createSession);
router.post('/payments/webhook', webhookLimiter, paymentController.webhook);
router.get('/payments/return', paymentController.returnToStore);
router.get('/payments/status/:orderId', statusLimiter, paymentController.getStatus);

// بوابة المحاكاة المحلية فقط (تعيد 404 في الإنتاج أو عند تعطيلها)
router.get('/payments/mock/checkout', paymentController.mockCheckoutPage);
router.post('/payments/mock/complete', paymentController.mockComplete);

module.exports = router;
