const express = require('express');
const router = express.Router();
const userAuthController = require('../controllers/userAuthController');
const jwt = require('jsonwebtoken');

// Middleware للتحقق من توكن المستخدم
const verifyUserToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(403).json({ success: false, message: "الوصول مرفوض." });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ success: false, message: "جلسة غير صالحة." });
        req.user = decoded; // إضافة بيانات المستخدم (userId, email) إلى الطلب
        next();
    });
};

// مسارات المصادقة العامة
router.post('/users/register', userAuthController.register);
router.post('/users/login', userAuthController.login);

// مسارات محمية تتطلب تسجيل الدخول
router.get('/users/orders', verifyUserToken, userAuthController.getOrderHistory);

module.exports = router;