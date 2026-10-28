const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { User, PasswordResetToken } = require('../models');
const { logSecurityEvent } = require('../middleware/securityLogger');
const { sendPasswordResetEmail } = require('./notification');
const { getSafeBaseHost } = require('./helpers');

const RESET_TTL_MS = 30 * 60 * 1000;

// يُخزَّن هاش التوكن فقط — تسريب قاعدة البيانات لا يكشف روابط إعادة التعيين.
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function getSiteOrigin(req) {
    const siteUrl = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
    if (siteUrl) return siteUrl;
    return `${req.protocol}://${getSafeBaseHost(req)}`;
}

/**
 * طلب رابط إعادة تعيين كلمة المرور.
 * الرد عام دائماً حتى لا يُستدل على البُرد المسجلة (منع تعداد الحسابات).
 */
exports.requestReset = async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const genericMessage = 'إذا كان هذا البريد مسجلاً لدينا، ستصلك رسالة تحتوي رابط إعادة التعيين خلال دقائق.';

    try {
        const user = await User.findOne({ email }).select('_id email').lean();
        if (!user) {
            logSecurityEvent('PASSWORD_RESET_UNKNOWN_EMAIL', `طلب إعادة تعيين لبريد غير مسجل: ${email}`, req);
            return res.json({ success: true, message: genericMessage });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(token);

        // رابط واحد صالح فقط لكل مستخدم: الطلب الجديد يُبطل القديم.
        await PasswordResetToken.deleteMany({ userId: user._id });
        await PasswordResetToken.create({
            userId: user._id,
            tokenHash,
            expiresAt: new Date(Date.now() + RESET_TTL_MS)
        });

        const resetUrl = `${getSiteOrigin(req)}/reset-password?token=${token}`;
        const mail = await sendPasswordResetEmail(user.email, resetUrl);
        logSecurityEvent('PASSWORD_RESET_REQUESTED', `طلب إعادة تعيين كلمة مرور: ${email}`, req);

        return res.json({
            success: true,
            message: genericMessage,
            // رابط مباشر للتطوير المحلي فقط عندما يتعذر إرسال البريد
            ...(process.env.NODE_ENV !== 'production' && (mail.skipped || mail.error) ? { devResetUrl: resetUrl } : {})
        });
    } catch (err) {
        console.error('Password reset request error:', err.message);
        return res.status(500).json({ success: false, message: 'تعذّر معالجة الطلب، حاول لاحقاً.' });
    }
};

/**
 * إعادة التعيين بالتوكن: أحادي الاستخدام، صالح 30 دقيقة،
 * ويزيد tokenVersion لإبطال كل جلسات المستخدم الحالية.
 */
exports.resetPassword = async (req, res) => {
    const { token } = req.body;
    const password = String(req.body.password || '');

    try {
        // حذف ذرّي مشروط بالصلاحية: يمنع استخدام نفس الرابط مرتين حتى مع طلبات متزامنة.
        const record = await PasswordResetToken.findOneAndDelete({
            tokenHash: hashToken(token),
            expiresAt: { $gt: new Date() }
        });

        if (!record) {
            logSecurityEvent('PASSWORD_RESET_INVALID_TOKEN', 'محاولة استخدام رابط إعادة تعيين منتهٍ أو غير صالح', req);
            return res.status(400).json({
                success: false,
                message: 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.'
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await User.findOneAndUpdate(
            { _id: record.userId },
            { $set: { passwordHash }, $inc: { tokenVersion: 1 } },
            { new: true }
        );

        await PasswordResetToken.deleteMany({ userId: record.userId });

        if (!user) {
            return res.status(400).json({ success: false, message: 'الحساب غير موجود. تواصل مع الدعم.' });
        }

        logSecurityEvent('PASSWORD_RESET_SUCCESS', `تمت إعادة تعيين كلمة المرور: ${user.email}`, req);
        return res.json({
            success: true,
            message: `تم تغيير كلمة المرور بنجاح. تم تسجيل الخروج من كل الأجهزة السابقة، يمكنك الدخول الآن.`
        });
    } catch (err) {
        console.error('Password reset error:', err.message);
        return res.status(500).json({ success: false, message: 'تعذّرت إعادة التعيين، حاول لاحقاً.' });
    }
};
