// صفحة التحميل /download — تعبئة رابط APK وحجمه من آخر إصدار على GitHub Releases.
// ملف خارجي بدل سكربت سطري (سياسة CSP الصارمة تمنع السكربتات السطرية).
(function () {
    const siteUrlEl = document.getElementById('siteUrl');
    if (siteUrlEl) siteUrlEl.textContent = location.host || 'joker-store.onrender.com';

    const iosBtn = document.getElementById('iosBtn');
    const iosSteps = document.getElementById('iosSteps');
    if (iosBtn && iosSteps) {
        iosBtn.addEventListener('click', function () {
            iosSteps.hidden = !iosSteps.hidden;
        });
    }

    const apkBtn = document.getElementById('apkBtn');
    const apkNote = document.getElementById('apkNote');
    const apkSize = document.getElementById('apkSize');
    const androidSteps = document.getElementById('androidSteps');

    if (!apkBtn) return;

    // تحقق إن ملف الـ APK منشور فعلاً (لا يعطّل الزر عند فشل الفحص)
    fetch('https://api.github.com/repos/anann5/joker-store/releases/tags/latest-apk', { headers: { 'Accept': 'application/vnd.github+json' } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (rel) {
            const asset = (rel.assets || []).find(function (a) { return /\.apk$/i.test(a.name); });
            if (!asset) return;
            if (asset.browser_download_url) {
                apkBtn.href = `${asset.browser_download_url}?v=${encodeURIComponent(asset.updated_at || Date.now())}`;
            }
            if (apkSize) apkSize.textContent = `${Math.round(asset.size / 1048576)} ميجابايت`;
            if (apkNote) apkNote.textContent = `آخر تحديث: ${new Date(asset.updated_at).toLocaleDateString('ar-EG')}`;
        })
        .catch(function () { /* أبقِ زر التحميل مفعّلاً */ });

    apkBtn.addEventListener('click', function (e) {
        if (apkBtn.classList.contains('disabled')) { e.preventDefault(); return; }
        if (androidSteps) {
            androidSteps.hidden = false;
            androidSteps.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
})();
