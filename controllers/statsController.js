const { Order } = require('../models');
const { fetchProviderBalances, externalProviders } = require('./helpers');

exports.getStats = async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const [completedOrders, pendingOrders, completedOrdersToday, profitAgg, salesToday, totalSales] = await Promise.all([
            Order.countDocuments({ status: 'completed' }),
            Order.countDocuments({ status: 'pending' }),
            Order.countDocuments({ status: 'completed', completedAt: { $gte: startOfDay } }),
            Order.aggregate([
                { $match: { status: 'completed' } },
                {
                    $group: {
                        _id: null,
                        total: {
                            $sum: {
                                $cond: [
                                    { $and: [{ $ne: ['$costPrice', null] }, { $gt: ['$costPrice', 0] }] },
                                    { $subtract: ['$price', '$costPrice'] },
                                    0
                                ]
                            }
                        }
                    }
                }
            ]),
            Order.aggregate([
                { $match: { status: 'completed', completedAt: { $gte: startOfDay } } },
                { $group: { _id: null, total: { $sum: '$price' } } }
            ]),
            Order.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$price' } } }
            ])
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
                totalProfit: profitAgg[0]?.total || 0,
                providerBalances
            }
        });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب الإحصائيات' });
    }
};

exports.getProviderBalances = async (req, res) => {
    try {
        const balances = await fetchProviderBalances(externalProviders);
        res.json({ success: true, balances });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب أرصدة المزودين' });
    }
};