const { Order, Product } = require('../models');
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

/**
 * تقارير الأرباح: اليومية + حسب القسم + حسب المزود (خلال N يوم الماضية).
 * `days` يُنظّم عبر query (افتراضياً 30، حد أقصى 90).
 */
exports.getReports = async (req, res) => {
    try {
        const days = Math.min(90, Math.max(1, Number.parseInt(req.query.days, 10) || 30));
        const start = new Date();
        start.setDate(start.getDate() - days);

        const match = { status: 'completed', completedAt: { $gte: start } };

        const [daily, byCategory, byProvider, totals] = await Promise.all([
            Order.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
                        revenue: { $sum: '$price' },
                        cost: { $sum: '$costPrice' }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            Order.aggregate([
                { $match: match },
                { $unwind: '$items' },
                { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'p' } },
                { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: { $ifNull: ['$p.category', 'غير معروف'] },
                        orders: { $sum: 1 },
                        revenue: { $sum: '$items.price' },
                        cost: { $sum: '$items.costPrice' }
                    }
                },
                { $sort: { revenue: -1 } }
            ]),
            Order.aggregate([
                { $match: match },
                { $unwind: '$items' },
                { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'p' } },
                { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: { $ifNull: ['$p.currentProvider', 'Local'] },
                        orders: { $sum: 1 },
                        revenue: { $sum: '$items.price' },
                        cost: { $sum: '$items.costPrice' }
                    }
                },
                { $sort: { revenue: -1 } }
            ]),
            Order.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$price' },
                        cost: { $sum: '$costPrice' }
                    }
                }
            ])
        ]);

        res.json({
            success: true,
            days,
            totals: totals[0] || { revenue: 0, cost: 0 },
            daily,
            byCategory,
            byProvider
        });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب التقارير' });
    }
};

/**
 * مقارنة أسعار حية: سعر عرض المتجر مقابل تكلفة المزود الحالية (بعد آخر مزامنة)،
 * مرتبة من الأدنى هامشاً للأعلى لاكتشاف السلع ذات الربح الضعيف.
 */
exports.getLivePricing = async (req, res) => {
    try {
        const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 200));
        const products = await Product.find({ isExternal: true, isActive: true })
            .select('productName category region price basePrice currentProvider providerOptions')
            .limit(limit);

        const rows = products.map(p => {
            const basePrice = Number(p.basePrice) || 0;
            const price = Number(p.price) || 0;
            return {
                _id: p._id,
                nameAr: p.productName?.ar || '',
                nameEn: p.productName?.en || '',
                category: p.category,
                region: p.region,
                price,
                basePrice,
                margin: basePrice > 0 ? Math.round((price / basePrice) * 100) / 100 : null,
                currentProvider: p.currentProvider,
                providerOptions: (Array.isArray(p.providerOptions) ? p.providerOptions : [])
                    .map(option => ({
                        provider: option.provider,
                        basePrice: Number(option.basePrice) || 0
                    }))
            };
        });

        rows.sort((a, b) => {
            if (a.margin === null) return 1;
            if (b.margin === null) return -1;
            return a.margin - b.margin;
        });

        res.json({ success: true, products: rows });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب مقارنة الأسعار' });
    }
};