import { showAllCategories, showProductDetails, updateCartUI, showToast, initToastContainer, escapeHtml } from './ui.js';
import { cart, addToCart, clearCart } from './cart.js';
import { initAuth, getCurrentUser } from './auth.js';
import { initI18n, getCurrentLanguage } from './i18n.js';
import { setCurrency, formatPrice } from './currency.js';
import { rawServerData, renderRatingStars, renderStockBadge, syncWishlistButtons, toggleWishlistKey, getWishlist } from './shared.js';

// ======================================================
//  البيانات الأساسية للأقسام (مستوردة من shared.js)
// ======================================================

let searchIndex = []; // 🚀 فهرس البحث السريع
let _currentCategoryKey = 'all'; // متغير داخلي لمتابعة القسم الحالي
let _categoryProducts = []; // منتجات القسم الحالي (للترتيب والفلترة)
let _currentSort = 'latest'; // الترتيب الحالي: latest | price_asc | price_desc | rating
const productCache = new Map(); // ذاكرة تخزين مؤقت للمنتجات التي يتم جلبها

// ======================================================
// 🚀 تشغيل سلايدر العروض تلقائياً
// ======================================================
function initHeroSlider() {
    const slides = document.querySelectorAll('.hero-section .slide');
    if (slides.length <= 1) return;

    let currentSlide = 0;
    setInterval(() => {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    }, 5000); // تبديل كل 5 ثوانٍ
}

// ======================================================
// 🛡️ تحديث شريط الثقة ببيانات حقيقية
// ======================================================
async function updateTrustTicker() {
    const tickerZone = document.querySelector('.ticker-content');
    if (!tickerZone) return;

    try {
        const res = await fetch('/api/products/latest-orders'); // سنفترض وجود هذا المسار البسيط
        const data = await res.json();
        if (data.success && data.orders.length > 0) {
            const tickerText = data.orders.map(o => 
                `✨ تم تسليم طلب #${escapeHtml(o.orderId).substring(0,8)} بنجاح (${escapeHtml(o.productName)}) .. `
            ).join(' ✅ ');
            tickerZone.innerHTML = `${tickerText  } 🛡️ جميع الأكواد أصلية ومضمونة 100%`;
        }
    } catch (_e) {
        // في حال الفشل نترك النص الافتراضي الجميل الذي وضعناه
    }
}

// ======================================================
//  دوالمساعدة (Helper Functions)
// ======================================================
function detectRegion(item) {
    const text = (`${item.productName || item.name || ""  } ${  item._id || item.id || ""}`).toLowerCase();
    if (text.includes('tr') || text.includes('تركي')) return 'tr';
    if (text.includes('ae') || text.includes('امارات')) return 'ae';
    if (text.includes('sa') || text.includes('سعودي')) return 'sa';
    if (text.includes('us') || text.includes('امريكي')) return 'us';
    if (text.includes('eu') || text.includes('اوروب')) return 'eu';
    return 'global';
}

function formatItem(item, categoryKey, region) {
    let imageUrl = item.image;
    // التحقق إذا كان اسم الصورة فقط بدون مسار، وإضافة المسار الصحيح
    if (imageUrl && !imageUrl.includes('/') && !imageUrl.startsWith('http')) {
        imageUrl = `image/${imageUrl}`;
    }

    return {
        id: item._id || item.id,
        name: item.name, // الخادم يرسل الاسم المترجم جاهزاً في حقل 'name'
        description: item.description ? (item.description[getCurrentLanguage()] || item.description.en || item.description.ar || '') : '',
        price: (typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0).toFixed(2),
        region: region,
        image: imageUrl || `image/${categoryKey}.png`,
        rating: typeof item.rating === 'number' ? item.rating : 0,
        reviewsCount: typeof item.reviewsCount === 'number' ? item.reviewsCount : 0,
        availableStock: (item.availableStock === null || item.availableStock === undefined) ? null : Number(item.availableStock)
    };
}

// ======================================================
//  ⭐ تقييمات المنتجات (مستوردة من shared.js)
// ======================================================

// ======================================================
//  ❤️ قائمة الأمنيات (Wishlist — localStorage)
// ======================================================

async function showWishlist() {
    const modal = document.getElementById('wishlistModal');
    const container = document.getElementById('wishlistGrid');
    if (!modal || !container) return;
    modal.classList.add('active');
    const ids = getWishlist();

    if (ids.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center; grid-column:1/-1; padding:30px;">💔 قائمة الأمنيات فارغة حالياً.</p>';
        return;
    }

    container.innerHTML = '<p style="color:var(--text-muted); text-align:center; grid-column:1/-1; padding:30px;"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</p>';

    try {
        const res = await fetch('/api/products/search-index');
        const data = await res.json();
        const lang = getCurrentLanguage();
        const template = document.getElementById('product-card-template');
        container.innerHTML = '';

        const wished = data.products.filter(p => ids.includes(String(p._id || p.id)));
        if (wished.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted); text-align:center; grid-column:1/-1; padding:30px;">💔 قائمة الأمنيات فارغة حالياً.</p>';
            return;
        }

        wished.forEach(item => {
            const localizedName = item.productName[lang] || item.productName['ar'];
            const detectedRegion = detectRegion(item);
            const regionInfo = getRegionDetails(detectedRegion);
            const clientItem = formatItem({ ...item, name: localizedName }, item.category, detectedRegion);

            const card = template.content.cloneNode(true);
            const cardElement = card.querySelector('.product-item-card');
            cardElement.dataset.productId = clientItem.id;
            cardElement.dataset.region = detectedRegion;
            card.querySelector('.card-flag-badge').innerHTML = regionInfo.isIcon ? '<i class="fas fa-globe"></i>' : `<img src="${regionInfo.flagUrl}" />`;
            const img = card.querySelector('.card-inner-img');
            img.src = clientItem.image;
            img.onerror = () => { img.src = '/image/logo.png'; };
            card.querySelector('.card-title').textContent = clientItem.name;
            card.querySelector('.card-price').textContent = formatPrice(clientItem.price);
            card.querySelector('[data-wishlist-btn]').dataset.productId = clientItem.id;
            card.querySelector('[data-rating]').innerHTML = renderRatingStars(clientItem.rating, clientItem.reviewsCount);
            const stockBadge = card.querySelector('[data-stock-badge]');
            if (stockBadge) {
                const stockText = renderStockBadge(clientItem.availableStock);
                stockBadge.textContent = stockText;
                stockBadge.classList.toggle('out-of-stock', stockText === 'نفذت الكمية ⛔');
            }
            container.appendChild(card);
        });
        syncWishlistButtons();
    } catch (_e) {
        container.innerHTML = '<p style="color:#e74c3c; text-align:center; grid-column:1/-1; padding:30px;">❌ فشل تحميل قائمة الأمنيات.</p>';
    }
}

// ======================================================
//  ⚙️ إعدادات الموقع (أرقام الدفع، روابط التواصل، الإحصائيات)
// ======================================================
let siteConfig = null;

async function fetchSiteConfig() {
    try {
        const res = await fetch('/api/site-config');
        const data = await res.json();
        if (data.success) {
            siteConfig = data.config;
            const currency = siteConfig.currency || {};
            setCurrency(currency.code, currency.symbol);
        }
    } catch (_e) {
        siteConfig = null;
    }
}

function applySiteConfig() {
    if (!siteConfig) return;

    const social = siteConfig.social || {};
    if (social.whatsapp) {
        const waBtn = document.getElementById('whatsappFloatBtn');
        if (waBtn) {
            waBtn.href = `https://wa.me/${String(social.whatsapp).replace(/[^0-9]/g, '')}`;
            waBtn.style.display = 'flex';
        }
    }
    const socialMap = { footerWhatsapp: 'whatsapp', footerTelegram: 'telegram', footerInstagram: 'instagram', footerTiktok: 'tiktok' };
    for (const [id, key] of Object.entries(socialMap)) {
        const link = document.getElementById(id);
        const value = social[key];
        if (!link || !value) continue;
        if (key === 'whatsapp') {
            link.href = `https://wa.me/${String(value).replace(/[^0-9]/g, '')}`;
        } else {
            link.href = /^https?:\/\//.test(value) ? value : `https://${value}`;
        }
        link.style.display = 'flex';
    }

    // وسائل الدفع: إن لم تُضبط أرقام الحسابات، نخفي خيارات الدفع تماماً (لا نعرض أرقاماً وهمية)
    const payment = siteConfig.payment || {};
    const paymentOptionsEl = document.querySelector('.payment-options');
    const hasPaymentNumbers = Boolean(payment.jawwalNumber) || Boolean(payment.palpayNumber);
    if (paymentOptionsEl && !hasPaymentNumbers) {
        paymentOptionsEl.style.display = 'none';
    }
}

// ======================================================
//  🔍 تتبع الطلب
// ======================================================
async function handleTrackOrder() {
    const emailInput = document.getElementById('trackEmailInput');
    const orderIdInput = document.getElementById('trackOrderIdInput');
    const results = document.getElementById('trackOrderResults');
    if (!emailInput || !results) return;

    const email = emailInput.value.trim();
    const orderId = orderIdInput.value.trim();
    if (!email) { showToast('أدخل بريدك الإلكتروني أولاً.', 'error'); return; }

    results.innerHTML = '<p style="text-align:center; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> جاري البحث...</p>';

    try {
        const res = await fetch('/api/track-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, orderId })
        });
        const data = await res.json();

        if (!data.success) {
            results.innerHTML = `<p style="color:#e74c3c; text-align:center;">❌ ${escapeHtml(data.error || 'فشل التتبع، حاول مرة أخرى.')}</p>`;
            return;
        }
        if (data.orders.length === 0) {
            results.innerHTML = '<p style="color:var(--text-muted); text-align:center;">🔍 لا توجد طلبات مطابقة.</p>';
            return;
        }

        const lang = getCurrentLanguage();
        const statusMap = {
            completed: { text: 'مكتمل', cls: 'completed' },
            pending: { text: 'قيد المراجعة', cls: 'pending' },
            failed: { text: 'فشل', cls: 'failed' }
        };

        results.innerHTML = data.orders.map(order => {
            const st = statusMap[order.status] || { text: order.status, cls: '' };
            const date = new Date(order.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
            const items = order.items.map(i => escapeHtml(i.name[lang] || i.name.ar)).join('، ');
            const codesHtml = order.codes && order.codes.length
                ? `<div class="track-code-box"><span>كود الشحن:</span><span class="track-code">${order.codes.map(escapeHtml).join('<br>')}</span></div>`
                : '';
            return `
                <div class="track-result-card">
                    <div class="track-head">
                        <span class="track-id">#${escapeHtml(order.orderId)}</span>
                        <span class="status-badge ${st.cls}">${st.text}</span>
                    </div>
                    <div style="font-size:0.9rem; color:var(--text-muted);">${items}</div>
                    <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">${date} | <b style="color:#fff;">${formatPrice(order.price)}</b></div>
                    ${codesHtml}
                </div>`;
        }).join('');
    } catch (_e) {
        results.innerHTML = '<p style="color:#e74c3c; text-align:center;">❌ حدث خطأ في الاتصال بالخادم.</p>';
    }
}

// ======================================================
//  دالة تحديد الريجن وجلب روابط الأعلام المحلية
// ======================================================
function getRegionDetails(region) {
    const reg = String(region || 'global').toLowerCase();
    
    if (reg.includes('tr')) return { cls: 'badge-tr', flagUrl: '/image/flags/tr.png', isIcon: false };
    if (reg.includes('ae')) return { cls: 'badge-ae', flagUrl: '/image/flags/ae.png', isIcon: false };
    if (reg.includes('sa')) return { cls: 'badge-sa', flagUrl: '/image/flags/sa.png', isIcon: false };
    if (reg.includes('vn') || reg.includes('viet')) return { cls: 'badge-vn', flagUrl: '/image/flags/vn.png', isIcon: false };
    if (reg.includes('cn') || reg.includes('china')) return { cls: 'badge-cn', flagUrl: '/image/flags/cn.png', isIcon: false };
    if (reg.includes('us')) return { cls: 'badge-us', flagUrl: '/image/flags/us.png', isIcon: false };
    
    return { cls: 'badge-global', flagUrl: '', isIcon: true }; 
}

// ======================================================
//  دالة لمعرفة القسم الحالي
//  عرض المنتجات داخل القسم
// ======================================================
export function selectCategory(categoryKey) {
    // حفظ القسم الذي تمت زيارته في التخزين المحلي
    localStorage.setItem('joker_lastCategory', categoryKey);

    _currentCategoryKey = categoryKey; // تحديث القسم الحالي
    _categoryProducts = []; // تصفير المنتجات المخزنة
    _currentSort = 'latest'; // إعادة تعيين الترتيب
    const availabilityCheck = document.getElementById('availabilityFilter');
    if (availabilityCheck) availabilityCheck.checked = false;
    const sortSelectEl = document.getElementById('sortSelect');
    if (sortSelectEl) sortSelectEl.value = 'latest';

    const grid = document.getElementById('mainCategories');
    const backContainer = document.getElementById('back-container');
    const regionBar = document.getElementById('regionFilterBar');
    const toolbar = document.getElementById('categoryToolbar');
    const homeSections = document.getElementById('homeSections');

    if (homeSections) homeSections.classList.add('hidden');

    if (!grid) return;
    grid.className = 'products-grid'; // تطبيق كلاس الشبكة للمنتجات
    grid.removeAttribute('style');

    if (backContainer) backContainer.classList.remove('hidden');
    if (toolbar) toolbar.classList.remove('hidden');
    if (regionBar) {
        regionBar.classList.remove('hidden');
        regionBar.style.display = 'flex';
        regionBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        const allBtn = regionBar.querySelector('[data-target="all"]');
        if (allBtn) allBtn.classList.add('active');
    }

    // استخدام مؤشر تحميل مرئي أفضل
    grid.innerHTML = Array.from({ length: 6 }, () => `
        <div class="skeleton-card">
            <div class="skeleton-img"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
        </div>
    `).join('');

    fetch(`/api/products/${categoryKey}?lang=${getCurrentLanguage()}`)
        .then(function(res) { return res.json(); })
        .then(function(data) { // 🔥 تصحيح: المتغير الآن هو 'data' الذي يحتوي على success و products
            if (!data.success || !data.products) {
                throw new Error(data.error || 'فشل في جلب البيانات');
            }

            _categoryProducts = data.products; // حفظ المنتجات للترتيب والفلترة
            productCache.clear(); // تفريغ الكاش قبل ملئه من جديد
            renderCategoryProducts(grid);
        }).catch(err => console.error("Error fetching products:", err));
}

/**
 * تقديم منتجات القسم الحالي مع تطبيق الترتيب وفلترة التوفر والمنطقة.
 * @param {HTMLElement} [grid] - شبكة العرض (افتراضياً #mainCategories).
 */
function renderCategoryProducts(grid) {
    const targetGrid = grid || document.getElementById('mainCategories');
    if (!targetGrid) return;

    const lang = getCurrentLanguage();

    // 1) فرز المنتجات حسب الاختيار
    const sorted = [..._categoryProducts].sort((a, b) => {
        const pa = Number(a.price) || 0;
        const pb = Number(b.price) || 0;
        switch (_currentSort) {
            case 'price_asc': return pa - pb;
            case 'price_desc': return pb - pa;
            case 'rating': return (Number(b.rating) || 0) - (Number(a.rating) || 0);
            default: return Number(b.createdAt) - Number(a.createdAt); // الأحدث
        }
    });

    // 2) فلترة التوفر (المتوفر فقط)
    const availabilityCheck = document.getElementById('availabilityFilter');
    const inStockOnly = availabilityCheck ? availabilityCheck.checked : false;
    let visible = sorted;
    if (inStockOnly) {
        visible = sorted.filter(item => {
            // المنتجات الخارجية (API) تعتبر متوفرة ما لم تُعلم بخلاف ذلك
            if (item.availableStock === null || item.availableStock === undefined) return true;
            return Number(item.availableStock) > 0;
        });
    }

    // 3) فلترة المنطقة الحالية
    const activeRegion = document.querySelector('#regionFilterBar .filter-btn.active');
    const currentRegion = activeRegion ? activeRegion.dataset.target : 'all';

    targetGrid.innerHTML = '';
    const template = document.getElementById('product-card-template');

    if (visible.length === 0) {
        const emptyTitle = inStockOnly
            ? (lang === 'en' ? 'No items are currently in stock.' : 'لا توجد عناصر متوفرة حالياً.')
            : (lang === 'en' ? 'No cards are available in this category yet.' : 'لا توجد بطاقات متاحة في هذا القسم حالياً.');
        targetGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>${emptyTitle}</h3>
                <p>${lang === 'en' ? 'Please check back soon or try another option.' : 'تفضل بالعودة لاحقاً أو جرّب خياراً آخر.'}</p>
            </div>
        `;
        return;
    }

    visible.forEach(function(item) {
        const detectedRegion = detectRegion(item);
        if (currentRegion !== 'all' && detectedRegion !== currentRegion) return;
        const regionInfo = getRegionDetails(detectedRegion);
        const localizedName = item.productName[lang] || item.productName['ar'];
        const clientItem = formatItem({ ...item, name: localizedName }, _currentCategoryKey, detectedRegion);

        productCache.set(clientItem.id, clientItem); // إضافة المنتج للكاش

        const card = template.content.cloneNode(true);
        const cardElement = card.querySelector('.product-item-card');
        cardElement.dataset.productId = clientItem.id;
        cardElement.dataset.region = detectedRegion;
        card.querySelector('.card-flag-badge').innerHTML = regionInfo.isIcon ? '<i class="fas fa-globe"></i>' : `<img src="${regionInfo.flagUrl}" />`;
        const imgElement = card.querySelector('.card-inner-img');
        imgElement.src = clientItem.image;
        imgElement.onerror = () => { imgElement.src = '/image/logo.png'; }; // Fallback image
        card.querySelector('.card-inner-img').alt = clientItem.name;
        card.querySelector('.card-title').textContent = clientItem.name;
        card.querySelector('.card-price').textContent = formatPrice(clientItem.price);
        card.querySelector('[data-wishlist-btn]').dataset.productId = clientItem.id;
        card.querySelector('[data-rating]').innerHTML = renderRatingStars(clientItem.rating, clientItem.reviewsCount);
        const stockBadge = card.querySelector('[data-stock-badge]');
        if (stockBadge) {
            const stockText = renderStockBadge(clientItem.availableStock);
            stockBadge.textContent = stockText;
            stockBadge.classList.toggle('out-of-stock', stockText === 'نفذت الكمية ⛔');
        }
        targetGrid.appendChild(card);
    });
}

export const currentCategoryKey = () => _currentCategoryKey;

// ======================================================
//  دالة لتقديم أزرار فلترة الأقسام ديناميكياً
// ======================================================
function renderCategoryFilterButtons() {
    const filterTabsContainer = document.getElementById('filterTabs');
    if (!filterTabsContainer) return;

    filterTabsContainer.innerHTML = ''; // تفريغ الأزرار القديمة

    // زر "الكل" الافتراضي
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn active';
    allBtn.dataset.filter = 'all';
    allBtn.textContent = 'الكل';
    filterTabsContainer.appendChild(allBtn);

    // إضافة أزرار الأقسام من البيانات المسترجعة
    for (const key in rawServerData.categories) {
        const category = rawServerData.categories[key];
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.filter = key;
        btn.textContent = category.title; // استخدام الاسم المترجم
        filterTabsContainer.appendChild(btn);
    }
}

// ======================================================
//  دالة لتقديم أزرار فلترة المناطق ديناميكياً
// ======================================================
function renderRegionFilterButtons() {
    const regionFilterBar = document.getElementById('regionFilterBar');
    if (!regionFilterBar) return;

    regionFilterBar.innerHTML = ''; // تفريغ الأزرار القديمة

    const regions = [
        { key: 'all', text: 'الكل', icon: null },
        { key: 'global', text: 'عالمي', icon: '🌐' },
        { key: 'tr', text: 'تركي', flag: 'tr.png' },
        { key: 'ae', text: 'إماراتي', flag: 'ae.png' },
        { key: 'sa', text: 'سعودي', flag: 'sa.png' },
        { key: 'vn', text: 'فيتنامي', flag: 'vn.png' },
        { key: 'cn', text: 'صيني', flag: 'cn.png' },
        { key: 'us', text: 'أمريكي', flag: 'us.png' }
    ];

    regions.forEach(region => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.target = region.key;

        let content = '';
        if (region.icon) {
            content = `${region.icon} ${region.text}`;
        } else if (region.flag) {
            content = `<img src="/image/flags/${region.flag}" class="flag-img" alt="${region.key.toUpperCase()}"> ${region.text}`;
        } else {
            content = region.text;
        }
        btn.innerHTML = content;
        regionFilterBar.appendChild(btn);
    });

    // تفعيل زر "الكل" افتراضياً
    const allBtn = regionFilterBar.querySelector('[data-target="all"]');
    if (allBtn) allBtn.classList.add('active');
}

// ======================================================
//  دالة مساعدة لتقديم المنتجات (تجنب التكرار)
// ======================================================
function renderSkeletonCards(container, count = 6) {
    const grid = container.querySelector('.products-grid');
    if (!grid) return;
    grid.innerHTML = Array.from({ length: count }, () => `
        <div class="skeleton-card">
            <div class="skeleton-img"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
        </div>
    `).join('');
}

function renderEmptyState(container, opts = {}) {
    const grid = container.querySelector('.products-grid') || container;
    const icon = opts.icon || 'fas fa-box-open';
    const title = opts.title || 'لا توجد بطاقات متاحة حالياً.';
    const sub = opts.sub || '';
    grid.innerHTML = `
        <div class="empty-state">
            <i class="${icon}"></i>
            <h3>${escapeHtml(title)}</h3>
            ${sub ? `<p>${escapeHtml(sub)}</p>` : ''}
        </div>
    `;
}

function renderProductCards(products, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const grid = container.querySelector('.products-grid');
    if (!grid) return;

    grid.innerHTML = ''; // تفريغ المحتوى
    const template = document.getElementById('product-card-template');
    const lang = getCurrentLanguage();

    if (products.length === 0) {
        renderEmptyState(container, {
            icon: 'fas fa-box-open',
            title: lang === 'en' ? 'No cards are currently available.' : 'لا توجد بطاقات متاحة حالياً.',
            sub: lang === 'en' ? 'Please check back soon or try another category.' : 'تفضل بالعودة لاحقاً أو جرّب قسماً آخر.'
        });
        return;
    }

    products.forEach(item => {
        // بما أن اسم المنتج يأتي ككائن (ar, en)، نختار اللغة الصحيحة
        const localizedName = item.productName[lang] || item.productName['ar'];
        const detectedRegion = detectRegion(item);
        const regionInfo = getRegionDetails(detectedRegion);
        const clientItem = formatItem({ ...item, name: localizedName }, item.category, detectedRegion);

        productCache.set(clientItem.id, clientItem); // إضافة المنتج للكاش للوصول السريع

        const card = template.content.cloneNode(true);
        const cardElement = card.querySelector('.product-item-card');
        cardElement.dataset.productId = clientItem.id;
        cardElement.dataset.region = detectedRegion;
        card.querySelector('.card-flag-badge').innerHTML = regionInfo.isIcon ? '<i class="fas fa-globe"></i>' : `<img src="${regionInfo.flagUrl}" />`;
        const imgElement = card.querySelector('.card-inner-img');
        imgElement.src = clientItem.image;
        imgElement.onerror = () => { imgElement.src = '/image/logo.png'; }; // Fallback image
        card.querySelector('.card-inner-img').alt = clientItem.name;
        card.querySelector('.card-title').textContent = clientItem.name;
        card.querySelector('.card-price').textContent = formatPrice(clientItem.price);
        card.querySelector('[data-wishlist-btn]').dataset.productId = clientItem.id;
        card.querySelector('[data-rating]').innerHTML = renderRatingStars(clientItem.rating, clientItem.reviewsCount);
        const stockBadge = card.querySelector('[data-stock-badge]');
        if (stockBadge) {
            const stockText = renderStockBadge(clientItem.availableStock);
            stockBadge.textContent = stockText;
            stockBadge.classList.toggle('out-of-stock', stockText === 'نفذت الكمية ⛔');
        }
        const badge = card.querySelector('.product-badge');
        if (badge) {
            if (containerId === 'best-selling-container') badge.textContent = '🔥 الأكثر مبيعاً';
            else if (containerId === 'newly-added-container') badge.textContent = '✨ وصل حديثاً';
        }
        grid.appendChild(card);
    });
}

// ======================================================
//  العودة للرئيسية
// ======================================================
function goBack() {
    // حذف القسم المحفوظ عند العودة للصفحة الرئيسية
    localStorage.removeItem('joker_lastCategory');

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    showAllCategories();
}

/**
 * جلب وعرض قسم "الأكثر مبيعاً" في الصفحة الرئيسية.
 */
async function renderBestSellingProducts() {
    const container = document.getElementById('best-selling-container');
    if (!container) return;

    renderSkeletonCards(container, 4);
    try {
        const res = await fetch(`/api/products/best-selling?lang=${getCurrentLanguage()}`);
        const data = await res.json();
        if (data.success) {
            renderProductCards(data.products, 'best-selling-container');
        } else {
            renderEmptyState(container, {
                icon: 'fas fa-fire',
                title: getCurrentLanguage() === 'en' ? 'No best sellers yet.' : 'لا توجد منتجات الأكثر مبيعاً بعد.',
                sub: getCurrentLanguage() === 'en' ? 'Products appear here once orders take place.' : 'تظهر المنتجات هنا بعد إتمام أولى الطلبات.'
            });
        }
    } catch (error) {
        console.error("Failed to render best-selling products:", error);
        renderEmptyState(container, {
            icon: 'fas fa-fire',
            title: getCurrentLanguage() === 'en' ? 'No best sellers yet.' : 'لا توجد منتجات الأكثر مبيعاً بعد.',
            sub: getCurrentLanguage() === 'en' ? 'Products appear here once orders take place.' : 'تظهر المنتجات هنا بعد إتمام أولى الطلبات.'
        });
    }
}

/**
 * جلب وعرض قسم "أضيف حديثاً" في الصفحة الرئيسية.
 */
async function renderNewlyAddedProducts() {
    const container = document.getElementById('newly-added-container');
    if (!container) return;

    renderSkeletonCards(container, 4);
    try {
        const res = await fetch(`/api/products/newly-added?lang=${getCurrentLanguage()}`);
        const data = await res.json();
        if (data.success) {
            renderProductCards(data.products, 'newly-added-container');
        } else {
            renderEmptyState(container, {
                icon: 'fas fa-sparkles',
                title: getCurrentLanguage() === 'en' ? 'No new products yet.' : 'لا توجد منتجات جديدة بعد.',
                sub: getCurrentLanguage() === 'en' ? 'New products will appear here.' : 'ستظهر المنتجات الجديدة هنا.'
            });
        }
    } catch (error) {
        console.error("Failed to render newly added products:", error);
        renderEmptyState(container, {
            icon: 'fas fa-sparkles',
            title: getCurrentLanguage() === 'en' ? 'No new products yet.' : 'لا توجد منتجات جديدة بعد.',
            sub: getCurrentLanguage() === 'en' ? 'New products will appear here.' : 'ستظهر المنتجات الجديدة هنا.'
        });
    }
}

/**
 * يعالج حدث تغيير اللغة، ويقوم بجلب بيانات الأقسام وعرضها.
 */
async function handleLanguageChange(event) {
    try {
        const lang = event.detail.lang || getCurrentLanguage(); // الأولوية للغة الممررة في الحدث
        const res = await fetch(`/api/categories?lang=${lang}`);
        const data = await res.json();
        if (data.success) {
            rawServerData.categories = data.categories;
            renderCategoryFilterButtons(); // إعادة عرض أزرار الأقسام
            renderRegionFilterButtons();   // إعادة عرض أزرار المناطق
            // عند فتح رابط عميق مباشر لمنتج لا نعيد عرض الأقسام (سيعرضه رابط العمق)
            if (!isProductDeepLink()) {
                showAllCategories(); // عرض الأقسام الرئيسية بعد جلبها
            }
        }
    } catch (error) {
        console.error("Failed to reload dynamic categories:", error);
    }
}

// هل نحن داخل رابط عميق مباشر لمنتج؟
function isProductDeepLink() {
    return /^\/product\/[a-fA-F0-9]{24}\/?$/.test(window.location.pathname);
}

/**
 * فتح رابط عميق مباشر للمنتج عند فتح صفحة /product/:id (SEO + مشاركة).
 * يبحث المنتج في فهرس البحث أو يجلب بياناته مباشرة ثم يعرض التفاصيل.
 */
async function handleProductDeepLink() {
    const match = window.location.pathname.match(/^\/product\/([a-fA-F0-9]{24})\/?$/);
    if (!match) return;
    const [, productId] = match;

    const found = searchIndex.find(p => String(p._id) === productId);
    if (found) {
        const lang = getCurrentLanguage();
        const localizedName = found.productName[lang] || found.productName['ar'] || '';
        const clientItem = formatItem({ ...found, name: localizedName }, found.category, detectRegion(found));
        showProductDetails(clientItem);
    }
}

/**
 * تحميل فهرس البحث (منتج واحد فقط بالرغم من الاسم) — يُستخدم للبحث السريع
 * ولفتح صفحة تفاصيل المنتج عبر الروابط العميقة.
 */
async function loadSearchIndex() {
    try {
        const res = await fetch('/api/products/search-index');
        const data = await res.json();
        if (data.success) {
            searchIndex = data.products;
            console.log(`✅ تم تحميل فهرس البحث بنجاح (${searchIndex.length} منتج).`);
        }
    } catch (error) {
        console.error('Failed to fetch search index:', error);
    }
}

/**
 * تهيئة التطبيق بالكامل: جلب البيانات الأساسية وربط الأحداث.
 */
async function initializeApp() {
    // 🔝 إجبار المتصفح على بدء الصفحة من الأعلى عند التحديث
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
    
    // 0. 🔥 خطوة حاسمة: ربط المستمع أولاً لضمان التقاط الحدث الأولي
    window.addEventListener('languageChanged', handleLanguageChange);

    // 1. تهيئة نظام الترجمة أولاً. سيقوم هذا تلقائياً بتحديد اللغة الصحيحة،
    // تحميل الترجمات، وإطلاق حدث 'languageChanged'.
    initI18n(); 

    // 2. المستمع لحدث 'languageChanged' سيتكفل بجلب الأقسام وعرضها.
    // 3. باقي عمليات التهيئة التي لا تعتمد على اللغة.
    initToastContainer(); // تهيئة حاوية الإشعارات
    renderCategoryFilterButtons(); // عرض أزرار فلترة الأقسام
    renderRegionFilterButtons();   // عرض أزرار فلترة المناطق
    initHeroSlider(); // تشغيل السلايدر
    renderNewlyAddedProducts(); // 🚀 عرض المنتجات المضافة حديثاً
    renderBestSellingProducts(); // 🚀 عرض المنتجات الأكثر مبيعاً

    // 🚀 جلب فهرس البحث في الخلفية (يُستخدم للبحث السريع ولفتح الروابط العميقة)
    await loadSearchIndex();

    // 🚀 فتح رابط عميق مباشر للمنتج (تحسين SEO + قابلية مشاركة الروابط)
    await handleProductDeepLink();

    initAuth(); 
    updateTrustTicker(); // تحديث شريط الثقة

    // ⚙️ جلب إعدادات الموقع (أرقام الدفع، السوشيال، الإحصائيات) قبل ربط الأحداث
    await fetchSiteConfig();
    applySiteConfig();
    
    updateCartUI(); // تحديث السلة فور فتح الصفحة

    setupEventListeners();
    syncWishlistButtons(); // تفعيل أزرار الأمنيات بعد أول عرض
}

function setupEventListeners() {
    // ربط الأحداث بعد تحميل البيانات

    const logoHomeBtn = document.getElementById('logoHomeBtn');
    if (logoHomeBtn) {
        logoHomeBtn.addEventListener('click', function() { goBack(); });
    }

    // استخدام التفويض (Event Delegation) لأزرار فلترة المناطق
    document.addEventListener('click', function(e) {
        const regionFilterBar = document.getElementById('regionFilterBar');
        if (regionFilterBar && regionFilterBar.contains(e.target)) {
            const btn = e.target.closest('.filter-btn');
            if (!btn || !btn.dataset.target) return;

            regionFilterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // إعادة تقديم الشبكة مع تطبيق فلترة المنطقة + الترتيب + التوفر
            renderCategoryProducts();
            return; // منع تكرار المعالجة إذا كان الحدث داخل شريط الفلترة
        } // إغلاق كتلة if هنا
    }); // إغلاق دالة addEventListener هنا

    // ─── أدوات الترتيب وفلترة التوفر ───
    const sortSelectEl = document.getElementById('sortSelect');
    if (sortSelectEl) {
        sortSelectEl.addEventListener('change', function() {
            _currentSort = this.value;
            renderCategoryProducts();
        });
    }
    const availabilityCheckEl = document.getElementById('availabilityFilter');
    if (availabilityCheckEl) {
        availabilityCheckEl.addEventListener('change', function() {
            renderCategoryProducts();
        });
    }

    const homeLink = document.getElementById('homeLink');
    if (homeLink) homeLink.addEventListener('click', function(e) { e.preventDefault(); goBack(); });

    const digitalCardsLink = document.getElementById('digitalCardsLink');
    if (digitalCardsLink) digitalCardsLink.addEventListener('click', function(e) { e.preventDefault(); goBack(); });

    const backToMainBtn = document.getElementById('backToMainBtn');
    if (backToMainBtn) backToMainBtn.addEventListener('click', goBack);

    const categoriesBtn = document.getElementById('categoriesBtn');
    if (categoriesBtn) {
        categoriesBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const dropdown = document.getElementById('categoriesDropdown');
            dropdown.classList.toggle('active');
            categoriesBtn.classList.toggle('active');
        });
    }

    document.querySelectorAll('.dropdown-item[data-category]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            selectCategory(this.dataset.category);
            document.getElementById('categoriesDropdown').classList.remove('active');
            document.getElementById('categoriesBtn').classList.remove('active');
        });
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.dropdown-wrapper')) {
            const dropdown = document.getElementById('categoriesDropdown');
            const btn = document.getElementById('categoriesBtn');
            if (dropdown) dropdown.classList.remove('active');
            if (btn) btn.classList.remove('active');
        }
    });

    // أحداث المودالات العامة لتجنب التكرار
    const purchaseModal = document.getElementById('purchaseModal');
    const closePurchaseBtn = document.getElementById('closeModal');
    if (closePurchaseBtn && purchaseModal) {
        closePurchaseBtn.addEventListener('click', function() { purchaseModal.classList.remove('active'); });
    }

    const codeModal = document.getElementById('codeModal');
    const closeCodeBtn = document.getElementById('closeCodeModal');
    if (closeCodeBtn && codeModal) {
        closeCodeBtn.addEventListener('click', function() { codeModal.classList.remove('active'); });
    }

    const copyCodeBtn = document.getElementById('copyCodeBtn');
    if (copyCodeBtn) {
        copyCodeBtn.addEventListener('click', function() {
            const codeText = document.getElementById('generatedCode').textContent;
            navigator.clipboard.writeText(codeText).then(function() {
                showToast('📋 تم نسخ كود الشحن بنجاح!', 'success');
            });
        });
    }

    // صائد ضغطات الكروت والدخول للسلة
    document.getElementById('mainCategories').addEventListener('click', function(e) {
        if (e.target.closest('[data-wishlist-btn]')) return; // لا تفتح التفاصيل عند ضغط زر الأمنيات
        
        const enterBtn = e.target.closest('.enter-btn[data-category]');
        if (enterBtn) {
            selectCategory(enterBtn.dataset.category);
            return;
        }
        
        const buyBtn = e.target.closest('.buy-btn[data-item]');
        if (buyBtn && buyBtn.dataset.productId) { // تأكد من وجود productId
            const item = productCache.get(buyBtn.dataset.productId); // استرجاع المنتج من الكاش
            addToCart(item);
            return;
        }

        const categoryCard = e.target.closest('.category-card[data-category]');
        if (categoryCard && !e.target.closest('button')) {
            selectCategory(categoryCard.dataset.category);
            return;
        }

        const productCard = e.target.closest('.product-item-card[data-product-id]');
        if (productCard) {
            const product = productCache.get(productCard.dataset.productId);
            if (product) showProductDetails(product, _currentCategoryKey);
        }
    });

    // استخدام التفويض (Event Delegation) لأزرار فلترة الأقسام
    document.addEventListener('click', function(e) {
        const filterTabs = document.getElementById('filterTabs');
        if (filterTabs && filterTabs.contains(e.target)) {
            const btn = e.target.closest('.filter-btn');
            if (!btn || !btn.dataset.filter) return;

            filterTabs.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const {filter} = btn.dataset;
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            filter === 'all' ? showAllCategories() : selectCategory(filter);
        }
    });

    // --- نظام البحث الذكي الجديد مع الإكمال التلقائي ---
    const setupAutocomplete = (inputId, resultsId) => {
        const searchInput = document.getElementById(inputId);
        const resultsContainer = document.getElementById(resultsId);
        if (!searchInput || !resultsContainer) return;

        let debounceTimer;

        const showResults = () => resultsContainer.classList.add('active');
        const hideResults = () => {
            resultsContainer.classList.remove('active');
            resultsContainer.innerHTML = '';
        };

        const renderLoadingSkeleton = () => {
            let html = '';
            for (let i = 0; i < 5; i++) {
                html += `
                    <div class="autocomplete-skeleton">
                        <div class="skeleton-img"></div>
                        <div class="skeleton-text"></div>
                    </div>
                `;
            }
            resultsContainer.innerHTML = html;
            showResults();
        };

        const renderResults = (results, lang, query) => {
            resultsContainer.innerHTML = '';
            if (results.length === 0) {
                const msg = lang === 'en'
                    ? `No results for "<strong>${escapeHtml(query)}</strong>"`
                    : `لا توجد نتائج لبحثك "<strong>${escapeHtml(query)}</strong>"`;
                resultsContainer.innerHTML = `<div class="autocomplete-empty"><i class="fas fa-search-minus"></i> ${msg}</div>`;
                showResults();
                return;
            }

            results.forEach(product => {
                let imgPath = product.image || '';
                if (imgPath && !imgPath.includes('/') && !imgPath.startsWith('http')) {
                    imgPath = `image/${imgPath}`;
                }
                const imgSrc = imgPath || '/image/logo.png';
                const name = escapeHtml(product.productName[lang] || product.productName['ar'] || '');
                const categoryTitle = escapeHtml(rawServerData.categories[product.category]?.title || 'قسم غير معروف');

                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.innerHTML = `
                    <img src="${escapeHtml(imgSrc)}" alt="${name}" loading="lazy">
                    <div class="autocomplete-item-info">
                        <h4>${name}</h4>
                        <span>${categoryTitle}</span>
                    </div>
                    <span class="price">${formatPrice(product.price)}</span>
                `;
                item.addEventListener('click', () => {
const clientItem = formatItem(product, product.category, detectRegion(product));
                    showProductDetails(clientItem, _currentCategoryKey);
                    hideResults();
                    searchInput.value = '';
                });
                resultsContainer.appendChild(item);
            });
            showResults();
        };

        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const query = e.target.value.trim();

            if (query.length < 2) {
                hideResults();
                return;
            }

            // إظهار skeleton loading بينما البحث
            renderLoadingSkeleton();

            debounceTimer = setTimeout(() => {
                const lang = getCurrentLanguage();
                const lowerCaseQuery = query.toLowerCase();

                // --- ✨ بحث موحد باللغة العربية والإنجليزية ---
                const results = searchIndex.filter(product => {
                    const nameAr = (product.productName.ar || '').toLowerCase();
                    const nameEn = (product.productName.en || '').toLowerCase();
                    const category = (product.category || '').toLowerCase();
                    return nameAr.includes(lowerCaseQuery) || nameEn.includes(lowerCaseQuery) || category.includes(lowerCaseQuery);
                }).slice(0, 10); // عرض أول 10 نتائج فقط

                renderResults(results, lang, query);
            }, 300); // انتظار 300ms بعد توقف المستخدم عن الكتابة
        });

        // إخفاء النتائج عند الضغط خارج حقل البحث
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container') && !e.target.closest('.search-container-mobile')) {
                hideResults();
            }
        });

        // إخفاء النتائج عند الضغط على Escape
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideResults();
            }
        });
    };

    setupAutocomplete('searchInput', 'autocomplete-results');
    setupAutocomplete('searchInputMobile', 'autocomplete-results-mobile');

    // فتح السلة عبر زر الهيدر
    const cartHeaderBtn = document.getElementById('cartHeaderBtn');
    if (cartHeaderBtn && purchaseModal) {
        cartHeaderBtn.addEventListener('click', function() {
            // تحسين تجربة المستخدم: تعبئة الإيميل تلقائياً إذا كان مسجلاً دخوله
            const loggedInUser = getCurrentUser();
            const emailInput = document.getElementById('user-email');
            if (loggedInUser && emailInput) {
                emailInput.value = loggedInUser.email;
            }
            updateCartUI();
            purchaseModal.classList.add('active'); 
        });
    }

    // تغيير المحافظ ديناميكياً داخل المودال
    const paymentOptionsContainer = document.querySelector('.payment-options');
    const instructionsZone = document.getElementById('paymentInstructions');

    const updatePaymentInstructions = (method) => {
        if (!instructionsZone) return;
        const payment = siteConfig?.payment || {};
        const jawwal = payment.jawwalNumber || '';
        const palpay = payment.palpayNumber || '';
        if (method === 'jawwal_pay') {
            instructionsZone.innerHTML = jawwal
                ? `<p style="margin: 0 0 8px 0; color: #ff9f43; font-weight: bold;"><i class="fas fa-wallet"></i> حساب جوال بي (Jawwal Pay):</p><p style="margin: 5px 0;">الرجاء تحويل المبلغ إلى الرقم التالي: <span style="color: #fff; font-weight: bold; letter-spacing: 1px;">${jawwal}</span></p><p style="margin: 5px 0; color: #b9bbbe;">بعد التحويل، اكتب رقم العملية أو اسم المحول بالأسفل لتأكيد طلبك.</p>`
                : `<p style="margin: 0 0 8px 0; color: #ff9f43; font-weight: bold;"><i class="fas fa-wallet"></i> جوال بي (Jawwal Pay):</p><p style="margin: 5px 0; color: #b9bbbe;">سيتم تزويدك برقم الحساب بعد إرسال الطلب.</p>`;
        } else if (method === 'palpay') {
            instructionsZone.innerHTML = palpay
                ? `<p style="margin: 0 0 8px 0; color: #0072ff; font-weight: bold;"><i class="fas fa-university"></i> حساب بال بي (PalPay):</p><p style="margin: 5px 0;">الرجاء تحويل المبلغ إلى رقم المحفظة: <span style="color: #fff; font-weight: bold; letter-spacing: 1px;">${palpay}</span></p><p style="margin: 5px 0; color: #b9bbbe;">بعد التحويل، اكتب اسم حسابك أو رقم التحويل بالأسفل.</p>`
                : `<p style="margin: 0 0 8px 0; color: #0072ff; font-weight: bold;"><i class="fas fa-university"></i> بال بي (PalPay):</p><p style="margin: 5px 0; color: #b9bbbe;">سيتم تزويدك برقم المحفظة بعد إرسال الطلب.</p>`;
        }
    };

    if (paymentOptionsContainer) {
        paymentOptionsContainer.addEventListener('change', (e) => {
            if (e.target.name === 'payment_gateway') {
                updatePaymentInstructions(e.target.value);
            }
        });
        // عرض التعليمات الافتراضية عند التحميل
        updatePaymentInstructions('jawwal_pay');
    }

    // إرسال طلب السلة الكامل بالكامل للـ Backend
    const submitOrderBtn = document.getElementById('submitOrderBtn');
    if (submitOrderBtn) {
        submitOrderBtn.addEventListener('click', async function() {
            const email = document.getElementById('user-email').value.trim();
            const paymentRef = document.getElementById('paymentRefInput').value.trim();
            const gateway = document.querySelector('input[name="payment_gateway"]:checked')?.value || 'jawwal_pay';

            if (!email) { showToast('الرجاء إدخال إيميل مستلم الكود أولاً!', 'error'); return; }
            if (!paymentRef) { showToast('الرجاء إدخال رقم العملية أو اسم المحوّل لتأكيد الدفع!', 'error'); return; }
            if (cart.length === 0) { showToast('سلتك فارغة!', 'error'); return; }

            // تجهيز مصفوفة المنتجات لكي يستلمها السيرفر دفعة واحدة
            const orderData = {
                cartItems: cart.map(item => ({ id: item.id, qty: item.qty })),
                customerEmail: email,
                paymentGateway: gateway,
                paymentRef: paymentRef
            };

            submitOrderBtn.disabled = true;
            submitOrderBtn.textContent = '⏳ جاري إرسال طلبك للـ الأدمن...';

            try {
                // الجلسة تُرسل تلقائياً عبر HttpOnly cookie (لا حاجة لتخزين توكن في localStorage)
                const response = await fetch('/api/checkout', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(orderData)
                });

                const result = await response.json();

                if (result.success) {
                    purchaseModal.classList.remove('active');
                    cart.length = 0; // تفريغ المصفوفة
                    localStorage.removeItem('joker_cart');
                    updateCartUI();
                    showToast('🚀 تم استلام طلبك بنجاح! سيصلك الكود فور تأكيد الأدمن.', 'success');
                } else {
                    showToast(`❌ فشل إرسال الطلب: ${  escapeHtml(result.error || 'حدث خطأ غير متوقع')}`, 'error');
                }
            } catch (_err) {
                showToast('❌ عذراً، السيرفر مغلق حالياً أو هناك مشكلة في الاتصال.', 'error');
            } finally {
                submitOrderBtn.disabled = false;
                submitOrderBtn.textContent = '🚀 تأكيد التحويل وإرسال الطلب';
            }
        });
    }

    const clearBtn = document.getElementById('clearCartBtn'); 
    if (clearBtn) {
        clearBtn.onclick = clearCart;
    }

    // زر الـ Hero — العودة للرئيسية والتمرير للأقسام
    document.addEventListener('click', function(e) {
        const cta = e.target.closest('[data-hero-cta]');
        if (!cta) return;
        goBack();
        const target = document.getElementById('mainCategories');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // أزرار الأمنيات (تفويض)
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('[data-wishlist-btn]');
        if (!btn) return;
        e.preventDefault();
        const id = btn.dataset.productId;
        if (!id) return;
        const added = toggleWishlistKey(id);
        showToast(added ? '❤️ أُضيف إلى قائمة الأمنيات' : 'تمت الإزالة من قائمة الأمنيات', added ? 'success' : 'info');
    });

    // فتح/إغلاق نافذة تتبع الطلب
    const trackFooterBtn = document.getElementById('trackOrderFooterBtn');
    const trackModal = document.getElementById('trackOrderModal');
    const closeTrackBtn = document.getElementById('closeTrackOrderModal');
    if (trackFooterBtn && trackModal) {
        trackFooterBtn.addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('trackEmailInput').value = '';
            document.getElementById('trackOrderIdInput').value = '';
            document.getElementById('trackOrderResults').innerHTML = '';
            trackModal.classList.add('active');
        });
    }
    if (closeTrackBtn && trackModal) {
        closeTrackBtn.addEventListener('click', function() { trackModal.classList.remove('active'); });
    }
    const trackOrderBtn = document.getElementById('trackOrderBtn');
    if (trackOrderBtn) {
        trackOrderBtn.addEventListener('click', handleTrackOrder);
    }

    // فتح/إغلاق نافذة قائمة الأمنيات
    const wishlistFooterBtn = document.getElementById('wishlistFooterBtn');
    const wishlistModal = document.getElementById('wishlistModal');
    const closeWishlistBtn = document.getElementById('closeWishlistModal');
    if (wishlistFooterBtn && wishlistModal) {
        wishlistFooterBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showWishlist();
        });
    }
    if (closeWishlistBtn && wishlistModal) {
        closeWishlistBtn.addEventListener('click', function() { wishlistModal.classList.remove('active'); });
    }

    // إغلاق نافذة الأمنيات عند ضغط زر تفاصيل منتج بداخلها (التفويض يعمل تلقائياً)
    if (wishlistModal) {
        wishlistModal.addEventListener('click', function(e) {
            if (e.target === wishlistModal) wishlistModal.classList.remove('active');
        });
    }
    if (trackModal) {
        trackModal.addEventListener('click', function(e) {
            if (e.target === trackModal) trackModal.classList.remove('active');
        });
    }
}

//  تهيئة الأحداث عند تحميل الصفحة
// ======================================================
document.addEventListener('DOMContentLoaded', function() {
    // استدعاء دالة التهيئة الرئيسية التي أصبحت الآن تحتوي على كل المنطق اللازم بالترتيب الصحيح.
    initializeApp(); 
});

// ======================================================
// 🍞 نظام الإشعارات المنبثقة (Toast Notifications)
// ======================================================
// تم نقل هذا المنطق بالكامل إلى ui.js
