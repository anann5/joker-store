/* Joker Store — native app push registration (Capacitor only).
 * Uses the injected Capacitor runtime directly (no bundler needed for server.url apps).
 * Registers the FCM token server-side, shows a quiet in-app toast for
 * foreground notifications, and deep-links taps to notification.data.url.
 */
(function () {
    'use strict';

    const LS_TOKEN = 'joker_fcm_token';

    function isNativeApp() {
        try {
            return Boolean(window.Capacitor
                && typeof window.Capacitor.isNativePlatform === 'function'
                && window.Capacitor.isNativePlatform());
        } catch (_) {
            return false;
        }
    }

    function reportDiag(stage) {
        try {
            const ua = navigator.userAgent || '';
            const cap = window.Capacitor || null;
            const plugins = cap && cap.Plugins ? Object.keys(cap.Plugins) : [];
            fetch('/api/push/app-diag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stage: stage,
                    hasCapacitor: Boolean(cap),
                    isNative: cap && typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : null,
                    pushPlugins: plugins.filter(function (p) { return /push/i.test(p); }),
                    ua: ua.slice(0, 140)
                })
            }).catch(function () {});
        } catch (_) {}
    }

    // تشخيص: يُبلّغ حالة الجسر (يعمل حتى لو غاب الجسر) — مؤقت
    reportDiag('load');

    if (!isNativeApp()) return;

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

    async function sendToken(token) {
        try {
            const res = await fetch('/api/push/fcm-token', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token, lang: getLang() })
            });
            if (res.ok) {
                try {
                    localStorage.setItem(LS_TOKEN, token);
                } catch (_) {}
                reportDiag('token-saved');
            }
        } catch (_) {}
    }

    function getPlugin(name) {
        try {
            return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;
        } catch (_) {
            return null;
        }
    }

    function ensureNotifChannel() {
        const LN = getPlugin('LocalNotifications');
        if (!LN || typeof LN.createChannel !== 'function') return;
        try {
            LN.createChannel({
                id: 'joker_push',
                name: 'Joker Store',
                description: 'إشعارات المتجر والعروض',
                importance: 5,
                visibility: 1,
                vibration: true
            }).catch(function () {});
        } catch (_) {}
    }

    function showSystemNotification(title, body, url) {
        const LN = getPlugin('LocalNotifications');
        if (!LN || typeof LN.schedule !== 'function') return;
        try {
            LN.schedule({
                notifications: [{
                    id: Math.floor(Math.random() * 2147483000),
                    title: title || 'Joker Store',
                    body: body || '',
                    channelId: 'joker_push',
                    extra: { url: url || '/' }
                }]
            }).catch(function () {});
        } catch (_) {}
    }

    function inAppToast(title, body) {
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
            }, 5000);
            el.addEventListener('click', function () { el.remove(); });
        } catch (_) {}
    }

    async function init() {
        try {
            const Plugins = window.Capacitor && window.Capacitor.Plugins;
            const Push = Plugins && Plugins.PushNotifications;
            if (!Push || typeof Push.requestPermissions !== 'function') { reportDiag('no-push-plugin'); return; }

            let perm = null;
            try {
                perm = await Push.requestPermissions();
            } catch (_) {
                perm = null;
            }
            reportDiag(`perm:${  perm && perm.receive ? perm.receive : 'unknown'}`);
            if (perm && perm.receive === 'denied') return;

            try {
                await Push.register();
                reportDiag('register-ok');
            } catch (_) {
                reportDiag('register-failed');
                return;
            }

            ensureNotifChannel();
            const LocalNotif = getPlugin('LocalNotifications');
            if (LocalNotif && typeof LocalNotif.addListener === 'function') {
                LocalNotif.addListener('localNotificationActionPerformed', function (a) {
                    try {
                        const url = a && a.notification && a.notification.extra && a.notification.extra.url;
                        if (typeof url === 'string' && url.charAt(0) === '/') window.location.href = url;
                    } catch (_) {}
                });
            }

            if (typeof Push.addListener === 'function') {
                Push.addListener('registration', function (t) {
                    if (t && t.value) { reportDiag('got-token'); if (t.value !== getStoredToken()) sendToken(t.value); }
                });
                Push.addListener('registrationError', function (e) { reportDiag(`reg-error:${  JSON.stringify(e).slice(0, 160)}`); });
                Push.addListener('pushNotificationReceived', function (n) {
                    let title = '';
                    let body = '';
                    let url = '';
                    try {
                        title = (n && (n.title || (n.data && (n.data.title || n.data.pin)))) || '';
                        body = (n && (n.body || (n.data && n.data.body))) || '';
                        url = (n && n.data && n.data.url) || '';
                    } catch (_) {}
                    if (title || body) inAppToast(title, body);
                    // إظهار الإشعار في شريط إشعارات النظام حتى والتطبيق مفتوح
                    showSystemNotification(title, body, url);
                    if (url && typeof url === 'string' && url.charAt(0) === '/') {
                        // foreground tap-through: keep the toast tappable to open
                        const el = document.getElementById('app-push-toast');
                        if (el) {
                            el.style.cursor = 'pointer';
                            el.addEventListener('click', function () { window.location.href = url; });
                        }
                    }
                });
                Push.addListener('pushNotificationActionPerformed', function (a) {
                    try {
                        const url = a && a.notification && a.notification.data && a.notification.data.url;
                        if (typeof url === 'string' && url.charAt(0) === '/') window.location.href = url;
                    } catch (_) {}
                });
            }
        } catch (_) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
