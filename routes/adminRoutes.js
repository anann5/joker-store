const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const rateLimit = require("express-rate-limit");

// تعريف ليميتر بسيط خاص بمسارات الأدمن لحمايتها
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: "محاولات كثيرة، يرجى الانتظار."
});

// مسار تسجيل الدخول (غير محمي بالتوكن)
router.post('/login', adminLimiter, adminController.login);

// حماية بقية المسارات باستخدام التوكن المعرف في الكنترولر
router.use(adminController.verifyAdminToken);

router.get('/dashboard', adminController.getStats);
router.get('/inventory', adminController.getInventory);
router.post('/inventory/add', adminController.addProductManual);
router.post('/inventory/sync', adminController.syncExternalProducts);
router.patch('/inventory/:productId/margin', adminController.updateProductMargin);
router.get('/orders', adminController.getOrders);
router.post('/orders/:orderId/approve', adminController.approveOrder);
router.get('/logs', adminController.getLogs);
router.get('/logs/export', adminController.exportLogs);
router.delete('/logs', adminController.deleteAllLogs);
router.delete('/logs/:logId', adminController.deleteLog);
router.get('/balances', adminController.getProviderBalances);

module.exports = router;
