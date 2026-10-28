const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const pushController = require('../controllers/pushController');
const alertsController = require('../controllers/alertsController');
const giftController = require('../controllers/giftController');
const diagStore = require('../controllers/diagStore');
const { verifyUserToken, verifyUserTokenOptional } = require('../middleware/authMiddleware');
const { validate, checkoutSchema, pushSubscribeSchema, pushUnsubscribeSchema, stockAlertSubscribeSchema, stockAlertUnsubscribeSchema, fcmTokenSchema } = require('../middleware/validate');
const rateLimit = require('express-rate-limit');
const { rateLimitKey } = require('../middleware/clientIp');

// ليميتر خاص بإنشاء الطلبات (منع إغراق قاعدة البيانات بطلبات وهمية)
const checkoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    keyGenerator: rateLimitKey,
    message: 'عدد الطلبات كبير جداً، يرجى المحاولة لاحقاً.'
});

// ليميتر خاص بتتبع الطلبات (منع سحب البيانات بالتكرار)
const trackOrderLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    keyGenerator: rateLimitKey,
    message: 'محاولات كثيرة، يرجى الانتظار قليلاً.'
});

// ليميتر أقوى لكشف الأكواد (يُفعّل عند تقديم رقم طلب)
const codeRevealLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: rateLimitKey,
    message: 'محاولات كثيرة لكشف الأكواد، يرجى الانتظار قليلاً.'
});

// Middleware: تطبيق ليميتر أقوى عند طلب كشف الأكواد (orderId)
const conditionalCodeLimiter = (req, res, next) => {
    if (req.body?.orderId) {
        return codeRevealLimiter(req, res, next);
    }
    next();
};

// Route to get all categories
router.get('/categories', storeController.getCategories);

// ===== الأمان: كابتشا + تذاكر الدعم =====
const supportController = require('../controllers/supportController');
const { createCaptcha } = require('../middleware/captcha');
const { supportTicketSchema, supportTicketTrackingSchema } = require('../middleware/validate');

const captchaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    keyGenerator: rateLimitKey,
    message: 'طلبات كثيرة جداً، يرجى الانتظار قليلاً.'
});
router.get('/security/captcha', captchaLimiter, (req, res) => {
    const { token, prompt } = createCaptcha();
    res.json({ success: true, challenge: token, prompt });
});

const ticketLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: rateLimitKey,
    message: 'عدد التذاكر كبير جداً، يرجى المحاولة لاحقاً.'
});
router.post('/support/tickets', ticketLimiter, validate(supportTicketSchema), supportController.createTicket);
router.get('/support/tickets/:ticketId', validate(supportTicketTrackingSchema), supportController.getTicket);

// Route to get a lightweight product list for client-side search
router.get('/products/search-index', storeController.getSearchIndex);

// Route for latest orders (used by updateTrustTicker in script.js)
router.get('/products/latest-orders', storeController.getLatestOrders);

// ليميتر خاص باشتراكات Web Push (منع تسجيل آلاف الاشتراكات دفعة واحدة)
const pushLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyGenerator: rateLimitKey,
    message: 'عدد الطلبات كبير جداً، يرجى المحاولة لاحقاً.'
});

// ليميتر مستقل لتشخيص التطبيق (لا يستهلك حصة الإشعارات)
const diagLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    keyGenerator: rateLimitKey,
    message: 'too many requests'
});

// Route for site-wide config (payment numbers, social links, stats)
router.get('/site-config', storeController.getSiteConfig);

// Web Push notifications — subscription management
router.get('/push/vapid-public-key', pushController.getStatus);
router.post('/push/subscribe', pushLimiter, verifyUserTokenOptional, validate(pushSubscribeSchema), pushController.subscribe);
router.post('/push/unsubscribe', pushLimiter, validate(pushUnsubscribeSchema), pushController.unsubscribe);
router.post('/push/fcm-token', pushLimiter, verifyUserTokenOptional, validate(fcmTokenSchema), pushController.registerFcmToken);
router.post('/push/app-diag', diagLimiter, (req, res) => {
    const entry = {
        ua: String(req.get('user-agent') || '').slice(0, 200),
        ip: String(req.clientIp || req.ip || ''),
        body: req.body || {}
    };
     
    console.log('[push] app-diag', JSON.stringify(entry));
    diagStore.push(entry);
    res.json({ success: true });
});

// Route for guest order tracking by email
router.post('/track-order', trackOrderLimiter, conditionalCodeLimiter, storeController.trackOrder);
router.get('/invoice/:orderId', storeController.getInvoice);

// Route to get best-selling products
router.get('/products/best-selling', storeController.getBestSellingProducts);

// Route to get newly added products
router.get('/products/newly-added', storeController.getNewlyAddedProducts);

// Route to get related products for a given product
router.get('/products/related/:productId', storeController.getRelatedProducts);

// Route to get a single public product by id (deep-link fallback when missing from search index)
router.get('/products/item/:productId', storeController.getProductItem);

// Route to submit a product review — موثّق فقط بعد شراء مكتمل
const reviewLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'عدد التقييمات كبير جداً، يرجى المحاولة لاحقاً.'
});
router.post('/products/:productId/review', reviewLimiter, verifyUserToken, storeController.submitProductReview);

// Route to fetch recent reviews for a product
router.get('/products/:productId/reviews', storeController.getProductReviews);

// Route to get active promotions (deals/discounts) for the storefront
router.get('/promotions', storeController.getActivePromotions);

// Route to validate a promo code against a product/category (used at checkout)
const promoValidateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'محاولات كثيرة للتحقق من الرمز، يرجى الانتظار قليلاً.'
});
router.post('/promotions/validate', promoValidateLimiter, storeController.validatePromoCode);

// Route to fetch site-wide customer testimonials (latest product reviews)
router.get('/testimonials', storeController.getTestimonials);

// Route for suggested products based on cart contents
router.post('/products/suggested', storeController.getSuggestedProducts);

// ليميتر خاص بتنبيهات المخزون (منع إغراق الاشتراكات)
const notifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'محاولات كثيرة لتنبيهات المخزون، يرجى الانتظار قليلاً.'
});
// Stock-alert subscriptions — MUST be before :categoryKey catch-all
router.post('/products/:productId/notify', notifyLimiter, verifyUserTokenOptional, validate(stockAlertSubscribeSchema), alertsController.subscribeStockAlert);
router.delete('/products/:productId/notify', notifyLimiter, verifyUserTokenOptional, validate(stockAlertUnsubscribeSchema), alertsController.unsubscribeStockAlert);
router.get('/products/:productId/notify', notifyLimiter, alertsController.getStockAlertStatus);

// Gift reveal (public, token-gated)
const giftLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: 'محاولات كثيرة، يرجى الانتظار قليلاً.'
});
router.get('/gift/:token', giftLimiter, giftController.getGift);

// Route to get products by category — MUST be last (catch-all with :categoryKey)
router.get('/products/:categoryKey', storeController.getProductsByCategory);

// Route for creating a new order (checkout)
router.post('/checkout', checkoutLimiter, verifyUserTokenOptional, validate(checkoutSchema), storeController.createOrder);

// Route for smart search (autocomplete)
router.get('/search', storeController.searchAll);

// Cart abandonment tracking
router.post('/cart/track', storeController.trackCartSession);

// Loyalty points
router.get('/loyalty/balance', verifyUserTokenOptional, storeController.getLoyaltyBalance);

// Review image upload (public, rate-limited)
const upload = require('../middleware/upload');
const uploadController = require('../controllers/uploadController');
router.post('/upload/review-image', reviewLimiter, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, error: err.message || 'فشل الرفع' });
        return uploadController.uploadImage(req, res, next);
    });
});

// إثبات الدفع — يُخزَّن في مجلد خاص ولا يُخدم مباشرة للعامة
const proofLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: rateLimitKey,
    message: 'عدد محاولات رفع الإثبات كبير جداً، يرجى المحاولة لاحقاً.'
});
router.post('/upload/payment-proof', proofLimiter, (req, res, next) => {
    upload.paymentProofUpload.single('image')(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, error: err.message || 'فشل رفع الإثبات' });
        return uploadController.uploadPaymentProof(req, res, next);
    });
});

module.exports = router;
