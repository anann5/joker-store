// تحميل CSS غير حرج (الأيقونات والخطوط) بطريقة لا تمنع العرض وتتوافق مع CSP
// (لا مستمعون inline): نبدأ بـ media="print" ثم نفعّل النمط بعد اكتمال بناء DOM.
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('link[data-async-css]').forEach(function (link) {
        link.media = 'all';
    });
});