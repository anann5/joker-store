let currentTranslations = {};
let currentLang = 'ar'; // سيتم تحديده بشكل صحيح في setLanguage

/**
 * يحدد اللغة الأولية بناءً على رابط URL ثم التخزين المحلي.
 */
function getInitialLanguage() {
    const urlParams = new URLSearchParams(window.location.search);
    const langFromUrl = urlParams.get('lang');
    if (langFromUrl === 'en' || langFromUrl === 'ar') {
        return langFromUrl;
    }
    return localStorage.getItem('joker_language') || 'ar';
}

/**
 * تحميل ملف الترجمة وتطبيقه على الصفحة.
 * @param {string} lang - رمز اللغة (مثال: 'ar' أو 'en').
 */
async function setLanguage(lang) {
    if (!lang || !['ar', 'en'].includes(lang)) lang = 'ar'; // حماية إضافية
    try {
        currentLang = lang;
        // تعديل: جلب الملفات من المجلد الرئيسي مباشرة
        const response = await fetch(`${lang}.json`);
        if (!response.ok) {
            return;
        }
        currentTranslations = await response.json();

        // حفظ اللغة المختارة
        localStorage.setItem('joker_language', lang);

        // تحديث اتجاه الصفحة واللغة
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

        // تحديث نص زر تبديل اللغة
        const langSwitcher = document.getElementById('lang-switcher');
        if (langSwitcher) langSwitcher.querySelector('span').textContent = lang === 'ar' ? 'EN' : 'AR';

        // تطبيق الترجمات على جميع العناصر
        translatePage();

        // إعادة تحميل المحتوى الديناميكي
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: lang } }));

    } catch (_error) {
        // Errors are handled gracefully by not translating.
    }
}

/**
 * يمر على جميع العناصر التي تحتوي على `data-i18n` ويترجمها.
 */
function translatePage() {
    document.querySelectorAll('[data-i18n-key]').forEach(element => {
        const key = element.getAttribute('data-i18n-key');
        const translation = currentTranslations[key];
        if (translation) {
            // التحقق إذا كان يجب تغيير placeholder أو المحتوى النصي
            if (element.hasAttribute('data-i18n-placeholder')) {
                element.placeholder = translation;
            } else {
                element.textContent = translation;
            }
        }
    });
    // ترجمة عنوان الصفحة
    if (currentTranslations.site_title) {
        document.title = currentTranslations.site_title;
    }
}

/**
 * تهيئة نظام الترجمة عند تحميل الصفحة.
 */
export function initI18n() {
    const initialLang = getInitialLanguage();
    setLanguage(initialLang);

    document.getElementById('lang-switcher').addEventListener('click', () => {
        const newLang = currentLang === 'ar' ? 'en' : 'ar';
        // إعادة تحميل الصفحة مع اللغة الجديدة في الرابط
        window.location.href = `${window.location.pathname  }?lang=${newLang}`;
    });
}

/**
 * دالة مساعدة للحصول على اللغة الحالية.
 */
export const getCurrentLanguage = () => currentLang;