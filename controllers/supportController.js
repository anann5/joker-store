/**
 * supportController.js — تذاكر الدعم
 * - عام: إنشاء تذكرة (يتطلب كابتشا) + متابعة الحالة بالبريد ورقم التذكرة
 * - إداري: قائمة كاملة، رد، إغلاق
 */
const crypto = require('crypto');
const { SupportTicket } = require('../models');
const { verifyCaptcha } = require('../middleware/captcha');
const { createLog, sendTelegramAlert } = require('./helpers');

const generateTicketId = () => {
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
    return `TKT-${suffix}`;
};

/**
 * إنشاء تذكرة من الزائر — يتطلب كابتشا صحيحة.
 */
exports.createTicket = async (req, res) => {
    try {
        const { email, subject, message, lang, captchaToken, captchaAnswer } = req.body;

        if (!verifyCaptcha(captchaToken, captchaAnswer)) {
            return res.status(400).json({ success: false, message: 'التحقق البشري غير صحيح، يرجى المحاولة مجدداً.' });
        }

        const ticket = new SupportTicket({
            ticketId: generateTicketId(),
            email: String(email).toLowerCase().trim(),
            subject: String(subject).trim(),
            lang: lang === 'en' ? 'en' : 'ar',
            messages: [{ from: 'customer', message: String(message).trim() }]
        });

        await ticket.save();
        await createLog('تذكرة دعم', `تذكرة جديدة: ${ticket.subject} (${ticket.email})`, req);

        // تنبيه الأدمن عبر تيليجرام فور وصول تذكرة دعم جديدة
        if (process.env.NODE_ENV !== 'test') {
            sendTelegramAlert(
                `🎫 *تذكرة دعم جديدة*\n`
                + `🆔 *التذكرة:* ${ticket.ticketId}\n`
                + `📮 *البريد:* ${ticket.email}\n`
                + `📋 *الموضوع:* ${ticket.subject}`
            );
        }

        res.status(201).json({
            success: true,
            ticket: {
                ticketId: ticket.ticketId,
                subject: ticket.subject,
                status: ticket.status,
                createdAt: ticket.createdAt
            }
        });
    } catch (err) {
        console.error('Create ticket error:', err);
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء إنشاء التذكرة.' });
    }
};

/**
 * متابعة التذكرة من الزائر — يتطلب البريد + رقم التذكرة معاً.
 */
exports.getTicket = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const email = String(req.query.email || '').toLowerCase().trim();

        if (!email) {
            return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب لمتابعة التذكرة.' });
        }

        const ticket = await SupportTicket.findOne({ ticketId, email }).select('-__v');
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'لم يتم العثور على التذكرة بهذا البريد.' });
        }

        res.json({ success: true, ticket });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء جلب التذكرة.' });
    }
};

/**
 * قائمة التذاكر (للأدمن) — مع فلترة بالحالة والترقيم.
 */
exports.adminList = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const query = {};
        const { status } = req.query;
        if (['open', 'answered', 'closed'].includes(status)) query.status = status;

        const [tickets, total] = await Promise.all([
            SupportTicket.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-__v'),
            SupportTicket.countDocuments(query)
        ]);

        res.json({ success: true, tickets, total, page, limit });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب التذاكر.' });
    }
};

/**
 * تفاصيل تذكرة (للأدمن).
 */
exports.adminGet = async (req, res) => {
    try {
        const ticket = await SupportTicket.findOne({ ticketId: req.params.ticketId }).select('-__v');
        if (!ticket) return res.status(404).json({ success: false, message: 'التذكرة غير موجودة.' });
        res.json({ success: true, ticket });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل جلب التذكرة.' });
    }
};

/**
 * رد الأدمن — يضيف رسالة ويحوّل الحالة إلى answered.
 */
exports.adminReply = async (req, res) => {
    try {
        const message = String(req.body?.message || '').trim();
        if (!message) {
            return res.status(400).json({ success: false, message: 'نص الرد مطلوب.' });
        }
        if (message.length > 2000) {
            return res.status(400).json({ success: false, message: 'الرد طويل جداً.' });
        }

        const ticket = await SupportTicket.findOne({ ticketId: req.params.ticketId });
        if (!ticket) return res.status(404).json({ success: false, message: 'التذكرة غير موجودة.' });

        ticket.messages.push({ from: 'admin', message });
        ticket.status = 'answered';
        ticket.updatedAt = new Date();
        await ticket.save();
        await createLog('رد دعم', `رد على التذكرة ${ticket.ticketId}`, req);

        res.json({ success: true, ticket });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل إرسال الرد.' });
    }
};

/**
 * تغيير حالة التذكرة (للأدمن) — يُستخدم غالباً لإغلاقها.
 */
exports.adminSetStatus = async (req, res) => {
    try {
        const status = req.body?.status;
        if (!['open', 'answered', 'closed'].includes(status)) {
            return res.status(400).json({ success: false, message: 'حالة غير صالحة.' });
        }

        const ticket = await SupportTicket.findOne({ ticketId: req.params.ticketId });
        if (!ticket) return res.status(404).json({ success: false, message: 'التذكرة غير موجودة.' });

        ticket.status = status;
        ticket.updatedAt = new Date();
        await ticket.save();

        res.json({ success: true, ticket });
    } catch (_err) {
        res.status(500).json({ success: false, error: 'فشل تحديث التذكرة.' });
    }
};