/* Joker Store Admin — PWA install banner (Android/Chrome + iOS).
 * يُعرض فقط داخل اللوحة عندما لا تكون مثبتة كتطبيق، ويطلب إضافة
 * اللوحة إلى الشاشة الرئيسية بأيقونة مستقلة لفتح /admin مباشرة.
 */
/* eslint-disable prefer-template -- innerHTML مجمع من أجزاء متغيرة */
(function () {
    'use strict';

    const DISMISS_KEY = 'joker_admin_install_dismissed';
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return;

    const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isAndroid = /android/i.test(window.navigator.userAgent);
    if (!isIOS && !isAndroid) return;

    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });

    const i18n = {
        title: 'أضف لوحة الإدارة للشاشة الرئيسية',
        body: isAndroid
            ? 'ثبّت اللوحة كتطبيق — تفتح مباشرة على الطلبات والمخزون بضغطة واحدة.'
            : 'أضف اللوحة لشاشة هاتفك — تفتح مباشرة على الطلبات والمخزون.',
        btn: 'تثبيت اللوحة',
        iosBtn: 'طريقة التثبيت',
        iosSteps: 'اضغط على زر المشاركة <b>⬆︎</b> أسفل متصفح Safari، ثم اختر <b>"إضافة إلى الشاشة الرئيسية"</b>.',
        later: 'لاحقاً'
    };

    function dismissed() {
        try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (_) { return false; }
    }

    function dismiss(bar) {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) {}
        if (bar) {
            bar.classList.remove('show');
            setTimeout(function () { bar.remove(); }, 300);
        }
        document.body.classList.remove('pwa-bar-visible');
    }

    function build() {
        if (dismissed()) return;
        const bar = document.createElement('div');
        bar.id = 'admin-install-bar';
        bar.className = 'pwa-install-bar';
        bar.setAttribute('role', 'dialog');
        bar.setAttribute('aria-label', i18n.title);
        bar.innerHTML =
            '<div class="pwa-install-icon"><img src="/image/apple-touch-icon.png" alt="" width="44" height="44" loading="lazy"></div>' +
            '<div class="pwa-install-text">' +
                '<strong>' + i18n.title + '</strong>' +
                '<span>' + i18n.body + '</span>' +
                '<div class="pwa-install-ios" hidden>' + i18n.iosSteps + '</div>' +
            '</div>' +
            '<div class="pwa-install-actions">' +
                '<button type="button" class="pwa-install-btn" id="adminInstallBtn">' + (isIOS ? i18n.iosBtn : i18n.btn) + '</button>' +
                '<button type="button" class="pwa-install-close" id="adminInstallClose" aria-label="' + i18n.later + '">&times;</button>' +
            '</div>';
        document.body.appendChild(bar);
        document.body.classList.add('pwa-bar-visible');
        requestAnimationFrame(function () { bar.classList.add('show'); });

        const btn = document.getElementById('adminInstallBtn');
        const closeBtn = document.getElementById('adminInstallClose');
        const iosBox = bar.querySelector('.pwa-install-ios');

        if (closeBtn) closeBtn.addEventListener('click', function () { dismiss(bar); });

        if (isIOS) {
            btn.addEventListener('click', function () { iosBox.hidden = !iosBox.hidden; });
            return;
        }

        btn.addEventListener('click', async function () {
            if (deferredPrompt) {
                const prompt = deferredPrompt;
                deferredPrompt = null;
                await prompt.prompt();
                await prompt.userChoice.catch(function () {});
                dismiss(bar);
                return;
            }
            // لا يوجد موجه (متصفح غير كروم): إرشاد يدوي
            iosBox.hidden = false;
        });
    }

    function init() {
        // تأخير بسيط حتى لا يزعج أول فتح — يظهر بعد 3 ثوانٍ
        setTimeout(build, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('appinstalled', function () { dismiss(document.getElementById('admin-install-bar')); });
})();
