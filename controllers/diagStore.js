/**
 * مخزن تشخيص مؤقت داخل الذاكرة لتقارير تطبيق الجوال (app-diag).
 * يحتفظ بآخر N تقرير لعرضها في لوحة الأدمن دون الحاجة لسجلات الخادم.
 */
const MAX = 30;
const entries = [];

function push(entry) {
    try {
        entries.unshift(Object.assign({ ts: new Date().toISOString() }, entry));
        if (entries.length > MAX) entries.length = MAX;
    } catch (_) { /* تجاهل */ }
}

function list() {
    return entries;
}

function clear() {
    entries.length = 0;
}

module.exports = { push, list, clear };
