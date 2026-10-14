const mongoose = require('mongoose');
const { Product, Order } = require('../models');
const registry = require('../providers/registry');
const adapter = require('../providers/adapter');

function formatUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

exports.getHealth = async (_req, res) => {
    const mem = process.memoryUsage();
    const dbState = mongoose.connection.readyState; // 1 = connected
    const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
    const uptime = process.uptime();

    let pendingOrders = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalProducts = 0;
    try {
        const [pending, products] = await Promise.all([
            Order.countDocuments({ status: 'pending' }),
            Product.find({ isActive: true, isExternal: false }).select('codes').lean()
        ]);
        pendingOrders = pending;
        totalProducts = products.length;
        products.forEach(p => {
            const a = Array.isArray(p.codes) ? p.codes.filter(c => c.status === 'available').length : 0;
            if (a === 0) outOfStockCount += 1;
            else if (a < 5) lowStockCount += 1;
        });
    } catch (_e) {}

    let providers = [];
    try {
        const regs = registry.getProviders();
        providers = await Promise.all(regs.map(async p => {
            const r = await adapter.fetchBalance(p).catch(() => ({ name: p.name, balance: null, currency: p.currency || '', error: 'fetch failed' }));
            return { name: r.name || p.name, balance: r.balance ?? null, currency: r.currency || '', error: r.error || null };
        }));
    } catch (_e) {}

    res.json({
        success: true,
        health: {
            status: dbState === 1 ? 'healthy' : 'degraded',
            uptime: formatUptime(uptime),
            uptimeSeconds: Math.floor(uptime),
            memory: {
                rss: Math.round(mem.rss / 1024 / 1024),
                heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
                heapTotal: Math.round(mem.heapTotal / 1024 / 1024)
            },
            db: dbStatus,
            orders: { pending: pendingOrders },
            inventory: { totalProducts, lowStockCount, outOfStockCount },
            providers,
            timestamp: new Date().toISOString()
        }
    });
};
