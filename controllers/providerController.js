const registry = require('../providers/registry');
const sync = require('../providers/sync');
const currency = require('../providers/currency');
const { createLog } = require('./helpers');

/**
 * حالة المزودين + آخر مزامنة + حالة أسعار الصرف.
 */
exports.getProviderStatus = async (req, res) => {
    try {
        const providers = await sync.getSyncStatus();
        const fx = await currency.status();
        res.json({ success: true, providers, currency: fx });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب حالة المزودين' });
    }
};

/**
 * تشغيل مزامنة فورية مع جميع المزودين.
 */
exports.syncNow = async (req, res) => {
    try {
        const result = await sync.syncCatalog();
        await createLog('مزامنة يدوية', `مزامنة فورية: ${result.totalCreated} منتج جديد، ${result.totalUpdated} محدث`, req);
        res.json({ success: true, ...result });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشلت المزامنة الفورية' });
    }
};

/**
 * تحديث فوري لأسعار الصرف (مسح الكاش وجلب الأسعار من جديد).
 */
exports.refreshRates = async (_req, res) => {
    try {
        currency.clearCache();
        const rates = await currency._internal.getUsdRates();
        res.json({
            success: true,
            message: 'تم تحديث أسعار الصرف بنجاح',
            storeCurrency: currency.STORE_CURRENCY,
            rateCount: Object.keys(rates).length
        });
    } catch (err) {
        res.status(502).json({ success: false, error: `فشل تحديث أسعار الصرف: ${err.message}` });
    }
};

exports.getProvidersConfig = (_req, res) => {
    res.json({ success: true, providers: registry.getProvidersSafe() });
};
