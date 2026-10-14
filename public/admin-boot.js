/**
 * admin-boot.js
 * Externalized bootstrap loader for the admin dashboard.
 * Loads /admin.js lazily (external file) so the page works under strict CSP
 * (no inline scripts allowed).
 */
(function () {
    // استعادة مظهر لوحة الأدمن قبل الرندر لمنع "وميض" اللون
    // الداكن هو النمط الأساسي: أول زيارة بلا تفضيل → داكن دائماً.
    try {
        const saved = localStorage.getItem('joker_admin_theme');
        if (saved === 'light' || saved === 'dark') {
            document.documentElement.setAttribute('data-theme', saved);
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('joker_admin_theme', 'dark');
        }
    } catch (_e) {}

    const overlay = document.getElementById('loadingOverlay');
    const script = document.createElement('script');
    script.src = '/admin.js';
    script.defer = true;

    script.onload = function () {
        if (overlay && !overlay.classList.contains('hidden')) {
            overlay.classList.add('hidden');
            setTimeout(function () {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 600);
        }
    };

    script.onerror = function () {
        console.error('Failed to load admin.js');
        if (overlay) {
            overlay.innerHTML = '<div class="loading-text"><span style="color:var(--danger)">خطأ في تحميل الواجهة</span></div>';
        }
    };

    document.body.appendChild(script);
})();
