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

function emailWrapper({ title, preheader, bodyHtml }) {
    const siteUrl = String(process.env.SITE_URL || '').replace(/\/+$/, '') || '#';
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Tahoma,sans-serif;direction:rtl;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader || '')}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0f172a;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
<tr><td style="background:linear-gradient(135deg,#0e7490 0%,#06b6d4 100%);padding:20px 24px;text-align:center;">
<div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:0.5px;">🎮 JOKER STORE</div>
<div style="font-size:12px;color:rgba(255,255,255,0.85);margin-top:4px;">بطاقات رقمية • أكواد أصلية • توصيل فوري</div>
</td></tr>
<tr><td style="padding:28px 24px;color:#e2e8f0;line-height:1.7;font-size:14px;">
${bodyHtml}
</td></tr>
<tr><td style="background:#0f172a;padding:16px 24px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
<p style="margin:0;color:#64748b;font-size:11px;">هذا بريد تلقائي — لا ترد عليه. للمساعدة تواصل عبر واتساب أو <a href="${siteUrl}" style="color:#06b6d4;text-decoration:none;">الموقع</a></p>
<p style="margin:6px 0 0;color:#475569;font-size:11px;">© ${new Date().getFullYear()} Joker Store — جميع الحقوق محفوظة</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buildOrderItemsHtml(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) return '<p>لا توجد منتجات في هذا الطلب.</p>';

    return items.map(item => {
        const name = escapeHtml(localizedName(item.name));
        const codes = Array.isArray(item.deliveredCodes) && item.deliveredCodes.length > 0
            ? `<div style="margin-top:6px;direction:ltr;text-align:left;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:8px;font-family:monospace;font-size:12px;white-space:pre-wrap;color:#86efac;">${escapeHtml(item.deliveredCodes.join('\n'))}</div>`
            : '<span style="color:#64748b;font-size:12px;">—</span>';
        return `
            <tr>
                <td style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.06);color:#e2e8f0;">${name} × ${escapeHtml(item.qty)}</td>
                <td style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.06);">${codes}</td>
            </tr>`;
    }).join('');
}

/**
 * صفوف جدول ملخص الطلب (اسم + كمية + سعر) — يُستخدم في بريد "استلام الطلب".
 */
function buildOrderSummaryRowsHtml(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) return '<tr><td colspan="3" style="padding:10px;color:#94a3b8;">لا توجد منتجات في هذا الطلب.</td></tr>';

    return items.map(item => {
        const name = escapeHtml(localizedName(item.name));
        const qty = Number(item.qty) || 1;
        const unitPrice = Number(item.unitPrice) || 0;
        const price = (qty * unitPrice).toFixed(2);
        return `
            <tr>
                <td style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.06);color:#e2e8f0;">${name}</td>
                <td style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center;color:#cbd5e1;">${escapeHtml(qty)}</td>
                <td style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:left;color:#f8fafc;">${escapeHtml(price)} ₪</td>
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
    const discount = Number(order.discount) || 0;
    const siteUrl = String(process.env.SITE_URL || '').replace(/\/+$/, '');

    const bodyHtml = `
            <h2 style="margin:0 0 12px;color:#06b6d4;font-size:18px;">✅ تم استلام طلبك بنجاح</h2>
            <p style="margin:0 0 8px;">أهلاً بك،</p>
            <p style="margin:0 0 14px;">تم استلام طلبك رقم <strong style="color:#f8fafc;">#${orderId}</strong> وهو الآن <span style="background:rgba(251,191,36,0.15);color:#fbbf24;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;">قيد المراجعة</span></p>
            <p style="margin:0 0 14px;color:#94a3b8;font-size:13px;">سيتواصل الأدمن لتأكيد الدفع وسيصلك الكود فوراً بعد التأكيد.</p>
            <table style="width:100%;border-collapse:collapse;margin-top:10px;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
                <thead>
                    <tr style="background:rgba(255,255,255,0.06);">
                        <th style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:right;font-size:12px;color:#94a3b8;">المنتج</th>
                        <th style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:center;font-size:12px;color:#94a3b8;">الكمية</th>
                        <th style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:left;font-size:12px;color:#94a3b8;">السعر</th>
                    </tr>
                </thead>
                <tbody style="background:rgba(255,255,255,0.02);">${buildOrderSummaryRowsHtml(order)}</tbody>
            </table>
            <table style="width:100%;margin-top:12px;border-collapse:collapse;">
                ${discount > 0 ? `<tr><td style="padding:6px 0;color:#94a3b8;font-size:13px;">الخصم</td><td style="padding:6px 0;text-align:left;color:#22c55e;font-weight:700;">-${escapeHtml(discount.toFixed(2))}</td></tr>` : ''}
                <tr><td style="padding:6px 0;color:#e2e8f0;font-weight:800;font-size:15px;">الإجمالي:</td><td style="padding:6px 0;text-align:left;color:#06b6d4;font-weight:900;font-size:15px;">${escapeHtml(total.toFixed(2))} ₪</td></tr>
            </table>
            <div style="text-align:center;margin-top:18px;"><a href="${siteUrl || '#'}" style="display:inline-block;background:linear-gradient(135deg,#0e7490,#06b6d4);color:#fff;text-decoration:none;padding:10px 22px;border-radius:999px;font-weight:800;font-size:13px;">تتبع طلبك</a></div>
    `;
    const emailHtml = emailWrapper({ title: `تأكيد استلام طلبك #${order.orderId}`, preheader: `طلبك #${orderId} قيد المراجعة — سيصلك الكود فور التأكيد`, bodyHtml });

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

    const bodyHtml = `
            <h2 style="margin:0 0 12px;color:#22c55e;font-size:18px;">🎉 تم تأكيد طلبك — الأكواد جاهزة!</h2>
            <p style="margin:0 0 14px;">طلبك رقم <strong style="color:#f8fafc;">#${orderId}</strong> أصبح جاهزاً. انسخ الأكواد أدناه واستخدمها فوراً:</p>
            <table style="width:100%;border-collapse:collapse;margin-top:10px;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
                <thead>
                    <tr style="background:rgba(255,255,255,0.06);">
                        <th style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:right;font-size:12px;color:#94a3b8;">المنتج</th>
                        <th style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:left;font-size:12px;color:#94a3b8;">الكود</th>
                    </tr>
                </thead>
                <tbody style="background:rgba(255,255,255,0.02);">${orderHtml}</tbody>
            </table>
            <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.18);border-radius:10px;padding:10px 12px;margin-top:14px;color:#86efac;font-size:12px;">💡 احتفظ بهذا البريد — يمكنك الرجوع إليه لاسترجاع الأكواد في أي وقت.</div>
    `;
    const emailHtml = emailWrapper({ title: `أكواد طلبك #${order.orderId} جاهزة`, preheader: `أكواد طلبك #${orderId} أصبحت جاهزة — انسخها الآن`, bodyHtml });

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

    const bodyHtml = `
            <h2 style="margin:0 0 12px;color:#ef4444;font-size:18px;">⛔ نأسف — تعذر تنفيذ طلبك</h2>
            <p style="margin:0 0 8px;">طلبك رقم <strong style="color:#f8fafc;">#${orderId}</strong> لم يعد بالإمكان تنفيذه.</p>
            <p style="margin:0 0 14px;color:#94a3b8;font-size:13px;">إذا قمت بتحويل المبلغ، تواصل معنا عبر واتساب وسنعيد المبلغ فوراً. نعتذر عن الإزعاج ونسعى لخدمتك بشكل أفضل.</p>
            <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.18);border-radius:10px;padding:10px 12px;color:#fca5a5;font-size:12px;">📞 للدعم الفوري: واتساب عبر الموقع</div>
    `;
    const emailHtml = emailWrapper({ title: `إلغاء الطلب #${order.orderId}`, preheader: `نأسف — تعذر تنفيذ طلبك #${orderId}`, bodyHtml });

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

async function sendAbandonedCartEmail(cart) {
    const mailer = getTransporter();
    if (!mailer || !cart.email) return { skipped: true, reason: 'email not configured or no email' };
    const items = (cart.items || []).map(i => escapeHtml(i.productName || i.productId)).join('، ');
    const total = Number(cart.total || 0).toFixed(2);
    const bodyHtml = `
            <h2 style="margin:0 0 12px;color:#f59e0b;font-size:18px;">🛒 نسيت شيئاً في سلتك؟</h2>
            <p style="margin:0 0 8px;">لاحظنا أنك تركت سلة بقيمة <strong style="color:#f8fafc;">${escapeHtml(total)} ₪</strong> دون إكمال الشراء:</p>
            <p style="margin:0 0 14px;color:#f8fafc;font-weight:700;">${items || 'منتجات متنوعة'}</p>
            <p style="margin:0 0 14px;color:#94a3b8;font-size:13px;">أكمل طلبك الآن قبل نفاد الكمية — الأكواد توصلك فور تأكيد الدفع.</p>
            <div style="text-align:center;margin-top:16px;"><a href="${String(process.env.SITE_URL || '#').replace(/\/+$/, '')}" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#0f172a;text-decoration:none;padding:10px 22px;border-radius:999px;font-weight:900;font-size:13px;">إكمال الشراء</a></div>
    `;
    const emailHtml = emailWrapper({ title: 'سلة مهجورة — أكمل شراءك', preheader: `سلتك بقيمة ${total} ₪ بانتظارك`, bodyHtml });
    try {
        await mailer.sendMail({ from: MAIL_FROM, to: cart.email, subject: '🛒 سلّتك بانتظارك — أكمل شراءك من Joker Store', html: emailHtml });
        return { skipped: false };
    } catch (err) {
        console.error('⚠️ فشل إرسال بريد السلة المهجورة:', err.message);
        return { skipped: false, error: err.message };
    }
}

module.exports = {
    sendOrderCreatedEmail,
    sendOrderConfirmationEmail,
    sendOrderRejectedEmail,
    sendAbandonedCartEmail
};