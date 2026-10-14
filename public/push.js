/* eslint-disable no-console */
/**
 * Web Push — بطاقة تفعيل إشعارات المتصفح (تظهر مرة ونعود بعد أسبوع إذا أُرجئت).
 * تعتمد على: /api/push/vapid-public-key (حالة+مفتاح) و /api/push/subscribe (تسجيل).
 */
import { t } from './i18n.js';

const LS_STATE = 'joker_push_state';
const LS_DISMISS_AT = 'joker_push_dismiss_at';
const PROMPT_DELAY_MS = 8000;
const REPROMPT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

let cfg = null;
let cardEl = null;

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
    return arr;
}

function getLanguage() {
    return localStorage.getItem('joker_language') === 'en' ? 'en' : 'ar';
}

function getCurrentSubscription(reg) {
    return reg.pushManager.getSubscription();
}

async function loadConfig() {
    try {
        const res = await fetch('/api/push/vapid-public-key');
        const data = await res.json();
        cfg = { enabled: Boolean(data.enabled), publicKey: data.publicKey || null };
    } catch (_err) {
        cfg = { enabled: false, publicKey: null };
    }
    return cfg;
}

function canPrompt() {
    if (!cfg || !cfg.enabled || !cfg.publicKey) return false;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
    if (Notification.permission === 'denied') return false;
    if (localStorage.getItem(LS_STATE) === 'subscribed') return false;
    const dismissedAt = Number.parseInt(localStorage.getItem(LS_DISMISS_AT) || '0', 10);
    if (dismissedAt && Date.now() - dismissedAt < REPROMPT_AFTER_MS) return false;
    return true;
}

async function isEmptyBrowserBackdrop() {
    // لا نكشف البطاقة فوق modals مفتوحة (أثناء دفع/تسجيل دخول).
    return !document.querySelector('.modal-overlay.open, .modal-overlay:not([style*="display: none"])');
}

function renderCard() {
    if (cardEl) cardEl.remove();

    cardEl = document.createElement('div');
    cardEl.className = 'push-prompt';
    cardEl.setAttribute('role', 'region');
    cardEl.setAttribute('aria-live', 'polite');
    cardEl.innerHTML = `
        <div class="push-prompt-icon"><i class="fas fa-bell"></i></div>
        <div class="push-prompt-text">
            <p class="push-prompt-title">${t('push_prompt_title', 'لا تفوّت العروض')}</p>
            <p class="push-prompt-body">${t('push_prompt_body', 'فعّل الإشعارات ليصلك كل جديد وعروض حصرية.')}</p>
        </div>
        <div class="push-prompt-actions">
            <button type="button" class="push-prompt-btn push-prompt-allow" data-push-allow>${t('push_allow_btn', 'فعّل')}</button>
            <button type="button" class="push-prompt-btn push-prompt-later" data-push-later>${t('push_later_btn', 'لاحقاً')}</button>
        </div>
    `;

    cardEl.querySelector('[data-push-allow]').addEventListener('click', () => handleAllow());
    cardEl.querySelector('[data-push-later]').addEventListener('click', () => {
        localStorage.setItem(LS_DISMISS_AT, String(Date.now()));
        hideCard();
    });

    document.body.appendChild(cardEl);
    requestAnimationFrame(() => cardEl.classList.add('show'));
}

function hideCard() {
    if (!cardEl) return;
    cardEl.classList.remove('show');
    setTimeout(() => { cardEl.remove(); cardEl = null; }, 250);
}

async function handleAllow() {
    try {
        if (Notification.permission === 'default') {
            const result = await Notification.requestPermission();
            if (result !== 'granted') {
                localStorage.setItem(LS_DISMISS_AT, String(Date.now()));
                hideCard();
                return;
            }
        }
        if (Notification.permission !== 'granted') {
            hideCard();
            return;
        }

        const reg = await navigator.serviceWorker.ready;
        let subscription = await getCurrentSubscription(reg);
        if (!subscription) {
            subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(cfg.publicKey)
            });
        }

        const body = {
            endpoint: subscription.endpoint,
            keys: {
                p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
                auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth'))))
            },
            lang: getLanguage()
        };

        const res = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('subscribe failed');
        localStorage.setItem(LS_STATE, 'subscribed');
        hideCard();
        window.dispatchEvent(new CustomEvent('push-subscribed'));
    } catch (err) {
        console.error('[push] فشل التفعيل:', err.message);
        localStorage.setItem(LS_DISMISS_AT, String(Date.now()));
        hideCard();
    }
}

async function init() {
    await loadConfig();
    if (!canPrompt()) return;

    setTimeout(async () => {
        // أعد الفحص بعد الانتظار (ربما تغير إذن/إعدادات أثناء التصفح)
        if (!canPrompt()) return;
        if (!(await isEmptyBrowserBackdrop())) return;
        renderCard();
    }, PROMPT_DELAY_MS);
}

document.addEventListener('languageChanged', () => {
    if (cardEl) renderCard();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}