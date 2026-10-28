import { initI18n, t } from './i18n.js';

initI18n();

const TOKEN_RE = /^[a-f0-9]{64}$/;

function showStatus(el, message, type) {
    if (!el) return;
    el.textContent = message;
    el.classList.remove('success', 'error');
    el.classList.add(type, 'visible');
}

function setLoading(btn, loading, idleKey) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? t('auth_checking', '...') : t(idleKey);
}

async function postJson(url, payload) {
    const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    let data = {};
    try { data = await res.json(); } catch (_e) { /* رد غير JSON */ }
    return { res, data };
}

function initForgotPage() {
    const form = document.getElementById('forgotForm');
    const submitBtn = document.getElementById('forgotSubmit');
    const statusEl = document.getElementById('forgotStatus');
    const devLinkEl = document.getElementById('devResetLink');
    const emailInput = document.getElementById('forgotEmail');
    if (!form || !submitBtn) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = String(emailInput?.value || '').trim();
        if (!email) return;

        setLoading(submitBtn, true, 'forgot_submit');
        if (devLinkEl) devLinkEl.textContent = '';

        try {
            const { res, data } = await postJson('/api/users/forgot-password', { email });
            if (res.ok && data.success) {
                showStatus(statusEl, t('forgot_success', data.message), 'success');
                // رابط تطوير محلي عندما يتعذر إرسال البريد (لا يظهر في الإنتاج)
                if (data.devResetUrl && devLinkEl) {
                    const link = document.createElement('a');
                    link.href = data.devResetUrl;
                    link.textContent = data.devResetUrl;
                    devLinkEl.append(`${t('forgot_dev_link', 'Reset link')} `, link);
                }
            } else {
                showStatus(statusEl, data.message || t('auth_error_connection'), 'error');
            }
        } catch (_err) {
            showStatus(statusEl, t('auth_error_connection'), 'error');
        } finally {
            setLoading(submitBtn, false, 'forgot_submit');
        }
    });
}

function initResetPage() {
    const form = document.getElementById('resetForm');
    const submitBtn = document.getElementById('resetSubmit');
    const statusEl = document.getElementById('resetStatus');
    const requestAgain = document.getElementById('requestAgainLink');
    const passwordInput = document.getElementById('resetPasswordInput');
    const confirmInput = document.getElementById('resetConfirmInput');
    if (!form || !submitBtn) return;

    const token = new URLSearchParams(window.location.search).get('token') || '';
    if (!TOKEN_RE.test(token)) {
        form.hidden = true;
        if (requestAgain) requestAgain.hidden = false;
        showStatus(statusEl, t('reset_invalid_token'), 'error');
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = String(passwordInput?.value || '');
        const confirm = String(confirmInput?.value || '');

        if (password !== confirm) {
            showStatus(statusEl, t('reset_mismatch'), 'error');
            return;
        }
        if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
            showStatus(statusEl, t('reset_password_rule'), 'error');
            return;
        }

        setLoading(submitBtn, true, 'reset_submit');

        try {
            const { res, data } = await postJson('/api/users/reset-password', { token, password });
            if (res.ok && data.success) {
                form.hidden = true;
                showStatus(statusEl, t('reset_success'), 'success');
                setTimeout(() => { window.location.href = '/?login=1'; }, 2600);
            } else {
                showStatus(statusEl, data.message || t('auth_error_connection'), 'error');
                if (requestAgain && res.status === 400) requestAgain.hidden = false;
            }
        } catch (_err) {
            showStatus(statusEl, t('auth_error_connection'), 'error');
        } finally {
            setLoading(submitBtn, false, 'reset_submit');
        }
    });
}

if (document.body.dataset.page === 'forgot') {
    initForgotPage();
} else if (document.body.dataset.page === 'reset') {
    initResetPage();
}
