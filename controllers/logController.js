const { Log } = require('../models');
const { createLog } = require('./helpers');

exports.getLogs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            Log.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
            Log.countDocuments()
        ]);
        res.json({ success: true, logs, total, page, limit });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب السجلات' });
    }
};

exports.deleteLog = async (req, res) => {
    try {
        const { logId } = req.params;
        await Log.findByIdAndDelete(logId);
        res.json({ success: true, message: 'تم حذف السجل بنجاح' });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل حذف السجل' });
    }
};

exports.deleteAllLogs = async (req, res) => {
    try {
        await Log.deleteMany({});
        await createLog('تفريغ السجلات', 'قام المسؤول بحذف كافة سجلات النشاط', req);
        res.json({ success: true, message: 'تم تفريغ جميع السجلات بنجاح' });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل في حذف السجلات' });
    }
};

exports.exportLogs = async (req, res) => {
    try {
        // حد أقصى للحماية من الاستعلامات الضخمة
        const logs = await Log.find().sort({ createdAt: -1 }).limit(10000);
        res.json({ success: true, logs });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب السجلات للتصدير' });
    }
};

const cleanupOldLogsInternal = async () => {
    try {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const result = await Log.deleteMany({ createdAt: { $lt: oneMonthAgo } });
        return { success: true, count: result.deletedCount };
    } catch (err) {
        console.error('Cleanup Logs Error:', err.message);
        return { success: false, error: err.message };
    }
};

exports.cleanupOldLogsInternal = cleanupOldLogsInternal;