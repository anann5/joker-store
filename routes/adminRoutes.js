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
const providerController = require('../controllers/providerController');
const promotionController = require('../controllers/promotionController');
const upload = require('../middleware/upload');
const {
    validate,
    validateLenient,
    validateParams,
    manualAddProductSchema,
    createProductSchema,
    updateProductSchema,
    createCategorySchema,
    updateCategorySchema,
    deleteProductSchema,
    orderIdParamSchema,
    categoryIdParamSchema,
    productIdParamSchema,
    promotionIdParamSchema
} = require('../middleware/validate');

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
router.post('/inventory/add', validateLenient(manualAddProductSchema), productController.addProductManual);
router.post('/inventory/create', validateLenient(createProductSchema), productController.createProduct);
router.post('/inventory/add-manual', validateLenient(createProductSchema), productController.createProductWithManualCodes);
router.post('/inventory/bulk', productController.bulkUpdateProducts);
router.post('/inventory/sync', productController.syncExternalProducts);
router.get('/inventory/:productId', validateParams(productIdParamSchema), productController.getProduct);
router.patch('/inventory/:productId/margin', validateParams(productIdParamSchema), validateLenient(updateProductSchema), productController.updateProductMargin);
router.patch('/inventory/:productId', validateParams(productIdParamSchema), validateLenient(updateProductSchema), productController.updateProduct);
router.post('/inventory/:productId/duplicate', validateParams(productIdParamSchema), productController.duplicateProduct);
router.delete('/inventory/:productId', validateParams(productIdParamSchema), validate(deleteProductSchema), productController.deleteProduct);
router.get('/inventory/low-stock', productController.getLowStockProducts);
router.get('/orders', orderController.getOrders);
router.get('/orders/export', orderController.exportOrdersCSV);
router.post('/orders/:orderId/approve', validateParams(orderIdParamSchema), orderController.approveOrder);
router.post('/orders/:orderId/reject', validateParams(orderIdParamSchema), orderController.rejectOrder);
router.get('/reports', statsController.getReports);
router.get('/pricing/compare', statsController.getLivePricing);
router.get('/categories', categoryController.getCategories);
router.post('/categories', validateLenient(createCategorySchema), categoryController.createCategory);
router.patch('/categories/:categoryId', validateParams(categoryIdParamSchema), validateLenient(updateCategorySchema), categoryController.updateCategory);
router.delete('/categories/:categoryId', validateParams(categoryIdParamSchema), categoryController.deleteCategory);
router.get('/logs', logController.getLogs);
router.get('/logs/export', logController.exportLogs);
router.delete('/logs', logController.deleteAllLogs);
router.delete('/logs/:logId', logController.deleteLog);
router.get('/balances', statsController.getProviderBalances);

// المزودون والمزامنة (B2B) وأسعار الصرف
router.get('/providers/status', providerController.getProviderStatus);
router.post('/providers/sync', providerController.syncNow);
router.post('/currency/rates/refresh', providerController.refreshRates);
router.get('/providers/config', providerController.getProvidersConfig);

// العروض/الخصومات (CRUD)
router.get('/promotions', promotionController.getPromotions);
router.post('/promotions', promotionController.createPromotion);
router.patch('/promotions/:promotionId', validateParams(promotionIdParamSchema), promotionController.updatePromotion);
router.delete('/promotions/:promotionId', validateParams(promotionIdParamSchema), promotionController.deletePromotion);

module.exports = router;
