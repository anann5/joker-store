// صفحة تتبع الطلب المستقلة /track — تعتمد على POST /api/track-order (مقيّد بمعدل)
import { initI18n, t, getCurrentLanguage } from './i18n.js';
initI18n();

let WHATSAPP_NUMBER = '';
fetch('/api/site-config').then(r => r.json()).then(d => {
    WHATSAPP_NUMBER = (d?.siteConfig?.social && d.siteConfig.social.whatsapp) || '';
}).catch(() => {});

const STATUS_MAP = {
    completed: { text: () => t('track_status_completed'), cls: 'completed' },
    pending: { text: () => t('track_status_pending'), cls: 'pending' },
    processing: { text: () => t('track_status_processing'), cls: 'processing' },
    failed: { text: () => t('track_status_failed'), cls: 'failed' },
    refunded: { text: () => t('track_status_refunded'), cls: 'refunded' }
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildOrderTimeline(status) {
    const steps = [
        { key: 'track_step_received', state: 'pending' },
        { key: 'track_step_processing', state: 'pending' },
        { key: 'track_step_delivered', state: 'pending' }
    ];

    if (status === 'pending') {
        steps[0].state = 'current';
    } else if (status === 'processing') {
        steps[0].state = 'done';
        steps[1].state = 'current';
    } else if (status === 'completed') {
        steps[0].state = 'done';
        steps[1].state = 'done';
        steps[2].state = 'done';
    }

    return `
        <div class="track-timeline">
            ${steps.map(step => `
                <div class="timeline-step ${step.state}">
                    <span class="timeline-dot">${step.state === 'done' ? '<i class="fas fa-check"></i>' : ''}</span>
                    <span class="timeline-step-label">${escapeHtml(t(step.key))}</span>
                </div>`).join('')}
        </div>`;
}

function buildOrderFailureTimeline() {
    const steps = ['track_step_received', 'track_step_processing', 'track_step_delivered'];
    return `
        <div class="track-timeline fail">
            ${steps.map(key => `
                <div class="timeline-step fail">
                    <span class="timeline-dot"><i class="fas fa-times"></i></span>
                    <span class="timeline-step-label">${escapeHtml(t(key))}</span>
                </div>`).join('')}
        </div>`;
}

function formatPrice(value) {
    const num = Number(value || 0);
    return `${num.toFixed(2)} ₪`;
}

async function copyCode(btn) {
    const code = btn.getAttribute('data-code') || '';
    try {
        await navigator.clipboard.writeText(code);
    } catch (_e) {
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }
    btn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
}

async function trackOrder() {
    const emailInput = document.getElementById('trackEmailInput');
    const orderIdInput = document.getElementById('trackOrderIdInput');
    const results = document.getElementById('trackOrderResults');
    if (!emailInput || !results) return;

    const email = emailInput.value.trim();
    const orderId = orderIdInput.value.trim();
    if (!email) {
        results.innerHTML = `<p style="color:#e74c3c; text-align:center;">⚠️ ${escapeHtml(t('track_email_required'))}</p>`;
        return;
    }

    results.innerHTML = `<p style="text-align:center; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> ${escapeHtml(t('loading_generic'))}</p>`;

    try {
        const res = await fetch('/api/track-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, orderId })
        });
        const data = await res.json();

        if (!data.success) {
            results.innerHTML = `<p style="color:#e74c3c; text-align:center;">❌ ${escapeHtml(data.error || t('track_error_generic'))}</p>`;
            return;
        }
        if (!data.orders || data.orders.length === 0) {
            results.innerHTML = `<p style="color:var(--text-muted); text-align:center;">🔍 ${escapeHtml(t('track_no_results'))}</p>`;
            return;
        }

        const lang = getCurrentLanguage();

        results.innerHTML = data.orders.map(order => {
            const st = STATUS_MAP[order.status] || { text: () => order.status, cls: '' };
            const isFailure = order.status === 'failed' || order.status === 'refunded';
            const date = new Date(order.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
            const items = (order.items || []).map(i => escapeHtml((i.name && (i.name[lang] || i.name.ar)) || i.name)).join('، ');
            const codesHtml = (!isFailure && order.codes && order.codes.length)
                ? `<div class="track-code-box"><span class="track-code-label">${escapeHtml(t('track_shipping_code'))}</span>${order.codes.map(c => `<span class="track-code-row"><code class="track-code" dir="ltr">${escapeHtml(c)}</code><button type="button" class="track-copy-btn" data-code="${escapeHtml(c)}" title="${escapeHtml(t('track_copy_code'))}" aria-label="${escapeHtml(t('track_copy_code'))}"><i class="fas fa-copy"></i></button></span>`).join('')}</div>`
                : '';
            const invoiceLink = `/invoice?order=${encodeURIComponent(order.orderId)}&email=${encodeURIComponent(email)}`;
            const waLink = WHATSAPP_NUMBER
                ? `https://wa.me/${String(WHATSAPP_NUMBER).replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`${t('invoice_whatsapp_msg')} #${order.orderId}`)}`
                : '';
            const actionsHtml = `
                <div class="track-actions">
                    <a href="${invoiceLink}" class="enter-btn track-action-btn"><i class="fas fa-file-invoice"></i> ${escapeHtml(t('track_invoice_btn'))}</a>
                    ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" class="enter-btn track-action-btn wa"><i class="fab fa-whatsapp"></i> ${escapeHtml(t('track_whatsapp_btn'))}</a>` : ''}
                </div>`;
            return `
                <div class="track-result-card">
                    <div class="track-head">
                        <span class="track-id">#${escapeHtml(order.orderId)}</span>
                        <span class="status-badge ${st.cls}">${st.text()}</span>
                    </div>
                    ${isFailure ? buildOrderFailureTimeline() : buildOrderTimeline(order.status)}
                    <div style="font-size:0.9rem; color:var(--text-muted);">${items}</div>
                    <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">${date} | <b>${formatPrice(order.price)}</b></div>
                    ${codesHtml}
                    ${actionsHtml}
                </div>`;
        }).join('');
    } catch (_e) {
        results.innerHTML = `<p style="color:#e74c3c; text-align:center;">❌ ${escapeHtml(t('auth_error_connection'))}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('trackOrderBtn');
    if (btn) btn.addEventListener('click', trackOrder);

    const idInput = document.getElementById('trackOrderIdInput');
    if (idInput) {
        idInput.addEventListener('keydown', e => { if (e.key === 'Enter') trackOrder(); });
    }
    const emailInput = document.getElementById('trackEmailInput');
    if (emailInput) {
        emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') trackOrder(); });
    }

    document.addEventListener('click', e => {
        const copyBtn = e.target.closest('.track-copy-btn');
        if (copyBtn) copyCode(copyBtn);
    });
});