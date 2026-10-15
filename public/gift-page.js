// /gift/:token — festive reveal page (public, token-gated).
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

function pickName(name) {
    if (!name) return '';
    if (typeof name === 'string') return name;
    const lang = getCurrentLanguage();
    return name[lang] || name.ar || name.en || '';
}

async function copyText(btn, text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (_e) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (_e2) {}
        ta.remove();
    }
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => { btn.innerHTML = old; }, 1500);
}

async function loadGift() {
    const body = document.getElementById('giftBody');
    const title = document.getElementById('giftTitle');
    const forEl = document.getElementById('giftFor');
    const token = window.location.pathname.split('/').filter(Boolean).pop() || '';
    try {
        const res = await fetch(`/api/gift/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!data.success || !data.gift) {
            title.textContent = t('gift_invalid_title');
            body.innerHTML = `<p class="gift-error">${escapeHtml(data.error || t('gift_invalid_body'))}</p>`;
            return;
        }
        const gift = data.gift;
        if (gift.toName) {
            forEl.hidden = false;
            forEl.textContent = `${t('gift_for_prefix')} ${gift.toName}`;
        }
        const productLabel = (gift.items || []).map((i) => pickName(i.name)).filter(Boolean).join('، ')
            || gift.productName || '';
        if (gift.completed && gift.codes && gift.codes.length) {
            body.innerHTML = `
                ${productLabel ? `<div class="gift-product-name">${escapeHtml(productLabel)}</div>` : ''}
                ${gift.message ? `<p class="gift-message">${escapeHtml(gift.message)}</p>` : ''}
                ${gift.codes.map((c) => `
                    <div class="gift-code-row">
                        <code dir="ltr">${escapeHtml(c)}</code>
                        <button type="button" class="gift-copy-btn" data-code="${escapeHtml(c)}"><i class="fas fa-copy"></i> ${escapeHtml(t('gift_copy_code'))}</button>
                    </div>`).join('')}`;
            body.querySelectorAll('[data-code]').forEach((btn) => {
                btn.addEventListener('click', () => copyText(btn, btn.getAttribute('data-code') || ''));
            });
        } else {
            title.textContent = t('gift_pending_title');
            body.innerHTML = `
                ${productLabel ? `<div class="gift-product-name">${escapeHtml(productLabel)}</div>` : ''}
                ${gift.message ? `<p class="gift-message">${escapeHtml(gift.message)}</p>` : ''}
                <p class="gift-wait"><i class="fas fa-clock"></i> ${escapeHtml(t('gift_pending_body'))}</p>`;
        }
    } catch (_e) {
        title.textContent = t('gift_invalid_title');
        body.innerHTML = `<p class="gift-error">${escapeHtml(t('gift_invalid_body'))}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', loadGift);
document.addEventListener('languageChanged', loadGift);
