const express = require('express');
const router = express.Router();
const userAuthController = require('../controllers/userAuthController');
const { verifyUserToken, verifyUserTokenOptional } = require('../middleware/authMiddleware');
const { validate, loginSchema, registerSchema } = require('../middleware/validate');
const rateLimit = require("express-rate-limit");

// Rate limiter for authentication routes (prevent brute force)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max 10 attempts per IP
    message: "عدد محاولات تسجيل الدخول كبير جداً، يرجى المحاولة لاحقاً."
});

// مسارات المصادقة العامة
router.post('/users/register', authLimiter, validate(registerSchema), userAuthController.register);
router.post('/users/login', authLimiter, validate(loginSchema), userAuthController.login);

// مسارات محمية تتطلب تسجيل الدخول
router.get('/users/orders', verifyUserToken, userAuthController.getOrderHistory);
router.get('/users/me', verifyUserTokenOptional, userAuthController.getMe);

// ليميتر لتسجيل الخروج (منع إغراق المسار أو استنزاف الموارد بتكرار الطلب)
const logoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: "طلبات كثيرة، يرجى الانتظار قليلاً."
});

// تسجيل الخروج: يمسح الكوكي ولا يتطلب توكن صالحاً (حتى مع توكن منتهي)
router.post('/users/logout', logoutLimiter, userAuthController.logout);

module.exports = router;
