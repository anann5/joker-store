const { Product, Order, User } = require('../models');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
    console.warn("⚠️ تحذير: STRIPE_SECRET_KEY غير معرف في ملف .env. الدفع عبر Stripe لن يعمل.");
}

const { notifyAdminTelegram } = require('./helpers');

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;');
}

exports.getProducts = async (req, res) => {
    try {
        const { category } = req.params;
        let query = { isActive: true };
        if (category && category !== 'all') {
            query.$or = [{ category: category.toLowerCase() }, { "فئة": category.toLowerCase() }];
        }
        const products = await Product.find(query);
        const formatted = products.map(p => ({
            id: p._id,
            name: String(p.productName || p["اسم المنتج"] || "منتج").trim(),
            price: Number(p.price || p["سعر"] || 0),
            available: p.codes ? p.codes.filter(c => c.status === 'available').length : 0
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json([]);
    }
};

exports.checkout = async (req, res) => {
    try {
        const { customerEmail, cartItems, paymentMethod } = req.body;

        if (!customerEmail || !cartItems || cartItems.length === 0) {
            return res.status(400).json({ success: false, message: 'بيانات الطلب غير مكتملة' });
        }

        // 1. حساب المبلغ الإجمالي والتحقق من المنتجات
        let totalAmount = 0;
        const itemsDetails = [];
        
        for (const item of cartItems) {
            const product = await Product.findById(item.id);
            if (!product || !product.isActive) {
                return res.status(404).json({ success: false, message: `المنتج ${item.name} غير متوفر حالياً` });
            }
            totalAmount += product.price;
            itemsDetails.push({ id: product._id, name: product.productName, price: product.price });
        }

        const orderId = 'JKR-' + Math.random().toString(36).substr(2, 9).toUpperCase();

        // 2. محاولة الخصم من المحفظة أولاً
        const user = await User.findOne({ email: customerEmail.toLowerCase() });
        
        if (user && user.balance >= totalAmount) {
            // خصم الرصيد من المحفظة
            user.balance -= totalAmount;
            await user.save();

            // إنشاء الطلب كطلب مدفوع وجاهز للتنفيذ
            const newOrder = new Order({
                orderId,
                productName: itemsDetails.map(i => i.name).join(', '),
                items: itemsDetails,
                price: totalAmount,
                buyerEmail: customerEmail.toLowerCase(),
                paymentGateway: 'wallet',
                status: 'pending' // سيبقى pending ليقوم الأدمن بالموافقة النهائية (وتفعيل الأتمتة)
            });

            await newOrder.save();
            await notifyAdminTelegram(orderId, totalAmount, customerEmail);

            return res.json({ 
                success: true, 
                walletPaid: true,
                message: `تم الدفع بنجاح من رصيد محفظتك. رصيدك المتبقي: ${user.balance.toFixed(2)}$` 
            });
        }

        // 3. في حال عدم كفاية الرصيد (أو اختيار دفع يدوي)، ننشئ طلباً بحالة "معلق"
        const manualOrder = new Order({
            orderId,
            productName: itemsDetails.map(i => i.name).join(', '),
            items: itemsDetails,
            price: totalAmount,
            buyerEmail: customerEmail.toLowerCase(),
            paymentGateway: paymentMethod || 'manual', // سيستخدم الطريقة المختارة (جوال بي، بال بي، الخ)
            status: 'pending'
        });

        await manualOrder.save();
        
        // إشعار للأدمن على تلجرام بوجود طلب جديد يحتاج مراجعة يدوية
        await notifyAdminTelegram(orderId, totalAmount, customerEmail);

        res.json({ success: true, walletPaid: false, message: 'تم استلام طلبك بنجاح. يرجى إتمام التحويل وتزويدنا برقم العملية لتأكيد الطلب.' });

    } catch (err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء معالجة الطلب: ' + err.message });
    }
};
