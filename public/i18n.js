let currentTranslations = {};
let currentLang = 'ar'; // سيتم تحديده بشكل صحيح في setLanguage
const I18N_BASE = new URL('.', import.meta.url).href;

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
        const response = await fetch(`${I18N_BASE}${lang}.json`);
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
 * يمر على جميع العناصر التي تحتوي على `data-i18n-key` ويترجمها.
 * يشمل أيضاً محتوى قوالب `<template>` حتى تظهر البطاقات المولّدة مترجمة،
 * ويدعم خصائص placeholder و title و aria-label.
 */
function translatePage() {
    const applyTranslation = (element, key) => {
        const translation = currentTranslations[key];
        if (!translation) return;
        if (element.hasAttribute('data-i18n-placeholder')) {
            element.placeholder = translation;
        } else if (element.hasAttribute('data-i18n-title')) {
            element.title = translation;
        } else if (element.hasAttribute('data-i18n-aria')) {
            element.setAttribute('aria-label', translation);
        } else {
            if (element.textContent === translation) return; // لا نعيد الرسم إن كان النص متطابقاً (يؤخر LCP)
            element.textContent = translation;
        }
    };

    // ترجمة العناصر الحية في الصفحة
    document.querySelectorAll('[data-i18n-key]').forEach(element => {
        applyTranslation(element, element.getAttribute('data-i18n-key'));
    });

    // ترجمة محتوى القوالب (يُستنسخ عند عرض البطاقات لاحقاً)
    document.querySelectorAll('template').forEach(template => {
        template.content.querySelectorAll('[data-i18n-key]').forEach(element => {
            applyTranslation(element, element.getAttribute('data-i18n-key'));
        });
    });

    // ترجمة عنوان الصفحة
    const pageTitleKey = document.querySelector('[data-page-title-key]')?.getAttribute('data-page-title-key');
    const titleKey = pageTitleKey || 'site_title';
    if (currentTranslations[titleKey]) {
        document.title = currentTranslations[titleKey];
    }

    // ترجمة وصوف meta (مثل meta[name=description])
    document.querySelectorAll('[data-i18n-meta]').forEach(element => {
        const translation = currentTranslations[element.getAttribute('data-i18n-meta')];
        if (translation) element.setAttribute('content', translation);
    });
}

/**
 * تهيئة نظام الترجمة عند تحميل الصفحة.
 * @returns {Promise<void>} وعد يكتمل عند تحميل الترجمات وتطبيقها.
 */
export function initI18n() {
    const initialLang = getInitialLanguage();
    const ready = setLanguage(initialLang);

    document.getElementById('lang-switcher').addEventListener('click', () => {
        const newLang = currentLang === 'ar' ? 'en' : 'ar';
        // إعادة تحميل الصفحة مع اللغة الجديدة في الرابط
        window.location.href = `${window.location.pathname  }?lang=${newLang}`;
    });

    return ready;
}

/**
 * دالة مساعدة للحصول على اللغة الحالية.
 */
export const getCurrentLanguage = () => currentLang;

/**
 * ترجمة مفتاح مباشرة من ملف الترجمة (للاستخدام في الكود الديناميكي).
 * @param {string} key - مفتاح الترجمة.
 * @param {string} [fallback] - قيمة احتياطية عند غياب المفتاح.
 * @returns {string}
 */
export function t(key, fallback = key) {
    return currentTranslations[key] ?? fallback;
}
