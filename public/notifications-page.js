import { getCurrentLanguage, t } from '/i18n.js';

const SEEN_KEY = 'joker_seen_notice';
const listEl = document.getElementById('noticeList');
let items = [];
let loaded = false;

function markSeen() {
    if (!items.length) return;
    try {
        localStorage.setItem(SEEN_KEY, items[0].id);
    } catch (_) {}
}

function formatDate(value) {
    const lang = getCurrentLanguage() === 'en' ? 'en' : 'ar';
    try {
        return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch (_) {
        return '';
    }
}

function isSafeLink(url) {
    return typeof url === 'string' && url.charAt(0) === '/' && url.charAt(1) !== '/';
}

function buildCard(item) {
    const card = document.createElement('article');
    card.className = 'sub-page-card';
    card.id = `notice-${item.id}`;
    card.style.marginBottom = '0';

    const title = document.createElement('h2');
    title.style.cssText = 'display:flex;align-items:flex-start;gap:10px;margin-bottom:6px;';
    const icon = document.createElement('i');
    icon.className = 'fas fa-bell';
    icon.style.cssText = 'font-size:.95rem;margin-top:5px;';
    const titleText = document.createElement('span');
    titleText.textContent = item.title || '';
    title.appendChild(icon);
    title.appendChild(titleText);

    const time = document.createElement('time');
    time.dateTime = new Date(item.createdAt).toISOString();
    time.style.cssText = 'display:block;font-size:.78rem;color:var(--text-muted);margin-bottom:12px;';
    time.textContent = formatDate(item.createdAt);

    card.appendChild(title);
    card.appendChild(time);

    if (item.body) {
        const body = document.createElement('p');
        body.style.cssText = 'margin:0;white-space:pre-line;font-size:.95rem;';
        body.textContent = item.body;
        card.appendChild(body);
    }

    if (isSafeLink(item.url) && item.url !== '/') {
        const link = document.createElement('a');
        link.className = 'enter-btn';
        link.href = item.url;
        link.style.cssText = 'margin-top:16px;display:inline-flex;align-items:center;gap:8px;';
        const linkIcon = document.createElement('i');
        linkIcon.className = 'fas fa-arrow-up-right-from-square';
        link.appendChild(linkIcon);
        link.appendChild(document.createTextNode(t('notifications_open_link', 'فتح الرابط')));
        card.appendChild(link);
    }

    return card;
}

function renderMessage(iconClass, text, isError) {
    listEl.textContent = '';
    const box = document.createElement('div');
    box.className = 'sub-page-card';
    box.style.cssText = 'margin-bottom:0;text-align:center;padding:48px 24px;';
    const icon = document.createElement('i');
    icon.className = iconClass;
    icon.style.cssText = `font-size:2.4rem;display:block;margin-bottom:14px;opacity:.45;${isError ? 'color:var(--danger);' : ''}`;
    const label = document.createElement('p');
    label.style.margin = '0';
    label.textContent = text;
    box.appendChild(icon);
    box.appendChild(label);
    if (isError) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'enter-btn';
        retry.style.marginTop = '18px';
        retry.textContent = t('notifications_retry', 'إعادة المحاولة');
        retry.addEventListener('click', load);
        box.appendChild(retry);
    }
    listEl.appendChild(box);
}

function render() {
    if (!listEl || !loaded) return;
    if (!items.length) {
        renderMessage('fas fa-bell-slash', t('notifications_empty', 'لا توجد إشعارات بعد.'), false);
        return;
    }

    listEl.textContent = '';
    for (const item of items) {
        listEl.appendChild(buildCard(item));
    }
    markSeen();

    const focusId = new URLSearchParams(window.location.search).get('n');
    if (focusId) {
        const target = document.getElementById(`notice-${focusId}`);
        if (target) {
            target.style.borderColor = 'var(--primary-neon)';
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }
}

async function load() {
    if (!listEl) return;
    try {
        const lang = getCurrentLanguage() === 'en' ? 'en' : 'ar';
        const res = await fetch(`/api/notifications?lang=${lang}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success || !Array.isArray(data.items)) throw new Error('failed');
        ({ items } = data);
        loaded = true;
        render();
    } catch (_e) {
        loaded = true;
        renderMessage('fas fa-triangle-exclamation', t('notifications_error', 'تعذّر جلب الإشعارات.'), true);
    }
}

window.addEventListener('languageChanged', render);
load();