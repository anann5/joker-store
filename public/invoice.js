// /invoice — فاتورة قابلة للطباعة/الحفظ PDF + نسخة عبر واتساب.
// تحميل بيانات الفاتورة عبر GET /api/invoice/:orderId?email= (يتطلب البريد + رقم الطلب).
import { initI18n, t, getCurrentLanguage } from './i18n.js';
initI18n();

const STATUS_MAP = {
    completed: 'track_status_completed',
    pending: 'track_status_pending',
    processing: 'track_status_processing',
    failed: 'track_status_failed',
    refunded: 'track_status_refunded'
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPrice(value, symbol) {
    const num = Number(value || 0);
    return `${num.toFixed(2)} ${symbol || '₪'}`;
}

function formatDate(value, lang) {
    if (!value) return '';
    return new Date(value).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function renderInvoice(inv, lang, symbol) {
    const sheet = document.getElementById('invoiceSheet');
    const statusKey = STATUS_MAP[inv.status] || null;
    const st = statusKey ? t(statusKey) : inv.status;

    const rows = (inv.items || []).map(item => `
        <tr>
            <td>${escapeHtml(item.name)}</td>
            <td class="num">${item.qty}</td>
            <td class="num">${formatPrice(item.unitPrice, symbol)}</td>
            <td class="num">${formatPrice(item.price, symbol)}</td>
        </tr>`).join('');

    const subtotal = (inv.items || []).reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    const discount = Number(inv.discount) || 0;

    const codesHtml = (inv.codes && inv.codes.length)
        ? `<div class="invoice-codes"><b>${escapeHtml(t('invoice_codes'))}</b>${inv.codes.map(c => `<code dir="ltr">${escapeHtml(c)}</code>`).join('')}</div>`
        : `<div class="invoice-codes"><b>${escapeHtml(t('invoice_delivery_pending'))}</b></div>`;

    sheet.innerHTML = `
        <div class="inv-head">
            <div>
                <div class="logo-text" style="font-size:1.2rem;">JOKER <span class="highlight">STORE</span></div>
                <div style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">JokerStore.best</div>
            </div>
            <div style="text-align:left;">
                <div><b>${escapeHtml(t('invoice_num'))}:</b> <span dir="ltr">#${escapeHtml(inv.orderId)}</span></div>
                <div style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">${escapeHtml(t('invoice_date'))}: ${formatDate(inv.createdAt, lang)}</div>
                ${inv.completedAt ? `<div style="color:var(--text-muted); font-size:0.85rem;">${escapeHtml(t('invoice_completed_at'))}: ${formatDate(inv.completedAt, lang)}</div>` : ''}
            </div>
        </div>
        <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:14px; font-size:0.9rem;">
            <span><b>${escapeHtml(t('invoice_status'))}:</b> <span class="status-badge ${inv.status}">${escapeHtml(st)}</span></span>
            <span style="color:var(--text-muted);">${escapeHtml(t('invoice_payment'))}: ${escapeHtml(inv.paymentGateway || 'E-wallet')}</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th>${escapeHtml(t('invoice_items_head_item'))}</th>
                    <th>${escapeHtml(t('invoice_items_head_qty'))}</th>
                    <th>${escapeHtml(t('invoice_items_head_unit'))}</th>
                    <th>${escapeHtml(t('invoice_items_head_total'))}</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="inv-totals">
            <div><span>${escapeHtml(t('invoice_subtotal'))}</span><span class="num">${formatPrice(subtotal, symbol)}</span></div>
            ${discount > 0 ? `<div><span>${escapeHtml(t('invoice_discount'))}${inv.discountCode ? ` (${escapeHtml(inv.discountCode)})` : ''}</span><span class="num">-${formatPrice(discount, symbol)}</span></div>` : ''}
            <div class="grand"><span>${escapeHtml(t('invoice_paid'))}</span><span class="num">${formatPrice(inv.price, symbol)}</span></div>
        </div>
        ${codesHtml}`;
}

async function loadInvoice() {
    const sheet = document.getElementById('invoiceSheet');
    const params = new URLSearchParams(window.location.search);
    const order = (params.get('order') || '').trim();
    const email = (params.get('email') || '').trim();

    if (!order || !email) {
        sheet.innerHTML = `<p style="color:#e74c3c; text-align:center;">${escapeHtml(t('invoice_not_found'))}</p>`;
        return;
    }

    const actions = document.getElementById('invoiceActions');
    if (actions) actions.style.display = 'flex';

    let symbol = '₪';
    let whatsapp = '';
    try {
        const cfgRes = await fetch('/api/site-config');
        const cfg = await cfgRes.json();
        symbol = (cfg?.siteConfig?.currency && cfg.siteConfig.currency.symbol) || '₪';
        whatsapp = (cfg?.siteConfig?.social && cfg.siteConfig.social.whatsapp) || '';
    } catch (_e) { /* defaults stand */ }

    if (whatsapp) {
        const waBtn = document.getElementById('invoiceWhatsappBtn');
        if (waBtn) {
            const text = `${t('invoice_whatsapp_msg')} #${order}`;
            waBtn.href = `https://wa.me/${String(whatsapp).replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`;
            waBtn.style.display = 'inline-flex';
        }
    }

    try {
        const res = await fetch(`/api/invoice/${encodeURIComponent(order)}?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        if (!data.success || !data.invoice) {
            sheet.innerHTML = `<p style="color:#e74c3c; text-align:center;">${escapeHtml(t('invoice_not_found'))}</p>`;
            return;
        }
        renderInvoice(data.invoice, getCurrentLanguage(), symbol);
    } catch (_e) {
        sheet.innerHTML = `<p style="color:#e74c3c; text-align:center;">${escapeHtml(t('auth_error_connection'))}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const printBtn = document.getElementById('invoicePrintBtn');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
    loadInvoice();
});