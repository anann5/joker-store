// تحميل أدوات القياس (Google Analytics / Meta Pixel) بعد موافقة الزائر فقط.
// كل التحميل يتم من هذا الملف الخارجي — لا سكربتات inline — ليتوافق مع CSP الصارمة.
// إن لم تُضبط معرّفات القياس في البيئة فلا يُحمَّل أي شيء.

let analyticsConfig = { gaId: '', metaPixelId: '' };
let gaLoaded = false;
let pixelLoaded = false;

/**
 * قراءة الموافقة الحالية بأمان (تعمل حتى لو لم يُحمَّل consent.js بعد).
 * @returns {{analytics: boolean, marketing: boolean}}
 */
function getConsent() {
    try {
        if (window.JokerConsent && typeof window.JokerConsent.get === 'function') {
            const state = window.JokerConsent.get();
            if (state) {
                return {
                    analytics: state.analytics === true,
                    marketing: state.marketing === true
                };
            }
        }
    } catch (_error) { /* لا شيء */ }
    return { analytics: false, marketing: false };
}

/**
 * يضمن وجود دالة gtag المبدئية على window قبل تحميل gtag.js.
 * @returns {void}
 */
function ensureGtag() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
        window.gtag = function gtag() {
            // arguments مقصودة: gtag.js يقرأها بهذا الشكل
            window.dataLayer.push(arguments);
        };
    }
}

/**
 * تحميل Google Analytics مرة واحدة.
 * @param {string} gaId - معرّف القياس.
 * @returns {void}
 */
function loadAnalytics(gaId) {
    if (gaLoaded || !gaId) return;
    gaLoaded = true;
    ensureGtag();

    const script = document.createElement('script');
    script.async = true;
    script.dataset.ga = '1';
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(script);

    window.gtag('js', new Date());
    window.gtag('config', gaId, { anonymize_ip: true });
}

/**
 * تحميل Meta Pixel مرة واحدة (نسخة خارجية من الكود الرسمي بلا inline).
 * @param {string} pixelId - معرّف البكسل.
 * @returns {void}
 */
function loadMarketingPixel(pixelId) {
    if (pixelLoaded || !pixelId) return;
    pixelLoaded = true;

    if (typeof window.fbq !== 'function') {
        const fbq = function fbq() {
            if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
            else fbq.queue.push(arguments);
        };
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = '2.0';
        fbq.queue = [];
        window.fbq = fbq;
        if (!window._fbq) window._fbq = fbq;

        const script = document.createElement('script');
        script.async = true;
        script.dataset.metaPixel = '1';
        script.src = 'https://connect.facebook.net/en_US/fbevents.js';
        document.head.appendChild(script);
    }

    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
}

/**
 * يزامن التحميل مع حالة الموافقة الحالية.
 * @returns {void}
 */
function syncConsent() {
    const consent = getConsent();
    if (consent.analytics) loadAnalytics(analyticsConfig.gaId);
    if (consent.marketing) loadMarketingPixel(analyticsConfig.metaPixelId);
}

/**
 * تهيئة القياس (تُستدعى مرة بعد جلب إعدادات الموقع).
 * @param {Object} analytics - { gaId, metaPixelId }
 * @returns {void}
 */
export function initAnalytics(analytics = {}) {
    analyticsConfig = {
        gaId: String(analytics.gaId || ''),
        metaPixelId: String(analytics.metaPixelId || '')
    };

    syncConsent();
    window.addEventListener('joker:consent-changed', syncConsent);
    window.addEventListener('joker:consent-ready', syncConsent);
}

/**
 * إرسال حدث قياس — يُتجاهل تماماً بلا موافقة تحليلات.
 * @param {string} name - اسم الحدث.
 * @param {Object} [params] - خصائص الحدث.
 * @returns {void}
 */
export function trackEvent(name, params = {}) {
    if (!getConsent().analytics) return;
    try {
        ensureGtag();
        window.gtag('event', name, params);
    } catch (_error) { /* القياس لا يكسر الواجهة */ }
}
