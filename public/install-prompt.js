/* Joker Store — PWA Install Button (Android/Chrome + iOS Safari instructions) */
(function () {
    'use strict';

    const STORAGE_KEY = 'joker_install_dismissed';
    const APK_URL = 'https://github.com/anann5/joker-store/releases/download/latest-apk/joker-store.apk';
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return; // already installed as app

    // داخل تطبيق أندرويد (Capacitor) لا نعرض البانر إطلاقاً
    if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return;

    const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isAndroid = /android/i.test(window.navigator.userAgent);
    if (!isIOS && !isAndroid) return; // desktop — no banner

    let t = null;
    try { t = JSON.parse(localStorage.getItem('joker_lang') || 'null'); } catch (_) {}
    const lang = (t && (t.lang || t.locale)) || (document.documentElement.getAttribute('lang') || 'ar');
    const isEn = String(lang).toLowerCase().indexOf('en') === 0;

    const i18n = {
        title: isEn ? 'Install Joker Store App' : 'ثبّت تطبيق Joker Store',
        body: isAndroid
            ? (isEn ? 'Download the official Android app (APK file).' : 'حمّل تطبيق أندرويد الرسمي (ملف APK).')
            : (isEn ? 'Add to your home screen — opens instantly like a native app.' : 'أضفه لشاشة هاتفك — يفتح فوراً مثل التطبيقات.'),
        btn: isEn ? 'Install' : 'تثبيت',
        iosBtn: isEn ? 'How to install' : 'طريقة التثبيت',
        iosSteps: isEn
            ? 'Tap the Share button <b>⬆︎</b> at the bottom of Safari, then choose <b>"Add to Home Screen"</b>.'
            : 'اضغط على زر المشاركة <b>⬆︎</b> أسفل متصفح Safari، ثم اختر <b>"إضافة إلى الشاشة الرئيسية"</b>.',
        close: isEn ? 'Close' : 'إغلاق'
    };

    function build() {
        const bar = document.createElement('div');
        bar.id = 'pwa-install-bar';
        bar.className = 'pwa-install-bar';
        bar.setAttribute('role', 'dialog');
        bar.setAttribute('aria-label', i18n.title);
        bar.innerHTML =
            `<div class="pwa-install-icon"><img src="/image/apple-touch-icon.png" alt="" width="44" height="44" loading="lazy"></div>` +
            `<div class="pwa-install-text">` +
                `<strong>${  i18n.title  }</strong>` +
                `<span>${  i18n.body  }</span>` +
                `<div class="pwa-install-ios" hidden>${  i18n.iosSteps  }</div>` +
            `</div>` +
            `<div class="pwa-install-actions">` +
                `<button type="button" class="pwa-install-btn" id="pwaInstallBtn">${  i18n.btn  }</button>` +
                `<button type="button" class="pwa-install-close" id="pwaInstallClose" aria-label="${  i18n.close  }">&times;</button>` +
            `</div>`;
        document.body.appendChild(bar);
        document.body.classList.add('pwa-bar-visible');
        requestAnimationFrame(function () { bar.classList.add('show'); });

        const btn = document.getElementById('pwaInstallBtn');
        const close = document.getElementById('pwaInstallClose');
        const iosBox = bar.querySelector('.pwa-install-ios');

        if (isIOS) {
            btn.textContent = i18n.iosBtn;
            btn.addEventListener('click', function () {
                iosBox.hidden = !iosBox.hidden;
            });
        } else {
            // أندرويد: زر التثبيت ينزّل ملف APK الحقيقي (وليس إضافة الصفحة للشاشة)
            btn.textContent = isEn ? 'Download app' : 'تحميل التطبيق';
            btn.addEventListener('click', function () {
                window.location.href = APK_URL;
            });
        }

        close.addEventListener('click', dismiss);
    }

    function dismiss() {
        const bar = document.getElementById('pwa-install-bar');
        if (bar) {
            bar.classList.remove('show');
            setTimeout(function () { bar.remove(); }, 300);
        }
        if (document.body) document.body.classList.remove('pwa-bar-visible');
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
    }

    function init() {
        try { if (localStorage.getItem(STORAGE_KEY)) return; } catch (_) {}
        if (!document.body) return;
        build();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('appinstalled', dismiss);
})();
