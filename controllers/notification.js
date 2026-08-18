const nodemailer = require('nodemailer');

// إعدادات البريد تُقرأ من .env — البريد اختياري (تعطيل → يكتفي السجل الحالي)
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || '';
const EMAIL_NOTIFICATIONS_ENABLED = String(process.env.EMAIL_NOTIFICATIONS_ENABLED ?? 'true').toLowerCase() !== 'false';

let transporter = null;

function getTransporter() {
    if (!EMAIL_NOTIFICATIONS_ENABLED || !SMTP_HOST || !MAIL_FROM) return null;
    if (transporter) return transporter;
    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: SMTP_USER
            ? { user: SMTP_USER, pass: SMTP_PASS }
            : undefined
    });
    return transporter;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function localizedName(value) {
    if (value && typeof value === 'object') {
        return String(value.ar || value.en || '');
    }
    return String(value || '');
}

function buildOrderItemsHtml(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) return '<p>لا توجد منتجات في هذا الطلب.</p>';

    return items.map(item => {
        const name = escapeHtml(localizedName(item.name));
        const codes = Array.isArray(item.deliveredCodes) && item.deliveredCodes.length > 0
            ? `<div style="margin-top:6px;direction:ltr;text-align:left;background:#f6f8fa;border:1px solid #e1e4e8;border-radius:6px;padding:8px;font-family:monospace;font-size:12px;white-space:pre-wrap;">${escapeHtml(item.deliveredCodes.join('\n'))}</div>`
            : '';
        return `
            <tr>
                <td style="padding:8px 10px;border:1px solid #e1e4e8;">${name} × ${escapeHtml(item.qty)}</td>
                <td style="padding:8px 10px;border:1px solid #e1e4e8;">${codes}</td>
            </tr>`;
    }).join('');
}

/**
 * صفوف جدول ملخص الطلب (اسم + كمية + سعر) — يُستخدم في بريد "استلام الطلب".
 */
function buildOrderSummaryRowsHtml(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) return '<tr><td colspan="3">لا توجد منتجات في هذا الطلب.</td></tr>';

    return items.map(item => {
        const name = escapeHtml(localizedName(item.name));
        const qty = Number(item.qty) || 1;
        const unitPrice = Number(item.unitPrice) || 0;
        const price = (qty * unitPrice).toFixed(2);
        return `
            <tr>
                <td style="padding:8px 10px;border:1px solid #e1e4e8;">${name}</td>
                <td style="padding:8px 10px;border:1px solid #e1e4e8;text-align:center;">${escapeHtml(qty)}</td>
                <td style="padding:8px 10px;border:1px solid #e1e4e8;">${escapeHtml(price)}</td>
            </tr>`;
    }).join('');
}

/**
 * إرسال بريد "تم استلام طلبك" فور إنشاء الطلب:
 * يُطمئن الزبون أن الطلب وصل وأن الحالة قيد المراجعة ويُدرج ملخصاً بالمنتجات والإجمالي.
 */
async function sendOrderCreatedEmail(order) {
    const mailer = getTransporter();
    if (!mailer) return { skipped: true, reason: 'email not configured' };

    const orderId = escapeHtml(order.orderId);
    const total = Number(order.price) || 0;

    const emailHtml = `
        <div style="font-family:Arial,sans-serif;direction:rtl;text-align:right;max-width:600px;margin:auto;">
            <h2 style="color:#0e7490;">🎮 متجر الجوكر — تأكيد استلام طلبك</h2>
            <p>أهلاً بك،</p>
            <p>تم استلام طلبك رقم <strong>#${orderId}</strong> بنجاح وهو الآن <strong>قيد المراجعة</strong>.</p>
            <p>سيتواصل الأدمن معك لتأكيد الدفع، وسيصلك الكود فور التأكيد. يمكنك متابعة حالة طلبك في أي وقت عبر صفحة «تتبع طلبك» بإدخال بريدك الإلكتروني.</p>
            <table style="width:100%;border-collapse:collapse;margin-top:12px;">
                <thead>
                    <tr>
                        <th style="padding:8px 10px;border:1px solid #e1e4e8;background:#f6f8fa;text-align:right;">المنتج</th>
                        <th style="padding:8px 10px;border:1px solid #e1e4e8;background:#f6f8fa;text-align:center;">الكمية</th>
                        <th style="padding:8px 10px;border:1px solid #e1e4e8;background:#f6f8fa;text-align:right;">السعر</th>
                    </tr>
                </thead>
                <tbody>${buildOrderSummaryRowsHtml(order)}</tbody>
            </table>
            <p style="margin-top:16px;">الإجمالي: <strong>${escapeHtml(total.toFixed(2))}</strong></p>
            <p style="color:#6b7280;font-size:12px;">هذا بريد إلكتروني تلقائي — لا ترد عليه. إذا لم تكن قد طلبت هذا البريد، يمكنك تجاهله.</p>
        </div>
    `;

    try {
        await mailer.sendMail({
            from: MAIL_FROM,
            to: order.buyerEmail,
            subject: `🎮 متجر الجوكر — تأكيد استلام طلبك #${order.orderId}`,
            html: emailHtml
        });
        return { skipped: false };
    } catch (err) {
        console.error('⚠️ فشل إرسال بريد استلام الطلب:', err.message);
        return { skipped: false, error: err.message };
    }
}

/**
 * إرسال بريد تأكيد للزبون مع الأكواد المرسلة.
 */
async function sendOrderConfirmationEmail(order) {
    const mailer = getTransporter();
    if (!mailer) return { skipped: true, reason: 'email not configured' };

    const orderId = escapeHtml(order.orderId);
    const orderHtml = buildOrderItemsHtml(order);

    const emailHtml = `
        <div style="font-family:Arial,sans-serif;direction:rtl;text-align:right;max-width:600px;margin:auto;">
            <h2 style="color:#0e7490;">✅ تم تأكيد طلبك — الأكواد جاهزة</h2>
            <p>أهلاً بك،</p>
            <p>تم تجهيز طلبك رقم <strong>#${orderId}</strong> بنجاح. ستجد أدناه تفاصيل المنتجات والأكواد الخاصة بك:</p>
            <table style="width:100%;border-collapse:collapse;margin-top:12px;">
                <thead>
                    <tr>
                        <th style="padding:8px 10px;border:1px solid #e1e4e8;background:#f6f8fa;text-align:right;">المنتج</th>
                        <th style="padding:8px 10px;border:1px solid #e1e4e8;background:#f6f8fa;text-align:right;">الكود</th>
                    </tr>
                </thead>
                <tbody>${orderHtml}</tbody>
            </table>
            <p style="margin-top:16px;color:#6b7280;font-size:12px;">إذا لم تكن قد طلبت هذا البريد، يمكنك تجاهله.</p>
        </div>
    `;

    try {
        await mailer.sendMail({
            from: MAIL_FROM,
            to: order.buyerEmail,
            subject: `🎮 متجر الجوكر — أكواد طلبك #${order.orderId}`,
            html: emailHtml
        });
        return { skipped: false };
    } catch (err) {
        console.error('⚠️ فشل إرسال بريد تأكيد الطلب:', err.message);
        return { skipped: false, error: err.message };
    }
}

/**
 * إرسال بريد إشعار للزبون عند رفض الطلب.
 */
async function sendOrderRejectedEmail(order) {
    const mailer = getTransporter();
    if (!mailer) return { skipped: true, reason: 'email not configured' };

    const orderId = escapeHtml(order.orderId);

    const emailHtml = `
        <div style="font-family:Arial,sans-serif;direction:rtl;text-align:right;max-width:600px;margin:auto;">
            <h2 style="color:#b91c1c;">⛔ تم رفض طلبك</h2>
            <p>أهلاً بك،</p>
            <p>نأسف لإبلاغك بأن طلبك رقم <strong>#${orderId}</strong> لم يعد بالإمكان تنفيذه.</p>
            <p>إذا كنت قد قمت بتحويل المبلغ، فنرجو منك التواصل معنا عبر قنوات الدعم وسنعيد لك المبلغ في أقرب وقت.</p>
        </div>
    `;

    try {
        await mailer.sendMail({
            from: MAIL_FROM,
            to: order.buyerEmail,
            subject: `🎮 متجر الجوكر — إلغاء الطلب #${order.orderId}`,
            html: emailHtml
        });
        return { skipped: false };
    } catch (err) {
        console.error('⚠️ فشل إرسال بريد إلغاء الطلب:', err.message);
        return { skipped: false, error: err.message };
    }
}

module.exports = {
    sendOrderCreatedEmail,
    sendOrderConfirmationEmail,
    sendOrderRejectedEmail
};