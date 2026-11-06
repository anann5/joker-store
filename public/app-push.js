/* Joker Store — native app push registration (Capacitor only).
 * The storefront is loaded from server.url, so plugin JS proxies are not
 * installed in the page; we call the injected native bridge directly.
 * Registers the FCM token server-side, shows a quiet in-app toast for
 * foreground notifications, and deep-links taps to notification.data.url.
 */
(function () {
    'use strict';

    const LS_TOKEN = 'joker_fcm_token';

    function getCap() {
        const cap = window.Capacitor;
        return cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() ? cap : null;
    }

    function reportDiag(stage) {
        try {
            const ua = navigator.userAgent || '';
            const cap = window.Capacitor || null;
            fetch('/api/push/app-diag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stage: stage,
                    hasCapacitor: Boolean(cap),
                    isNative: cap && typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : null,
                    hasNativeBridge: Boolean(cap && typeof cap.nativePromise === 'function'),
                    ua: ua.slice(0, 140)
                })
            }).catch(function () {});
        } catch (_) {}
    }

    function nativeCall(cap, pluginName, method, options) {
        return new Promise(function (resolve) {
            try {
                const result = cap.nativePromise(pluginName, method, options || {});
                Promise.resolve(result).then(
                    function (data) { resolve({ ok: true, data: data }); },
                    function () { resolve({ ok: false, data: null }); }
                );
            } catch (_) {
                resolve({ ok: false, data: null });
            }
        });
    }

    function nativeListener(cap, pluginName, eventName, callback) {
        try {
            if (typeof cap.addListener === 'function') {
                return cap.addListener(pluginName, eventName, callback);
            }
        } catch (_) {}
        return null;
    }

    const cap = getCap();
    if (!cap) return;

    reportDiag('load');

    if (typeof cap.nativePromise !== 'function') {
        reportDiag('no-native-bridge');
        return;
    }

    function getLang() {
        try {
            return String(document.documentElement.getAttribute('lang') || 'ar').toLowerCase().indexOf('en') === 0
                ? 'en'
                : 'ar';
        } catch (_) {
            return 'ar';
        }
    }

    function getStoredToken() {
        try {
            return localStorage.getItem(LS_TOKEN) || null;
        } catch (_) {
            return null;
        }
    }

    let linkedThisSession = false;

    async function sendToken(token) {
        try {
            const res = await fetch('/api/push/fcm-token', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token, lang: getLang() })
            });
            if (res.ok) {
                linkedThisSession = true;
                try {
                    localStorage.setItem(LS_TOKEN, token);
                } catch (_) {}
                reportDiag('token-saved');
            }
        } catch (_) {}
    }

    // ربط/فكّ ربط الجهاز بالحساب فوراً عند تسجيل الدخول أو الخروج.
    window.addEventListener('joker-auth-changed', function () {
        const token = getStoredToken();
        if (token) sendToken(token);
    });

    function ensureNotifChannel() {
        nativeCall(cap, 'LocalNotifications', 'createChannel', {
            id: 'joker_push',
            name: 'Joker Store',
            description: 'إشعارات المتجر والعروض',
            importance: 5,
            visibility: 1,
            vibration: true
        });
    }

    function showSystemNotification(title, body, url) {
        nativeCall(cap, 'LocalNotifications', 'schedule', {
            notifications: [{
                id: Math.floor(Math.random() * 2147483000),
                title: title || 'Joker Store',
                body: body || '',
                channelId: 'joker_push',
                extra: { url: url || '/' }
            }]
        });
    }

    function inAppToast(title, body, href) {
        try {
            if (document.getElementById('app-push-toast')) return;
            const el = document.createElement('div');
            el.id = 'app-push-toast';
            el.setAttribute('role', 'status');
            el.style.cssText = 'position:fixed;inset-inline:12px;top:calc(env(safe-area-inset-top, 0px) + 12px);z-index:10001;'
                + 'background:rgba(13,17,30,0.95);border:1px solid rgba(129,140,248,0.35);'
                + 'border-radius:14px;padding:12px 14px;color:#EDF1F8;'
                + 'font-family:inherit;box-shadow:0 14px 34px rgba(3,6,14,0.6);'
                + 'transform:translateY(-140%);opacity:0;transition:transform .3s ease,opacity .3s ease;'
                + 'max-width:560px;margin:0 auto;';
            const strong = document.createElement('strong');
            strong.style.cssText = 'display:block;font-size:.9rem;margin-bottom:2px;';
            strong.textContent = title || 'Joker Store';
            const span = document.createElement('div');
            span.style.cssText = 'font-size:.8rem;color:#C3CBD9;line-height:1.5;';
            span.textContent = body || '';
            el.appendChild(strong);
            el.appendChild(span);
            document.body.appendChild(el);
            requestAnimationFrame(function () {
                el.style.transform = 'translateY(0)';
                el.style.opacity = '1';
            });
            setTimeout(function () {
                el.style.transform = 'translateY(-140%)';
                el.style.opacity = '0';
                setTimeout(function () { el.remove(); }, 350);
            }, href ? 9000 : 5000);
            el.addEventListener('click', function () {
                el.remove();
                if (href) openDeepLink(href);
            });
            if (href) el.style.cursor = 'pointer';
        } catch (_) {}
    }

    function openDeepLink(url) {
        if (typeof url !== 'string' || url.charAt(0) !== '/' || url.charAt(1) === '/') return;
        window.location.href = url;
    }

    const SEEN_NOTICE_KEY = 'joker_seen_notice';

    // الضغط على إشعار والتطبيق مغلق قد يسبق تحميل الصفحة فيضيع الحدث؛
    // هذا الشريط يضمن رؤية الإشعار الجديد عند فتح التطبيق.
    async function announceUnseenNotice() {
        try {
            const res = await fetch(`/api/notifications?lang=${getLang()}`);
            const data = await res.json();
            if (!data.success || !Array.isArray(data.items) || !data.items.length) return;
            const [latest] = data.items;
            let seen = null;
            try {
                seen = localStorage.getItem(SEEN_NOTICE_KEY);
            } catch (_) {}
            if (seen === latest.id) return;
            const cta = getLang() === 'en'
                ? 'Tap to read the full notification.'
                : 'اضغط هنا لقراءة الإشعار كاملاً.';
            inAppToast(latest.title || 'Joker Store', cta, '/notifications');
        } catch (_) {}
    }

    async function init() {
        if (typeof cap.nativePromise !== 'function') return;

        announceUnseenNotice();

        const perm = await nativeCall(cap, 'PushNotifications', 'requestPermissions');
        reportDiag(`perm:${perm.data && perm.data.receive ? perm.data.receive : 'unknown'}`);
        if (perm.data && perm.data.receive === 'denied') return;

        ensureNotifChannel();

        // المستمعون قبل register() حتى لا يضيع حدث التوكن.
        nativeListener(cap, 'LocalNotifications', 'localNotificationActionPerformed', function (a) {
            try {
                openDeepLink(a && a.notification && a.notification.extra && a.notification.extra.url);
            } catch (_) {}
        });

        nativeListener(cap, 'PushNotifications', 'registration', function (t) {
            if (!t || !t.value) return;
            reportDiag('got-token');
            // كل تشغيل: أعد الإرسال لربط الجهاز بالجلسة الحالية (أو كزائر).
            if (t.value !== getStoredToken() || !linkedThisSession) sendToken(t.value);
        });

        nativeListener(cap, 'PushNotifications', 'registrationError', function (e) {
            reportDiag(`reg-error:${JSON.stringify(e).slice(0, 160)}`);
        });

        nativeListener(cap, 'PushNotifications', 'pushNotificationReceived', function (n) {
            let title = '';
            let body = '';
            let url = '';
            try {
                title = (n && (n.title || (n.data && (n.data.title || n.data.pin)))) || '';
                body = (n && (n.body || (n.data && n.data.body))) || '';
                url = (n && n.data && n.data.url) || '';
            } catch (_) {}
            const href = typeof url === 'string' && url.charAt(0) === '/' ? url : '';
            if (title || body) inAppToast(title, body, href);
            // إظهار الإشعار في شريط إشعارات النظام حتى والتطبيق مفتوح
            showSystemNotification(title, body, href);
        });

        nativeListener(cap, 'PushNotifications', 'pushNotificationActionPerformed', function (a) {
            try {
                openDeepLink(a && a.notification && a.notification.data && a.notification.data.url);
            } catch (_) {}
        });

        const registered = await nativeCall(cap, 'PushNotifications', 'register');
        reportDiag(registered.ok ? 'register-ok' : 'register-failed');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
