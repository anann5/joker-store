const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const rateLimit = require("express-rate-limit");

// تعريف ليميتر بسيط للمتجر
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: "Requests many from this device, please try later."
});

// middleware للتحقق من صحة بيانات طلب الدفع
const validateCheckout = (req, res, next) => {
    const { customerEmail, cartItems, paymentMethod } = req.body;
    if (!customerEmail || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
        return res.status(400).json({ success: false, message: "بيانات الطلب غير مكتملة" });
    }
    next();
};

router.get('/products', generalLimiter, storeController.getProducts);
router.get('/products/:category', generalLimiter, storeController.getProducts);
router.post('/checkout', generalLimiter, validateCheckout, storeController.checkout);

module.exports = router;