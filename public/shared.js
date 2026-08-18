// ======================================================
// shared.js — أدوات مشتركة محايدة
// لا تستورد من ملفات لواجهة التفاعل (ui.js/script.js) لتفادي
// الاستيراد الدائري — يستورد من i18n.js فقط.
// ======================================================
import { t } from './i18n.js';

export const rawServerData = { categories: {} };

// ======================================================
// 🎨 الثيمات البراندية للأقسام (لون الهوية + أيقونة)
// ======================================================
export const CATEGORY_THEMES = {
    pubg: { color: '#F99E0A', icon: 'fas fa-crosshairs' },
    fortnite: { color: '#7A1FF5', icon: 'fas fa-gun' },
    playstation: { color: '#0070D1', icon: 'fab fa-playstation' },
    xbox: { color: '#107C10', icon: 'fab fa-xbox' },
    steam: { color: '#66C0F4', icon: 'fab fa-steam' },
    microsoft_windows: { color: '#0078D4', icon: 'fab fa-windows' },
    adobe: { color: '#DA2200', icon: 'fas fa-paint-brush' },
    antivirus: { color: '#0FA958', icon: 'fas fa-shield-halved' },
    vpn: { color: '#12B7F5', icon: 'fas fa-lock' },
    google: { color: '#34A853', icon: 'fab fa-google-play' },
    itunes: { color: '#A2AAAD', icon: 'fab fa-apple' },
    razer_gold: { color: '#00A651', icon: 'fas fa-coins' },
    amazon: { color: '#FF9900', icon: 'fab fa-amazon' },
    gaming_general: { color: '#00E5FF', icon: 'fas fa-gamepad' },
    fallback: { color: '#00E5FF', icon: 'fas fa-tag' }
};

export function getCategoryTheme(categoryKey) {
    return CATEGORY_THEMES[categoryKey] || CATEGORY_THEMES.fallback;
}

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

// ======================================================
// 🔥 شارة "الأكثر مبيعاً" — مجموعة معرّفات مملوءة من قسم الأكثر مبيعاً
// ======================================================

export const bestSellerIds = new Set();

export function isBestSeller(productId) {
    return bestSellerIds.has(String(productId ?? ''));
}

/**
 * تطبيق شارة المنتج (الأكثر مبيعاً / جديد) على عنصر `.product-badge`.
 * @param {HTMLElement|null} badgeEl
 * @param {{ productId?: string, isNew?: boolean }} opts
 */
export function applyProductBadge(badgeEl, { productId, isNew = false } = {}) {
    if (!badgeEl) return;
    const isBest = productId !== null && productId !== undefined && bestSellerIds.has(String(productId));
    if (!isBest && !isNew) {
        badgeEl.textContent = '';
        badgeEl.classList.remove('best-seller', 'new-arrival');
        return;
    }
    badgeEl.textContent = isBest ? t('best_badge') : t('new_badge');
    badgeEl.classList.toggle('best-seller', isBest);
    badgeEl.classList.toggle('new-arrival', Boolean(isNew) && !isBest);
}

// ======================================================
// 🎟️ كود الخصم المطبّق (حالة ثابتة عبر الجلسة داخل المتصفح)
// الشكل: { code, label, percent, anchorProductId }
// ======================================================

const PROMO_STORAGE_KEY = 'joker_applied_promo';

export function getAppliedPromo() {
    try {
        const parsed = JSON.parse(localStorage.getItem(PROMO_STORAGE_KEY));
        return parsed && parsed.code ? parsed : null;
    } catch (_e) {
        return null;
    }
}

export function setAppliedPromo(promo) {
    if (promo && promo.code) {
        localStorage.setItem(PROMO_STORAGE_KEY, JSON.stringify({
            code: String(promo.code).toUpperCase(),
            label: promo.label || '',
            percent: Number(promo.percent) || 0,
            anchorProductId: promo.anchorProductId || ''
        }));
    } else {
        clearAppliedPromo();
    }
    return getAppliedPromo();
}

export function clearAppliedPromo() {
    localStorage.removeItem(PROMO_STORAGE_KEY);
}

function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clampQty(qty) {
    const n = Number.parseInt(qty, 10);
    if (!Number.isInteger(n)) return 1;
    return Math.min(99, Math.max(1, n));
}

/**
 * دمج سلتين (محلية + سحابية) باتحاد حسب المعرّف، مع الاحتفاظ بأعلى كمية
 * لكل منتج. لا تتجاوز 200 عنصر. تُرجع نسخة نظيفة {id, qty}.
 * @param {Array} local
 * @param {Array} server
 */
export function mergeCarts(local, server) {
    const merged = new Map();
    const take = (id, qty) => {
        if (!id) return;
        const prev = merged.get(id);
        merged.set(id, prev ? { id, qty: Math.max(prev.qty, clampQty(qty)) } : { id, qty: clampQty(qty) });
    };
    (Array.isArray(local) ? local : []).forEach(item => take(String(item.id || ''), item.qty));
    (Array.isArray(server) ? server : []).forEach(item => {
        take(String(item.productId || item.id || ''), item.qty);
    });
    return [...merged.values()].slice(0, 200);
}

/**
 * حساب مبالغ السلة (الإجمالي قبل الخصم، قيمة الخصم، الإجمالي النهائي)
 * مع مراعاة كود الخصم المطبّق. إجمالي العرض التقريبي — الخادم هو المرجع النهائي.
 * @param {Array} cartItems - عناصر السلة بصيغة {id, price, qty}
 */
export function cartTotals(cartItems) {
    const items = Array.isArray(cartItems) ? cartItems : [];
    const subtotal = items.reduce((sum, item) =>
        sum + (Number(item.price) || 0) * (Number(item.qty) || 1), 0);

    const promo = getAppliedPromo();
    let discount = 0;
    if (promo && promo.percent > 0) {
        // الكود لا يُقبل إلا عندما ينطبق على كل منتجات السلة (يُتحقق عند التطبيق)،
        // لذا يطبّق الخادم النسبة على إجمالي الطلب — نطابق نفس السلوك هنا.
        const percent = Math.min(99, Math.max(1, Number(promo.percent) || 0));
        discount = subtotal * percent / 100;
    }

    return { subtotal: roundMoney(subtotal), discount: roundMoney(discount), total: roundMoney(subtotal - discount) };
}