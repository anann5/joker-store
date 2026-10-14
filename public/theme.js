/* Theme switcher for the public storefront (light / dark / system) */
(function () {
    'use strict';

    const STORAGE_KEY = 'joker_theme';
    const LIGHT_META = '#E7EAF4';
    const DARK_META = '#0B0F1C';

    function savedTheme() {
        try {
            return localStorage.getItem(STORAGE_KEY) || '';
        } catch (_e) {
            return '';
        }
    }

    function currentTheme() {
        const attr = document.documentElement.getAttribute('data-theme');
        return attr === 'light' ? 'light' : 'dark';
    }

    function applyTheme(mode) {
        const root = document.documentElement;
        root.setAttribute('data-theme', mode === 'light' ? 'light' : 'dark');
        try {
            localStorage.setItem(STORAGE_KEY, mode === 'light' ? 'light' : 'dark');
        } catch (_e) { /* storage unavailable */ }
        syncMeta(mode !== 'light');
        syncIcons(mode);
    }

    function syncMeta(isLight) {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', isLight ? LIGHT_META : DARK_META);
    }

    function syncIcons(mode) {
        const iconClass = mode === 'light' ? 'fas fa-sun' : 'fas fa-moon';
        document.querySelectorAll('.theme-toggle-btn i').forEach(function (icon) {
            icon.className = iconClass;
        });
    }

    /* pre-paint restore so there is no flash of the wrong theme.
       الداكن هو النمط الأساسي الوحيد الظاهر افتراضياً:
       أي قيمة قديمة (auto/light) سابقة تُطبّع إلى داكن إلا الطلب الصريح 'light'. */
    const saved = savedTheme();
    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (saved !== 'dark') {
            try {
                localStorage.setItem(STORAGE_KEY, 'dark');
            } catch (_e) { /* storage unavailable */ }
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        syncIcons(currentTheme());
        const order = ['dark', 'light'];
        document.querySelectorAll('.theme-toggle-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const idx = order.indexOf(currentTheme());
                applyTheme(order[(idx + 1) % 2]);
            });
        });
    });
})();