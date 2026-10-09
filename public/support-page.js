// صفحة الدعم الفني المستقلة /support — تذاكر الدعم عبر /api/support/tickets
import { initI18n, t, getCurrentLanguage } from './i18n.js';
initI18n();

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showMessage(el, text, isError = false) {
    if (!el) return;
    const color = isError ? '#e74c3c' : 'var(--success)';
    el.innerHTML = `<p style="color:${color}; text-align:center; margin:6px 0;">${isError ? '❌ ' : '✅ '}${escapeHtml(text)}</p>`;
}

const getLang = () => getCurrentLanguage() === 'en' ? 'en' : 'ar';

async function loadCaptcha() {
    const promptEl = document.getElementById('supportCaptchaPrompt');
    const answerEl = document.getElementById('supportCaptchaAnswer');
    if (!promptEl) return;
    try {
        const res = await fetch('/api/security/captcha');
        const data = await res.json();
        if (!data.success) throw new Error('captcha failed');
        window.__supportCaptchaToken = data.challenge;
        promptEl.textContent = `= ${data.prompt}`;
        if (answerEl) answerEl.value = '';
    } catch (_e) {
        promptEl.textContent = t('support_captcha_error');
    }
}

async function submitTicket() {
    const msgEl = document.getElementById('supportFormMessage');
    const email = document.getElementById('supportEmail')?.value?.trim();
    const subject = document.getElementById('supportSubject')?.value?.trim();
    const message = document.getElementById('supportMessage')?.value?.trim();
    const answer = document.getElementById('supportCaptchaAnswer')?.value?.trim();
    const token = window.__supportCaptchaToken;

    if (!email || !subject || !message) {
        showMessage(msgEl, t('support_fill_all'), true);
        return;
    }
    if (!token || !answer) {
        showMessage(msgEl, t('support_captcha_required'), true);
        return;
    }

    try {
        const res = await fetch('/api/support/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, subject, message, lang: getLang(), captchaToken: token, captchaAnswer: answer })
        });
        const data = await res.json();

        if (!data.success) {
            showMessage(msgEl, data.message || t('support_submit_error'), true);
            loadCaptcha();
            return;
        }
        window.__supportCaptchaToken = null;
        document.getElementById('supportSubject').value = '';
        document.getElementById('supportMessage').value = '';
        document.getElementById('supportTrackEmail').value = email;
        document.getElementById('supportTrackId').value = data.ticket.ticketId;
        showMessage(msgEl, `${t('support_created')} ${t('support_follow_hint')}`);
        trackTicket();
        loadCaptcha();
    } catch (_e) {
        showMessage(msgEl, t('auth_error_connection'), true);
    }
}

const STATUS_LABELS = {
    open: () => t('support_status_open'),
    answered: () => t('support_status_answered'),
    closed: () => t('support_status_closed')
};

async function trackTicket() {
    const results = document.getElementById('supportTrackResults');
    const email = document.getElementById('supportTrackEmail')?.value?.trim();
    const ticketId = document.getElementById('supportTrackId')?.value?.trim().toUpperCase();
    if (!results || !email || !ticketId) return;

    results.innerHTML = `<p style="text-align:center; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> ${escapeHtml(t('loading_generic'))}</p>`;

    try {
        const res = await fetch(`/api/support/tickets/${encodeURIComponent(ticketId)}?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        if (!data.success || !data.ticket) {
            results.innerHTML = `<p style="color:#e74c3c; text-align:center;">❌ ${escapeHtml(data.message || t('support_not_found'))}</p>`;
            return;
        }
        const lang = getLang();
        const date = new Date(data.ticket.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
        const statusFn = STATUS_LABELS[data.ticket.status] || (() => data.ticket.status);

        results.innerHTML = `
            <div class="track-result-card">
                <div class="track-head">
                    <span class="track-id">${escapeHtml(data.ticket.ticketId)}</span>
                    <span class="status-badge ${data.ticket.status}">${escapeHtml(statusFn())}</span>
                </div>
                <div style="font-weight:700; margin-bottom:6px;">${escapeHtml(data.ticket.subject)}</div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:10px;">${date}</div>
                ${(data.ticket.messages || []).map(m => `
                    <div style="border:1px solid var(--glass-border-strong); border-radius:12px; padding:10px 12px; margin-bottom:8px; background:var(--glass-soft);">
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">
                            ${m.from === 'admin' ? t('support_from_admin') : t('support_from_you')} · ${new Date(m.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                        <div style="white-space:pre-wrap;">${escapeHtml(m.message)}</div>
                    </div>`).join('')}
            </div>`;
    } catch (_e) {
        results.innerHTML = `<p style="color:#e74c3c; text-align:center;">❌ ${escapeHtml(t('auth_error_connection'))}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadCaptcha();

    const submitBtn = document.getElementById('supportSubmitBtn');
    if (submitBtn) submitBtn.addEventListener('click', submitTicket);

    const refreshBtn = document.getElementById('supportCaptchaRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadCaptcha);

    const trackBtn = document.getElementById('supportTrackBtn');
    if (trackBtn) trackBtn.addEventListener('click', trackTicket);

    ['supportEmail', 'supportSubject', 'supportMessage', 'supportCaptchaAnswer'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') submitTicket();
        });
    });
    ['supportTrackEmail', 'supportTrackId'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') trackTicket();
        });
    });
});