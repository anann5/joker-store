/* Joker Store — native shell behaviors (Capacitor Android only).
 * 1) Hardware back button → close overlays / go back inside the SPA.
 * 2) Status bar colors follow the store theme (dark ↔ light).
 * The storefront runs from server.url, so the injected bridge is used
 * directly instead of bundled plugin proxies.
 */
(function () {
    'use strict';

    const cap = window.Capacitor;
    const isNative = Boolean(
        cap
        && typeof cap.isNativePlatform === 'function'
        && cap.isNativePlatform()
    );
    if (!isNative) return;

    function nativeCall(pluginName, method, options) {
        try {
            if (typeof cap.nativePromise !== 'function') return;
            const result = cap.nativePromise(pluginName, method, options || {});
            if (result && typeof result.catch === 'function') result.catch(function () {});
        } catch (_) {}
    }

    function nativeListener(pluginName, eventName, callback) {
        try {
            if (typeof cap.addListener === 'function') {
                return cap.addListener(pluginName, eventName, callback);
            }
        } catch (_) {}
        return null;
    }

    // ─── Status bar / safe area ───
    function isLightTheme() {
        return document.documentElement.getAttribute('data-theme') === 'light';
    }

    function syncStatusBar() {
        if (typeof cap.nativePromise !== 'function') return;
        const light = isLightTheme();
        nativeCall('StatusBar', 'setStyle', { style: light ? 'DARK' : 'LIGHT' });
        nativeCall('StatusBar', 'setBackgroundColor', { color: light ? '#EDF1FA' : '#0B0F1C' });
        nativeCall('StatusBar', 'setOverlaysWebView', { overlay: false });
    }

    syncStatusBar();
    try {
        new window.MutationObserver(syncStatusBar).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    } catch (_) {}

    window.setTimeout(function () { nativeCall('SplashScreen', 'hide'); }, 120);

    // ─── Back button helpers ───
    function closeLightbox() {
        const overlay = document.getElementById('lightboxOverlay');
        if (!overlay || !overlay.classList.contains('active')) return false;
        const close = overlay.querySelector('[data-lightbox-close]');
        if (close) {
            close.click();
        } else {
            overlay.classList.remove('active');
            overlay.setAttribute('inert', '');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }
        return true;
    }

    function closeTopModal() {
        const active = document.querySelector('.modal-overlay.active');
        if (!active) return false;
        const close = active.querySelector('[data-close-modal]');
        if (close) {
            close.click();
            return true;
        }
        // Escape يمرّ عبر closeModal في modals.js (ينظّف التركيز والتمرير)
        document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (active.classList.contains('active')) {
            active.classList.remove('active');
            active.removeAttribute('aria-modal');
            if (!document.querySelector('.modal-overlay.active')) {
                document.body.style.overflow = '';
            }
        }
        return true;
    }

    function closeMenus() {
        const header = document.querySelector('header');
        if (header && header.classList.contains('nav-open')) {
            const btn = document.getElementById('mobileMenuBtn');
            if (btn) btn.click();
            else header.classList.remove('nav-open');
            return true;
        }
        const dropdown = document.getElementById('categoriesDropdown');
        if (dropdown && dropdown.classList.contains('active')) {
            dropdown.classList.remove('active');
            const btn = document.getElementById('categoriesBtn');
            if (btn) btn.classList.remove('active');
            return true;
        }
        return false;
    }

    function goBackInPage() {
        const productBack = document.querySelector('.product-details-wrapper .back-to-main-btn');
        if (productBack) {
            productBack.click();
            return true;
        }
        const categoryBack = document.getElementById('back-container');
        if (categoryBack && !categoryBack.classList.contains('hidden')) {
            const btn = document.getElementById('backToMainBtn');
            if (btn) {
                btn.click();
                return true;
            }
        }
        return false;
    }

    function isHome() {
        const path = window.location.pathname;
        return path === '/' || path === '/index.html';
    }

    let hintTimer = null;

    function showHint(text) {
        let el = document.getElementById('native-back-hint');
        if (!el) {
            el = document.createElement('div');
            el.id = 'native-back-hint';
            el.setAttribute('role', 'status');
            el.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom, 0px));'
                + 'transform:translate(-50%,12px);z-index:10002;pointer-events:none;'
                + 'background:rgba(13,17,30,0.95);border:1px solid rgba(129,140,248,0.3);'
                + 'border-radius:999px;padding:9px 16px;color:#EDF1F8;'
                + 'font-family:inherit;font-size:.82rem;font-weight:700;white-space:nowrap;'
                + 'box-shadow:0 10px 26px rgba(3,6,14,0.55);opacity:0;'
                + 'transition:opacity .2s ease,transform .2s ease;';
            document.body.appendChild(el);
        }
        el.textContent = text;
        requestAnimationFrame(function () {
            el.style.opacity = '1';
            el.style.transform = 'translate(-50%,0)';
        });
        window.clearTimeout(hintTimer);
        hintTimer = window.setTimeout(function () {
            el.style.opacity = '0';
            el.style.transform = 'translate(-50%,12px)';
        }, 1800);
    }

    function exitHintText() {
        const lang = String(document.documentElement.getAttribute('lang') || 'ar').toLowerCase();
        return lang.indexOf('en') === 0
            ? 'Press back again to exit'
            : 'اضغط زر الرجوع مرة أخرى للخروج';
    }

    let exitArmed = false;
    let exitTimer = null;

    function resetExit() {
        exitArmed = false;
        window.clearTimeout(exitTimer);
    }

    function onBack() {
        if (closeLightbox() || closeTopModal() || closeMenus() || goBackInPage()) {
            resetExit();
            return;
        }

        if (!isHome()) {
            resetExit();
            if (window.history.length > 1) window.history.back();
            else window.location.replace('/');
            return;
        }

        if (exitArmed) {
            resetExit();
            nativeCall('App', 'minimizeApp');
            return;
        }

        exitArmed = true;
        showHint(exitHintText());
        exitTimer = window.setTimeout(resetExit, 2200);
    }

    nativeListener('App', 'backButton', onBack);
})();
