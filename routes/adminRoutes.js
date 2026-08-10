const express = require('express');
const router = express.Router();
const rateLimit = require("express-rate-limit");

// استيراد المتحكمات الجديدة
const authController = require('../controllers/authController');
const productController = require('../controllers/productController');
const orderController = require('../controllers/orderController');
const logController = require('../controllers/logController');
const statsController = require('../controllers/statsController');
const categoryController = require('../controllers/categoryController');
const uploadController = require('../controllers/uploadController');
const upload = require('../middleware/upload');

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

// رفع الصور (محمي بالتوكن، وتحميل الملف عبر multer)
router.post('/upload', (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message || 'فشل رفع الصورة' });
        next();
    });
}, uploadController.uploadImage);

router.get('/dashboard', statsController.getStats);
router.get('/inventory', productController.getInventory);
router.get('/inventory/stats', productController.getStockStats);
router.get('/inventory/export', productController.exportProductsCSV);
router.post('/inventory/import', productController.importProductsCSV);
router.post('/inventory/add', productController.addProductManual);
router.post('/inventory/create', productController.createProduct);
router.post('/inventory/add-manual', productController.createProductWithManualCodes);
router.post('/inventory/sync', productController.syncExternalProducts);
router.get('/inventory/:productId', productController.getProduct);
router.patch('/inventory/:productId/margin', productController.updateProductMargin);
router.patch('/inventory/:productId', productController.updateProduct);
router.post('/inventory/:productId/duplicate', productController.duplicateProduct);
router.delete('/inventory/:productId', productController.deleteProduct);
router.get('/orders', orderController.getOrders);
router.post('/orders/:orderId/approve', orderController.approveOrder);
router.post('/orders/:orderId/reject', orderController.rejectOrder);
router.get('/categories', categoryController.getCategories);
router.post('/categories', categoryController.createCategory);
router.patch('/categories/:categoryId', categoryController.updateCategory);
router.delete('/categories/:categoryId', categoryController.deleteCategory);
router.get('/logs', logController.getLogs);
router.get('/logs/export', logController.exportLogs);
router.delete('/logs', logController.deleteAllLogs);
router.delete('/logs/:logId', logController.deleteLog);
router.get('/balances', statsController.getProviderBalances); // Added this route

module.exports = router;
