// منطق تسجيل دخول لوحة التحكم
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMsg = document.getElementById('errorMsg');

    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const password = document.getElementById('adminPassword').value;

            try {
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const data = await res.json();

                if (data.success) {
                    // ملاحظة أمان: HttpOnly لا يعمل عبر document.cookie (يتجاهله المتصفح).
                    // الحماية الحالية: SameSite=Lax يمنع CSRF، و HTTPS في الإنتاج يحمي النقل.
                    // بالنسخة المحسّنة، يتم ضبط HttpOnly على مستوى الخادم.
                    document.cookie = `admin_token=${data.token}; path=/; SameSite=Lax; max-age=${12 * 3600}`;
                    window.location.href = '/admin';
                } else {
                    errorMsg.textContent = data.message;
                    errorMsg.classList.add('visible');
                }
            } catch (err) {
                console.error('Login error:', err);
                errorMsg.textContent = '❌ فشل الاتصال بالسيرفر. يرجى المحاولة لاحقاً.';
                errorMsg.classList.add('visible');
            }
        };
    }
});
