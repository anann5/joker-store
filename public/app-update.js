/* Joker Store — in-app update checks (Capacitor native + web).
 * 1) APK check (native only): compares the latest GitHub release with the
 *    last seen one (localStorage). Shows a one-time update bar → /download.
 * 2) Web-version check (الخطة A): compares /api/app/web-version with the
 *    last seen web version. When the storefront structure changes (files in
 *    public/), the app shows "اطلب التحديث → إعادة تحميل" instead of
 *    staying on the old bundle. The reload fetches the new files (JS/CSS are
 *    served no-cache/ETag), so no new APK is needed for structure changes.
 */
(function () {
    'use strict';

    const KEY_SEEN = 'joker_apk_seen_at';
    const KEY_CHECK = 'joker_apk_check_at';
    const KEY_WEB_SEEN = 'joker_web_seen_version';
    const KEY_WEB_CHECK = 'joker_web_check_at';
    const DAY_MS = 24 * 60 * 60 * 1000;
    const HOUR_MS = 60 * 60 * 1000;
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

    const lang = (document.documentElement.getAttribute('lang') || 'ar');
    const isEn = String(lang).toLowerCase().indexOf('en') === 0;
    const i18n = {
        apkTitle: isEn ? 'New app version available' : 'يتوفر إصدار جديد من التطبيق',
        apkBtn: isEn ? 'Update now' : 'حدّث الآن',
        webTitle: isEn ? 'New site version available' : 'يتوفر تحديث جديد للموقع',
        webHint: isEn ? 'Refresh to see the new design.' : 'أعد التحميل لترى التصميم الجديد.',
        reloadBtn: isEn ? 'Refresh now' : 'تحديث الآن',
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

    function showBar({ id, title, hint, btnText, onAction }) {
        if (document.getElementById(id)) return;
        const bar = document.createElement('div');
        bar.id = id;
        bar.className = 'app-update-bar';
        bar.setAttribute('role', 'dialog');
        const txt = document.createElement('div');
        txt.className = 'app-update-text';
        const strong = document.createElement('strong');
        strong.textContent = title;
        txt.appendChild(strong);
        if (hint) {
            const small = document.createElement('small');
            small.textContent = hint;
            small.style.display = 'block';
            small.style.opacity = '.85';
            small.style.marginTop = '2px';
            txt.appendChild(small);
        }
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'app-update-btn';
        action.textContent = btnText;
        const later = document.createElement('button');
        later.type = 'button';
        later.className = 'app-update-later';
        later.textContent = i18n.later;
        bar.appendChild(txt);
        bar.appendChild(action);
        bar.appendChild(later);
        function close(record) {
            if (record) record();
            bar.classList.remove('show');
            setTimeout(function () { bar.remove(); }, 300);
        }
        later.addEventListener('click', function () { close(onAction && onAction.dismiss); });
        action.addEventListener('click', function () { close(onAction && onAction.confirm); if (onAction && onAction.confirm) onAction.confirm(); });
        document.body.appendChild(bar);
        requestAnimationFrame(function () { bar.classList.add('show'); });
    }

    // ===== 1) APK update (native only, daily) =====
    function releaseStamp(rel) {
        const times = (rel.assets || [])
            .map(function (a) { return Date.parse(a.updated_at || ''); })
            .filter(function (t) { return Number.isFinite(t); });
        if (times.length) return Math.max.apply(null, times);
        const published = Date.parse(rel.published_at || '');
        return Number.isFinite(published) ? published : 0;
    }

    function checkApk() {
        if (!isNativeApp()) return;
        const lastCheck = Number(get(KEY_CHECK) || '0');
        if (Date.now() - lastCheck < DAY_MS) return;
        set(KEY_CHECK, String(Date.now()));
        fetch(API_URL, { headers: { Accept: 'application/vnd.github+json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (rel) {
                if (!rel) return;
                const stamp = releaseStamp(rel);
                if (!stamp) return;
                const seen = Number(get(KEY_SEEN) || '0');
                if (!Number.isFinite(seen) || !seen) {
                    set(KEY_SEEN, String(stamp));
                    return;
                }
                if (stamp > seen) {
                    showBar({
                        id: 'app-update-bar',
                        title: i18n.apkTitle,
                        btnText: i18n.apkBtn,
                        onAction: {
                            dismiss: function () { set(KEY_SEEN, String(stamp)); },
                            confirm: function () {
                                set(KEY_SEEN, String(stamp));
                                window.location.assign('/download');
                            }
                        }
                    });
                }
            })
            .catch(function () {});
    }

    // ===== 2) Web version (all contexts, hourly) =====
    function checkWebVersion() {
        const lastCheck = Number(get(KEY_WEB_CHECK) || '0');
        if (Date.now() - lastCheck < HOUR_MS) return;
        set(KEY_WEB_CHECK, String(Date.now()));
        fetch('/api/app/web-version', { headers: { Accept: 'application/json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data || !data.success || !data.webVersion) return;
                const current = String(data.webVersion);
                const seen = get(KEY_WEB_SEEN);
                // أول تشغيل: تسجيل بصمت دون إزعاج
                if (!seen) {
                    set(KEY_WEB_SEEN, current);
                    return;
                }
                if (seen !== current) {
                    showBar({
                        id: 'app-web-update-bar',
                        title: i18n.webTitle,
                        hint: i18n.webHint,
                        btnText: i18n.reloadBtn,
                        onAction: {
                            dismiss: function () { set(KEY_WEB_SEEN, current); },
                            confirm: function () {
                                set(KEY_WEB_SEEN, current);
                                window.location.reload();
                            }
                        }
                    });
                }
            })
            .catch(function () {});
    }

    function start() {
        checkApk();
        checkWebVersion();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
