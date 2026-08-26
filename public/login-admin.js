// منطق تسجيل دخول لوحة التحكم
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMsg = document.getElementById('errorMsg');

    const totpInput = document.getElementById('adminTotp');
    if (totpInput) totpInput.style.display = 'block';
    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const password = document.getElementById('adminPassword').value;
            const totp = document.getElementById('adminTotp')?.value?.trim() || undefined;

            try {
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password, ...(totp ? { totp } : {}) })
                });
                const data = await res.json();

                if (data.success) {
                    window.location.href = '/admin';
                } else {
                    errorMsg.textContent = data.message;
                    errorMsg.classList.add('visible');
                    if (data.message && data.message.includes('التحقق')) {
                        const t = document.getElementById('adminTotp');
                        if (t) { t.style.display = 'block'; t.focus(); }
                    }
                }
            } catch (err) {
                console.error('Login error:', err);
                errorMsg.textContent = '❌ فشل الاتصال بالسيرفر. يرجى المحاولة لاحقاً.';
                errorMsg.classList.add('visible');
            }
        };
    }
});
