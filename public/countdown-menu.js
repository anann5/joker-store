(function () {
    'use strict';

    // ⏱️ عدّاد عرض اليوم
    const hoursEl = document.querySelector('[data-timer="hours"]');
    const minutesEl = document.querySelector('[data-timer="minutes"]');
    const secondsEl = document.querySelector('[data-timer="seconds"]');
    const pad = n => (n < 10 ? `0${n}` : String(n));

    if (hoursEl && minutesEl && secondsEl) {
        function updateCountdown() {
            const now = new Date();
            const midnight = new Date(now);
            midnight.setHours(24, 0, 0, 0);
            const totalSec = Math.max(0, Math.floor((midnight - now) / 1000));
            hoursEl.textContent = pad(Math.floor(totalSec / 3600));
            minutesEl.textContent = pad(Math.floor((totalSec % 3600) / 60));
            secondsEl.textContent = pad(totalSec % 60);
        }
        updateCountdown();
        setInterval(updateCountdown, 1000);
    }

    // 🍔 قائمة الموبايل
    const offerCta = document.querySelector('[data-offer-cta]');
    if (offerCta) {
        offerCta.addEventListener('click', function () {
            const target = document.getElementById('filterTabs');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const header = document.querySelector('header');
    if (mobileMenuBtn && header) {
        mobileMenuBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const open = header.classList.toggle('nav-open');
            mobileMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        document.addEventListener('click', function (e) {
            if (!e.target.closest('header')) header.classList.remove('nav-open');
        });
    }
})();