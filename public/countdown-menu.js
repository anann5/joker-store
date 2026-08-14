(function () {
    'use strict';

    // ⏱️ عدّاد عرض اليوم
    var hoursEl = document.querySelector('[data-timer="hours"]');
    var minutesEl = document.querySelector('[data-timer="minutes"]');
    var secondsEl = document.querySelector('[data-timer="seconds"]');
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };

    if (hoursEl && minutesEl && secondsEl) {
        function updateCountdown() {
            var now = new Date();
            var midnight = new Date(now);
            midnight.setHours(24, 0, 0, 0);
            var totalSec = Math.max(0, Math.floor((midnight - now) / 1000));
            hoursEl.textContent = pad(Math.floor(totalSec / 3600));
            minutesEl.textContent = pad(Math.floor((totalSec % 3600) / 60));
            secondsEl.textContent = pad(totalSec % 60);
        }
        updateCountdown();
        setInterval(updateCountdown, 1000);
    }

    // 🍔 قائمة الموبايل
    var offerCta = document.querySelector('[data-offer-cta]');
    if (offerCta) {
        offerCta.addEventListener('click', function () {
            var target = document.getElementById('filterTabs');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    var btn = document.getElementById('mobileMenuBtn');
    var header = document.querySelector('header');
    if (btn && header) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = header.classList.toggle('nav-open');
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        document.addEventListener('click', function (e) {
            if (!e.target.closest('header')) header.classList.remove('nav-open');
        });
    }
})();