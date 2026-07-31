const express = require('express');
const router = express.Router();
const rateLimit = require("express-rate-limit");

// استيراد المتحكمات الجديدة
const authController = require('../controllers/authController');
const productController = require('../controllers/productController');
const orderController = require('../controllers/orderController');
const logController = require('../controllers/logController');
const statsController = require('../controllers/statsController');

// تعريف ليميتر بسيط خاص بمسارات الأدمن لحمايتها
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: "محاولات كثيرة، يرجى الانتظار." //
});

// مسار تسجيل الدخول (غير محمي بالتوكن)
router.post('/login', adminLimiter, authController.login);

// حماية بقية المسارات باستخدام التوكن المعرف في الكنترولر
router.use(authController.verifyAdminToken);

router.get('/dashboard', statsController.getStats);
router.get('/inventory', productController.getInventory);
router.post('/inventory/add', productController.addProductManual);
router.post('/inventory/sync', productController.syncExternalProducts);
router.patch('/inventory/:productId/margin', productController.updateProductMargin);
router.get('/orders', orderController.getOrders);
router.post('/orders/:orderId/approve', orderController.approveOrder);
router.get('/logs', logController.getLogs);
router.get('/logs/export', logController.exportLogs);
router.delete('/logs', logController.deleteAllLogs);
router.delete('/logs/:logId', logController.deleteLog);
// router.get('/balances', statsController.getProviderBalances); // هذه الدالة لم يتم نقلها بعد، يمكن إضافتها لـ statsController

module.exports = router;
