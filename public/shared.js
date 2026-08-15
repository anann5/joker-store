// ======================================================
// shared.js — أدوات مشتركة محايدة (لا تستورد من أي ملف واجهة)
// تفصل تبعيات ui.js و script.js لتفادي الاستيراد الدائري.
// ======================================================

export const rawServerData = { categories: {} };

export function renderRatingStars(rating = 0, reviewsCount = 0) {
    const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    if (rounded <= 0) return '';
    const filled = '★'.repeat(rounded);
    const empty = '★'.repeat(5 - rounded);
    const count = Number(reviewsCount) > 0
        ? `<span class="rating-count">(${Number(reviewsCount)})</span>`
        : '';
    return `<span class="rating-stars">${filled}<span class="empty">${empty}</span></span>${count}`;
}

export function renderStockBadge(availableStock) {
    if (availableStock === null || availableStock === undefined) return '';
    const count = Math.max(0, Number(availableStock) || 0);
    if (count === 0) return 'نفدت الكمية ⛔';
    if (count < 10) return `كمية محدودة: ${count} فقط ⚡`;
    return 'متوفر ✅';
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