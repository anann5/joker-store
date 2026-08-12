/**
 * admin-boot.js
 * Externalized bootstrap loader for the admin dashboard.
 * Loads /admin.js lazily (external file) so the page works under strict CSP
 * (no inline scripts allowed).
 */
(function () {
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
