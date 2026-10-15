/* Joker Store — in-app APK update check (Capacitor native only).
 * Compares the latest GitHub release with the last seen one (localStorage).
 * First run records silently; a newer release shows a one-time update bar.
 */
(function () {
    'use strict';

    const KEY_SEEN = 'joker_apk_seen_at';
    const KEY_CHECK = 'joker_apk_check_at';
    const DAY_MS = 24 * 60 * 60 * 1000;
    const API_URL = 'https://api.github.com/repos/anann5/joker-store/releases/latest';

    function isNativeApp() {
        try {
            return Boolean(window.Capacitor
                && typeof window.Capacitor.isNativePlatform === 'function'
                && window.Capacitor.isNativePlatform());
        } catch (_) {
            return false;
        }
    }

    if (!isNativeApp()) return;

    const lang = (document.documentElement.getAttribute('lang') || 'ar');
    const isEn = String(lang).toLowerCase().indexOf('en') === 0;
    const i18n = {
        title: isEn ? 'New app version available' : 'يتوفر إصدار جديد من التطبيق',
        btn: isEn ? 'Update now' : 'حدّث الآن',
        later: isEn ? 'Later' : 'لاحقاً'
    };

    function get(key) {
        try {
            return localStorage.getItem(key);
        } catch (_) {
            return null;
        }
    }

    function set(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (_) {}
    }

    function showBar(publishedAt) {
        if (document.getElementById('app-update-bar')) return;
        const bar = document.createElement('div');
        bar.id = 'app-update-bar';
        bar.className = 'app-update-bar';
        bar.setAttribute('role', 'dialog');
        const go = document.createElement('a');
        go.className = 'app-update-btn';
        go.href = '/download';
        go.textContent = i18n.btn;
        const later = document.createElement('button');
        later.type = 'button';
        later.className = 'app-update-later';
        later.textContent = i18n.later;
        const txt = document.createElement('div');
        txt.className = 'app-update-text';
        const strong = document.createElement('strong');
        strong.textContent = i18n.title;
        txt.appendChild(strong);
        bar.appendChild(txt);
        bar.appendChild(go);
        bar.appendChild(later);
        function close(record) {
            if (record) set(KEY_SEEN, publishedAt);
            bar.classList.remove('show');
            setTimeout(function () { bar.remove(); }, 300);
        }
        later.addEventListener('click', function () { close(true); });
        go.addEventListener('click', function () { close(true); });
        document.body.appendChild(bar);
        requestAnimationFrame(function () { bar.classList.add('show'); });
    }

    function check() {
        const lastCheck = Number(get(KEY_CHECK) || '0');
        if (Date.now() - lastCheck < DAY_MS) return;
        set(KEY_CHECK, String(Date.now()));
        fetch(API_URL, { headers: { Accept: 'application/vnd.github+json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (rel) {
                if (!rel || !rel.published_at) return;
                const seen = get(KEY_SEEN);
                if (!seen) {
                    set(KEY_SEEN, rel.published_at);
                    return;
                }
                if (new Date(rel.published_at).getTime() > new Date(seen).getTime()) {
                    showBar(rel.published_at);
                }
            })
            .catch(function () {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', check);
    } else {
        check();
    }
})();
