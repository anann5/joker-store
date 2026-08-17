// سكربت موحّد للصفحات الثانوية (من نحن / سياسة الخصوصية / الشروط / الأسئلة / تواصل معنا)
// بصيغة module خارجية ليتوافق مع سياسة CSP الصارمة (لا unsafe-inline).
import { initI18n, t } from './i18n.js';
initI18n();

// واجهة الأسئلة الشائعة (Accordion)
document.addEventListener('click', function (e) {
    const toggle = e.target.closest('[data-faq-toggle]');
    if (!toggle) return;
    const item = toggle.closest('.faq-item');
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(f => f.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
});

// نموذج التواصل
document.addEventListener('submit', async function (event) {
    if (event.target.id !== 'contactForm') return;
    event.preventDefault();
    const form = event.target;
    const result = document.getElementById('result');
    const submitBtn = form.querySelector('[type="submit"]');

    const payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        message: form.message.value.trim()
    };
    if (!payload.name || !payload.email || !payload.message) {
        result.className = 'sub-result err';
        result.textContent = t('contact_fields_required');
        return;
    }

    submitBtn.disabled = true;
    result.className = 'sub-result';
    result.textContent = t('contact_sending');

    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.ok && data.success) {
            result.className = 'sub-result ok';
            result.textContent = data.message || t('contact_success');
            form.reset();
        } else {
            result.className = 'sub-result err';
            result.textContent = data.message || t('contact_error');
        }
    } catch (_e) {
        result.className = 'sub-result err';
        result.textContent = t('contact_error');
    } finally {
        submitBtn.disabled = false;
    }
});