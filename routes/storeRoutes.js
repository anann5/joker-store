const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const rateLimit = require("express-rate-limit");

// تعريف ليميتر بسيط للمتجر
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: "طلبات كثيرة جداً من هذا الجهاز، يرجى المحاولة لاحقاً."
});

router.get('/products', generalLimiter, storeController.getProducts);
router.get('/products/:category', generalLimiter, storeController.getProducts);
router.post('/checkout', storeController.checkout);

module.exports = router;
