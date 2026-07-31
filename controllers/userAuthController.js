const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, Order } = require('../models');

/**
 * تسجيل مستخدم جديد
 */
exports.register = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور.' });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'هذا البريد الإلكتروني مسجل بالفعل.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            email: email.toLowerCase(),
            password: hashedPassword,
            balance: 0
        });

        await newUser.save();

        res.status(201).json({ success: true, message: 'تم إنشاء الحساب بنجاح! يمكنك الآن تسجيل الدخول.' });

    } catch (err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء إنشاء الحساب.' });
    }
};

/**
 * تسجيل دخول مستخدم
 */
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // توكن صالح لمدة أسبوع
        );

        res.json({
            success: true,
            token,
            user: { email: user.email, balance: user.balance }
        });

    } catch (err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء تسجيل الدخول.' });
    }
};

/**
 * جلب سجل طلبات المستخدم
 */
exports.getOrderHistory = async (req, res) => {
    try {
        // تحديث: البحث باستخدام معرّف المستخدم بدلاً من البريد الإلكتروني
        // هذا يضمن أن المستخدم يرى طلباته فقط، حتى لو تغير بريده الإلكتروني مستقبلاً.
        const orders = await Order.find({ userId: req.user.userId }).sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل جلب سجل الطلبات.' });
    }
};