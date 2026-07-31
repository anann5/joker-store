const { Order } = require('../models');
const { fetchProviderBalances, externalProviders } = require('./helpers');

exports.getStats = async (req, res) => {
    try {
        const completedOrders = await Order.countDocuments({ status: 'completed' });
        const pendingOrders = await Order.countDocuments({ status: 'pending' });
        
        const completedOrdersList = await Order.find({ status: 'completed' });
        let totalProfit = 0;

        for (const order of completedOrdersList) {
            if (order.costPrice && order.costPrice > 0) {
                totalProfit += (order.price - order.costPrice);
            }
        }

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const completedOrdersToday = await Order.countDocuments({ status: 'completed', completedAt: { $gte: startOfDay } });
        const salesToday = await Order.aggregate([
            { $match: { status: 'completed', completedAt: { $gte: startOfDay } } },
            { $group: { _id: null, total: { $sum: "$price" } } }
        ]);

        const totalSales = await Order.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: "$price" } } }
        ]);

        const providerBalances = await fetchProviderBalances(externalProviders);

        res.json({ 
            success: true, 
            stats: { 
                completedOrders,
                pendingOrders,
                completedOrdersToday,
                salesToday: salesToday[0]?.total || 0,
                revenue: totalSales[0]?.total || 0,
                totalProfit,
                providerBalances
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل جلب الإحصائيات' });
    }
};

exports.getProviderBalances = async (req, res) => {
    try {
        const balances = await fetchProviderBalances(externalProviders);
        res.json({ success: true, balances });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل جلب أرصدة المزودين' });
    }
};