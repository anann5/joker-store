const { Product, Order } = require('../models');
const { v4: uuidv4 } = require('uuid');

exports.getProductsByCategory = async (req, res) => {
    try {
        const { categoryKey } = req.params;
        const products = await Product.find({ category: categoryKey, isActive: true }).select('productName category region price image isExternal externalId profitMargin basePrice');
        res.json(products);
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل جلب المنتجات' });
    }
};

exports.getLatestOrders = async (req, res) => {
    // This is a placeholder for the /api/products/latest-orders route used in script.js
    // In a real application, you would fetch actual latest completed orders.
    res.json({ success: true, orders: [] });
};

exports.createOrder = async (req, res) => {
    try {
        const { cartItems, customerEmail, paymentGateway, paymentRef } = req.body;

        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({ success: false, error: 'سلة المشتريات فارغة.' });
        }

        let total = 0;
        const itemsForOrder = [];

        for (const item of cartItems) {
            const product = await Product.findById(item.id);
            if (product) {
                total += product.price * item.qty;
                itemsForOrder.push({
                    id: product._id,
                    name: product.productName,
                    qty: item.qty,
                    price: product.price
                });
            }
        }

        const newOrder = new Order({
            orderId: uuidv4().split('-')[0].toUpperCase(), // رقم طلب عشوائي فريد
            items: itemsForOrder,
            price: total,
            buyerEmail: customerEmail,
            paymentGateway: paymentGateway,
            paymentRef: paymentRef,
            status: 'pending',
        });

        // ✨ الربط مع المستخدم المسجل دخوله
        if (req.user && req.user.userId) {
            newOrder.userId = req.user.userId;
        }

        await newOrder.save();

        res.status(201).json({ success: true, message: 'تم استلام طلبك بنجاح.' });

    } catch (err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء إنشاء الطلب.' });
    }
};