// ======================================================
// modals.js — مساعدات النوافذ المنبثقة (وصولية + إغلاق آمن)
// يفتح/يغلق النوافذ عبر كلاس .active ويدير التركيز وقفل التمرير
// ونمط Escape وفخّ التبويب. لا يستورد أي ملف آخر لتفادي الدورات.
// ======================================================

const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * عناصر قابلة للتركيز داخل عنصر معيّن، مستثنياً الأقسام المخفية
 * (مثل لوحات إتمام الشراء غير النشطة المعتمدة على display:none).
 */
export function getFocusable(container) {
    const nodes = container.querySelectorAll(FOCUSABLE_SELECTOR);
    return Array.from(nodes).filter(el => {
        if (el.closest('.checkout-panel:not(.active)')) return false;
        return el.offsetParent !== null || el === container;
    });
}

function deriveModalLabel(overlay) {
    const heading = overlay.querySelector('h1, h2, h3, .modal-title, .cart-modal-header h2');
    if (heading && heading.textContent.trim()) return heading.textContent.trim().slice(0, 60);
    return overlay.id ? String(overlay.id).replace(/([A-Z])/g, ' $1').trim() : '';
}

let lastFocusedElement = null;
const escapeHandlers = new WeakMap();
const focusTrapHandlers = new WeakMap();

function uniqueFocusable(overlay) {
    const set = new Map();
    getFocusable(overlay).forEach(n => set.set(n, n));
    return [...set.values()];
}

function onEscape(overlay) {
    return (event) => {
        if (event.key === 'Escape' && overlay.classList.contains('active')) {
            closeModal(overlay);
        }
    };
}

function onTrap(overlay) {
    return (event) => {
        if (event.key !== 'Tab') return;
        const focusable = uniqueFocusable(overlay);
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }
        const [first] = focusable;
        const [last] = focusable.slice(-1);
        const active = document.activeElement;
        if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        } else if (!focusable.includes(active)) {
            event.preventDefault();
            (overlay.querySelector('[data-autofocus]') || first).focus();
        }
    };
}

/**
 * فتح نافذة منبثقة مع إدارة كاملة للوصولية والتركيز.
 * @param {HTMLElement} overlay
 * @returns {Function} دالة إغلاق النافذة
 */
export function openModal(overlay) {
    if (!overlay) return () => {};
    if (!overlay.classList.contains('active')) {
        lastFocusedElement = document.activeElement;
    }
    overlay.classList.add('active');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const label = deriveModalLabel(overlay);
    if (label) overlay.setAttribute('aria-label', label);

    if (!escapeHandlers.has(overlay)) escapeHandlers.set(overlay, onEscape(overlay));
    if (!focusTrapHandlers.has(overlay)) focusTrapHandlers.set(overlay, onTrap(overlay));
    document.addEventListener('keydown', escapeHandlers.get(overlay));
    document.addEventListener('keydown', focusTrapHandlers.get(overlay));

    document.body.style.overflow = 'hidden';

    // تأخير التركيز حتى يكتمل العرض (يقفز للـ data-autofocus إن وُجد)
    window.setTimeout(() => {
        const auto = overlay.querySelector('[data-autofocus]');
        const [first] = uniqueFocusable(overlay);
        if (auto) auto.focus();
        else if (first) first.focus();
    }, 60);

    return () => closeModal(overlay);
}

/**
 * إغلاق نافذة منبثقة واستعادة حالة الصفحة السابقة.
 */
export function closeModal(overlay) {
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.removeAttribute('aria-modal');

    const escapeHandler = escapeHandlers.get(overlay);
    const trapHandler = focusTrapHandlers.get(overlay);
    if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
    if (trapHandler) document.removeEventListener('keydown', trapHandler);
    escapeHandlers.delete(overlay);
    focusTrapHandlers.delete(overlay);

    // فكّ قفل التمرير فقط عند عدم وجود أي نافذة نشطة أخرى
    if (!document.querySelector('.modal-overlay.active')) {
        document.body.style.overflow = '';
    }

    if (lastFocusedElement && lastFocusedElement.isConnected) {
        lastFocusedElement.focus();
    }
}

/**
 * ربط سلوكيات عامة لكل النوافذ مرة واحدة:
 * - إغلاق البلسم بالنقر على الخلفية (وليس داخل المحتوى)
 * - إغلاق بالنقر على أي زر يحمل [data-close-modal]
 * يُستدعى مرة واحدة من initializeApp.
 */
export function initModalBehaviors() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (event) => {
            // نافذة السلة قد تكون في منتصف خطوات الشراء — لا تُغلق بالنقر خارجها
            if (overlay.id === 'purchaseModal') return;
            if (event.target === overlay) closeModal(overlay);
        });
        overlay.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => closeModal(overlay));
        });
    });
}