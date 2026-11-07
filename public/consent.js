/* eslint-disable no-var */
// إدارة موافقة الكوكيز (Consent Management) — ملف مستقل يعمل على كل الصفحات
// دون الاعتماد على وحدات ES، ويعمل أيضاً إذا فشل أي سكربت آخر.
//
// المبادئ:
// 1) لا يُحمَّل أي تتبّع (GA / Meta Pixel) قبل موافقة صريحة.
// 2) "رفض غير الضروري" متاح بنفس سهولة "قبول الكل".
// 3) الاختيار يُحفظ محلياً ويعاد تطبيقه في كل زيارة.
// 4) Consent Mode v2 يُضبط افتراضياً على denied قبل تحميل أي وسم قياس.
(function () {
    'use strict';

    var STORAGE_KEY = 'joker_consent_v1';
    var VERSION = 1;
    var state = null;
    var bannerEl = null;
    var lastFocused = null;
    var domReady = false;

    var COPY = {
        ar: {
            title: 'نحترم خصوصيتك',
            desc: 'نستخدم كوكيز ضرورية لتشغيل المتجر (السلة وتسجيل الدخول)، وكوكيز اختيارية للتحليلات والقياس الإعلاني. لا نفعّل الاختيارية قبل موافقتك.',
            accept: 'قبول الكل',
            reject: 'رفض غير الضروري',
            customize: 'تخصيص',
            save: 'حفظ الاختيار',
            back: 'رجوع',
            close: 'إغلاق',
            necessaryTitle: 'ضرورية',
            necessaryDesc: 'لازمة لعمل السلة وتسجيل الدخول والأمان. لا يمكن تعطيلها.',
            analyticsTitle: 'تحليلات',
            analyticsDesc: 'تساعدنا على فهم استخدام الموقع لتحسينه (Google Analytics).',
            marketingTitle: 'تسويق',
            marketingDesc: 'تُستخدم لقياس حملاتنا الإعلانية (Meta Pixel).',
            alwaysOn: 'مفعّلة دائماً',
            settings: 'إعدادات الكوكيز',
            saved: 'تم حفظ اختيارك.',
            privacy: 'سياسة الخصوصية'
        },
        en: {
            title: 'We respect your privacy',
            desc: 'We use essential cookies to run the store (cart and sign-in), and optional cookies for analytics and ad measurement. Optional cookies stay off until you agree.',
            accept: 'Accept all',
            reject: 'Reject optional',
            customize: 'Customize',
            save: 'Save choices',
            back: 'Back',
            close: 'Close',
            necessaryTitle: 'Essential',
            necessaryDesc: 'Required for the cart, sign-in and security. Always on.',
            analyticsTitle: 'Analytics',
            analyticsDesc: 'Helps us understand how the site is used (Google Analytics).',
            marketingTitle: 'Marketing',
            marketingDesc: 'Used to measure our ad campaigns (Meta Pixel).',
            alwaysOn: 'Always on',
            settings: 'Cookie settings',
            saved: 'Your choice has been saved.',
            privacy: 'Privacy policy'
        }
    };

    /**
     * لغة الواجهة الحالية (الرابط ثم التخزين ثم لغة الصفحة).
     * @returns {'ar'|'en'}
     */
    function currentLang() {
        try {
            var params = new URLSearchParams(window.location.search);
            var fromUrl = params.get('lang');
            if (fromUrl === 'en' || fromUrl === 'ar') return fromUrl;
            var stored = localStorage.getItem('joker_language');
            if (stored === 'en' || stored === 'ar') return stored;
        } catch (_e) { /* التخزين قد يكون معطّلاً */ }
        return document.documentElement.lang === 'en' ? 'en' : 'ar';
    }

    function t(key) {
        var lang = currentLang();
        return (COPY[lang] || COPY.ar)[key];
    }

    /**
     * دفع أوامر Consent Mode إلى dataLayer (يعمل قبل تحميل gtag.js).
     * @param {string} command - default أو update.
     * @param {Object} values - قيم الموافقة.
     * @returns {void}
     */
    function pushConsent(command, values) {
        try {
            window.dataLayer = window.dataLayer || [];
            if (typeof window.gtag !== 'function') {
                window.gtag = function () { window.dataLayer.push(arguments); };
            }
            window.gtag('consent', command, values);
        } catch (_e) { /* لا شيء */ }
    }

    function consentPayload(on) {
        return {
            ad_storage: on.marketing ? 'granted' : 'denied',
            ad_user_data: on.marketing ? 'granted' : 'denied',
            ad_personalization: on.marketing ? 'granted' : 'denied',
            analytics_storage: on.analytics ? 'granted' : 'denied',
            functionality_storage: 'granted',
            security_storage: 'granted'
        };
    }

    function defaultConsent() {
        pushConsent('default', Object.assign({
            wait_for_update: 500
        }, consentPayload({ analytics: false, marketing: false })));
    }

    /**
     * قراءة الاختيار المحفوظ والتحقق من صحته.
     * @returns {Object|null}
     */
    function readStored() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== VERSION || typeof parsed.ts !== 'number') return null;
            return {
                version: VERSION,
                necessary: true,
                analytics: parsed.analytics === true,
                marketing: parsed.marketing === true,
                choice: parsed.choice || 'custom',
                ts: parsed.ts
            };
        } catch (_e) {
            return null;
        }
    }

    /**
     * حفظ الاختيار وتطبيقه فوراً.
     * @param {Object} next - {analytics, marketing, choice}
     * @returns {Object} الحالة المحفوظة.
     */
    function save(next) {
        state = {
            version: VERSION,
            necessary: true,
            analytics: next.analytics === true,
            marketing: next.marketing === true,
            choice: next.choice || 'custom',
            ts: Date.now()
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_e) { /* وضع التصفح الخاص */ }

        pushConsent('update', consentPayload(state));
        try {
            window.dispatchEvent(new CustomEvent('joker:consent-changed', { detail: state }));
        } catch (_e) { /* لا شيء */ }

        hideBanner();
        return state;
    }

    /**
     * هل منح الزائر موافقة Analytics؟
     * @returns {boolean}
     */
    function hasAnalyticsConsent() {
        return Boolean(state && state.analytics);
    }

    /**
     * هل منح الزائر موافقة التسويق؟
     * @returns {boolean}
     */
    function hasMarketingConsent() {
        return Boolean(state && state.marketing);
    }

    /**
     * بناء واجهة البانر (عناصر DOM آمنة، بلا HTML ديناميكي).
     * @returns {HTMLElement}
     */
    function buildBanner() {
        var wrap = document.createElement('div');
        wrap.className = 'cookie-banner';
        wrap.id = 'cookieBanner';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'false');
        wrap.setAttribute('aria-labelledby', 'cookieBannerTitle');
        wrap.setAttribute('aria-describedby', 'cookieBannerDesc');
        wrap.dir = currentLang() === 'ar' ? 'rtl' : 'ltr';

        var panel = document.createElement('div');
        panel.className = 'cookie-banner-panel';

        var head = document.createElement('div');
        head.className = 'cookie-banner-head';
        var title = document.createElement('h2');
        title.id = 'cookieBannerTitle';
        title.textContent = t('title');
        head.appendChild(title);

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'cookie-close';
        closeBtn.setAttribute('aria-label', t('close'));
        closeBtn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
        closeBtn.addEventListener('click', function () {
            save({ analytics: false, marketing: false, choice: 'rejected' });
        });
        head.appendChild(closeBtn);

        var desc = document.createElement('p');
        desc.id = 'cookieBannerDesc';
        desc.className = 'cookie-desc';
        desc.textContent = t('desc');

        var options = document.createElement('div');
        options.className = 'cookie-options';
        options.hidden = true;

        options.appendChild(buildOption('necessary', t('necessaryTitle'), t('necessaryDesc'), 'always').row);
        var analyticsToggle = buildOption('analytics', t('analyticsTitle'), t('analyticsDesc'));
        var marketingToggle = buildOption('marketing', t('marketingTitle'), t('marketingDesc'));
        options.appendChild(analyticsToggle.row);
        options.appendChild(marketingToggle.row);

        var actions = document.createElement('div');
        actions.className = 'cookie-actions';

        var customizeBtn = document.createElement('button');
        customizeBtn.type = 'button';
        customizeBtn.className = 'cookie-btn cookie-btn-ghost';
        customizeBtn.textContent = t('customize');

        var rejectBtn = document.createElement('button');
        rejectBtn.type = 'button';
        rejectBtn.className = 'cookie-btn cookie-btn-ghost';
        rejectBtn.textContent = t('reject');
        rejectBtn.addEventListener('click', function () {
            save({ analytics: false, marketing: false, choice: 'rejected' });
        });

        var acceptBtn = document.createElement('button');
        acceptBtn.type = 'button';
        acceptBtn.className = 'cookie-btn cookie-btn-primary';
        acceptBtn.textContent = t('accept');
        acceptBtn.addEventListener('click', function () {
            save({ analytics: true, marketing: true, choice: 'accepted' });
        });

        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'cookie-btn cookie-btn-primary';
        saveBtn.textContent = t('save');
        saveBtn.hidden = true;
        saveBtn.addEventListener('click', function () {
            save({
                analytics: analyticsToggle.input.checked,
                marketing: marketingToggle.input.checked,
                choice: 'custom'
            });
        });

        customizeBtn.addEventListener('click', function () {
            var showingOptions = !options.hidden;
            options.hidden = showingOptions;
            acceptBtn.hidden = !showingOptions;
            rejectBtn.hidden = !showingOptions;
            customizeBtn.textContent = showingOptions ? t('customize') : t('back');
            saveBtn.hidden = showingOptions;
            if (!showingOptions) analyticsToggle.input.focus();
        });

        actions.appendChild(customizeBtn);
        actions.appendChild(rejectBtn);
        actions.appendChild(acceptBtn);
        actions.appendChild(saveBtn);

        var privacyLink = document.createElement('a');
        privacyLink.className = 'cookie-privacy';
        privacyLink.href = '/privacy';
        privacyLink.textContent = t('privacy');

        panel.appendChild(head);
        panel.appendChild(desc);
        panel.appendChild(options);
        panel.appendChild(actions);
        panel.appendChild(privacyLink);
        wrap.appendChild(panel);
        return wrap;
    }

    /**
     * صف خيار واحد في لوحة التخصيص.
     * @param {string} name - analytics / marketing / necessary.
     * @param {string} title - العنوان.
     * @param {string} description - الشرح.
     * @param {string} [mode] - 'always' لخيار غير قابل للتعطيل.
     * @returns {{row: HTMLElement, input: HTMLInputElement}}
     */
    function buildOption(name, title, description, mode) {
        var row = document.createElement('div');
        row.className = 'cookie-option';

        var text = document.createElement('div');
        text.className = 'cookie-option-text';
        var heading = document.createElement('strong');
        heading.textContent = title;
        var para = document.createElement('span');
        para.textContent = description;
        text.appendChild(heading);
        text.appendChild(para);

        var input = document.createElement('input');
        input.type = 'checkbox';
        input.id = 'cookieOpt_' + name;
        input.className = 'cookie-switch';
        input.setAttribute('role', 'switch');
        if (mode === 'always') {
            input.checked = true;
            input.disabled = true;
            input.setAttribute('aria-label', t('alwaysOn'));
        } else {
            input.setAttribute('aria-label', title);
        }

        row.appendChild(text);
        row.appendChild(input);
        return { row: row, input: input };
    }

    /**
     * إظهار البانر (بعد بناء DOM).
     * @returns {void}
     */
    function showBanner() {
        if (!domReady || bannerEl) return;
        lastFocused = document.activeElement;
        bannerEl = buildBanner();
        document.body.appendChild(bannerEl);
        // إظهار فوري بعد إجبار المتصفح على حساب النمط الأولي، ثم تفعيل الانتقال.
        // (requestAnimationFrame لا يعمل في التبويبات الخلفية، وقد يترك البانر مخفياً.)
        void bannerEl.offsetWidth;
        bannerEl.classList.add('cookie-banner-visible');
        var first = bannerEl.querySelector('.cookie-btn-primary');
        if (first) first.focus({ preventScroll: true });
    }

    /**
     * إخفاء البانر وإعادة التركيز للعنصر السابق.
     * @returns {void}
     */
    function hideBanner() {
        if (!bannerEl) return;
        var node = bannerEl;
        bannerEl = null;
        node.classList.remove('cookie-banner-visible');
        window.setTimeout(function () {
            if (node.parentNode) node.parentNode.removeChild(node);
        }, 220);
        if (lastFocused && typeof lastFocused.focus === 'function') {
            try { lastFocused.focus({ preventScroll: true }); } catch (_e) { /* لا شيء */ }
        }
    }

    /**
     * فتح إعدادات الكوكيز من رابط الفوتر.
     * @returns {void}
     */
    function openSettings() {
        if (bannerEl) {
            var btn = bannerEl.querySelector('.cookie-btn-ghost');
            if (btn) btn.focus();
            return;
        }
        showBanner();
    }

    /**
     * حصر التركيز داخل البانر أثناء التنقل بلوحة المفاتيح.
     * @param {KeyboardEvent} event - حدث المفاتيح.
     * @returns {void}
     */
    function trapFocus(event) {
        if (!bannerEl || event.key !== 'Tab') return;
        var focusables = bannerEl.querySelectorAll('button:not([hidden]):not([disabled]), a[href], input:not([disabled])');
        if (!focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    /**
     * إضافة رابط "إعدادات الكوكيز" إلى فوتر الصفحة.
     * @returns {void}
     */
    function appendFooterLink() {
        var footerLinks = document.querySelector('.footer-links');
        if (!footerLinks || footerLinks.querySelector('[data-cookie-settings]')) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'footer-cookie-link';
        btn.setAttribute('data-cookie-settings', '1');
        btn.textContent = t('settings');
        btn.addEventListener('click', openSettings);
        footerLinks.appendChild(btn);
    }

    /**
     * إعادة رسم نصوص البانر عند تغيير اللغة.
     * @returns {void}
     */
    function refreshLanguage() {
        if (!bannerEl) return;
        var wasVisible = bannerEl.classList.contains('cookie-banner-visible');
        bannerEl.remove();
        bannerEl = null;
        showBanner();
        if (bannerEl && wasVisible) bannerEl.classList.add('cookie-banner-visible');
        var link = document.querySelector('[data-cookie-settings]');
        if (link) link.textContent = t('settings');
    }

    function init() {
        domReady = true;
        state = readStored();
        if (state) {
            pushConsent('update', consentPayload(state));
        }
        appendFooterLink();

        var wantsSettings = false;
        try {
            wantsSettings = new URLSearchParams(window.location.search).get('cookie-settings') === '1';
        } catch (_e) { /* لا شيء */ }

        if (!state || wantsSettings) {
            // تأخير بسيط حتى لا ينافس محتوى الصفحة الأساسي
            window.setTimeout(showBanner, state ? 0 : 900);
        }

        document.addEventListener('keydown', trapFocus);
        window.addEventListener('languageChanged', refreshLanguage);

        // إعلام سكربتات القياس بأن حالة الموافقة صارت متاحة
        try {
            window.dispatchEvent(new CustomEvent('joker:consent-ready', { detail: state }));
        } catch (_e) { /* لا شيء */ }
    }

    // إتاحة الواجهة البرمجية لسكربتات القياس
    window.JokerConsent = {
        get: function () { return state ? Object.assign({}, state) : null; },
        hasAnalyticsConsent: hasAnalyticsConsent,
        hasMarketingConsent: hasMarketingConsent,
        save: save,
        open: openSettings,
        reset: function () {
            try { localStorage.removeItem(STORAGE_KEY); } catch (_e) { /* لا شيء */ }
            state = null;
            pushConsent('update', consentPayload({ analytics: false, marketing: false }));
            window.setTimeout(showBanner, 0);
        },
        version: VERSION
    };

    // Consent Mode v2: افتراضي = رفض كل ما هو غير ضروري، قبل تحميل أي وسم قياس.
    defaultConsent();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
