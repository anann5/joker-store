const express = require('express');
const router = express.Router();
const userAuthController = require('../controllers/userAuthController');
const passwordResetController = require('../controllers/passwordResetController');
const { verifyUserToken, verifyUserTokenOptional } = require('../middleware/authMiddleware');
const { validate, loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema } = require('../middleware/validate');
const csrfProtection = require('../middleware/csrf');
const rateLimit = require("express-rate-limit");

// Rate limiter for authentication routes (prevent brute force)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max 10 attempts per IP
    message: "عدد محاولات تسجيل الدخول كبير جداً، يرجى المحاولة لاحقاً."
});

// حد أشد لطلبات الاستعادة: يمنع إغراق البريد والتوكنات
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "عدد طلبات الاستعادة كبير جداً، يرجى المحاولة بعد قليل."
});
const resetPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "عدد محاولات إعادة التعيين كبير جداً، يرجى المحاولة بعد قليل."
});

// مسارات المصادقة العامة
router.post('/users/register', authLimiter, validate(registerSchema), userAuthController.register);
router.post('/users/login', authLimiter, validate(loginSchema), userAuthController.login);

// استعادة كلمة المرور: طلب رابط + إعادة تعيين بالتوكن
router.post('/users/forgot-password', forgotPasswordLimiter, validate(forgotPasswordSchema), passwordResetController.requestReset);
router.post('/users/reset-password', resetPasswordLimiter, validate(resetPasswordSchema), passwordResetController.resetPassword);

// مسارات محمية تتطلب تسجيل الدخول
router.get('/users/orders', verifyUserToken, userAuthController.getOrderHistory);
router.get('/users/me', verifyUserTokenOptional, userAuthController.getMe);
router.get('/users/referral', verifyUserToken, userAuthController.getReferralInfo);

// مزامنة السلة السحابية (يتطلب تسجيل الدخول — للتزامن بين الأجهزة)
router.get('/users/cart', verifyUserToken, userAuthController.getUserCart);
router.put('/users/cart', csrfProtection.validate, verifyUserToken, userAuthController.saveUserCart);

// ليميتر لتسجيل الخروج (منع إغراق المسار أو استنزاف الموارد بتكرار الطلب)
const logoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: "طلبات كثيرة، يرجى الانتظار قليلاً."
});

// تسجيل الخروج: يمسح الكوكي ولا يتطلب توكن صالحاً (حتى مع توكن منتهي)
router.post('/users/logout', logoutLimiter, userAuthController.logout);

module.exports = router;
