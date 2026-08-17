// ======================================================
// shared.js — أدوات مشتركة محايدة
// لا تستورد من ملفات لواجهة التفاعل (ui.js/script.js) لتفادي
// الاستيراد الدائري — يستورد من i18n.js فقط.
// ======================================================
import { t } from './i18n.js';

export const rawServerData = { categories: {} };

export function renderRatingStars(rating = 0, reviewsCount = 0) {
    const value = Number(rating) || 0;
    const rounded = Math.max(0, Math.min(5, Math.round(value)));
    if (rounded <= 0) return '';
    const filled = '★'.repeat(rounded);
    const empty = '★'.repeat(5 - rounded);
    const count = Number(reviewsCount) > 0
        ? `<span class="rating-count">(${Number(reviewsCount)})</span>`
        : '';
    const numeric = Number(reviewsCount) > 0 && Number.isFinite(value)
        ? `<span class="rating-value">${value.toFixed(1)}</span>`
        : '';
    return `${numeric}<span class="rating-stars">${filled}<span class="empty">${empty}</span></span>${count}`;
}

export function renderStockBadge(availableStock) {
    if (availableStock === null || availableStock === undefined) return '';
    const count = Math.max(0, Number(availableStock) || 0);
    if (count === 0) return t('stock_out');
    if (count < 10) return t('stock_low').replace('{count}', String(count));
    return t('stock_in_stock');
}

const WISHLIST_KEY = 'joker_wishlist';

export function getWishlist() {
    try {
        const parsed = JSON.parse(localStorage.getItem(WISHLIST_KEY));
        return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
        return [];
    }
}

export function toggleWishlistKey(id) {
    let ids = getWishlist();
    const added = !ids.includes(id);
    ids = added ? [...ids, id] : ids.filter(x => x !== id);
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids));
    syncWishlistButtons();
    return added;
}

export function syncWishlistButtons() {
    const ids = getWishlist();
    document.querySelectorAll('[data-wishlist-btn]').forEach(btn => {
        const id = btn.dataset.productId;
        if (!id) return;
        const active = ids.includes(id);
        btn.classList.toggle('active', active);
        const icon = btn.querySelector('i');
        if (icon) icon.className = active ? 'fas fa-heart' : 'far fa-heart';
    });
}

/**
 * توحيد مسار صورة إلى مسار مطلق، بغض النظر عن المسار الحالي للصفحة.
 * يجنّب أخطاء 404 عندما يُفتح المنتج من مسار ثانوي مثل /product/<id>.
 * - رابط خارجي (http/https) أو data: → يُترك كما هو
 * - مسار يبدأ بـ '/' → يُترك كما هو (مثل /uploads/xxx.png)
 * - اسم ملف فقط (steam.png) → /image/steam.png
 * - مسار نسبي (image/steam.png) → /image/steam.png
 */
export function resolveImageUrl(value) {
    const src = String(value ?? '').trim();
    if (!src) return '';
    if (/^https?:\/\//i.test(src) || /^data:/i.test(src) || src.startsWith('/')) return src;
    if (src.includes('/')) return `/${src}`;
    return `/image/${src}`;
}