import { showAllCategories, showProductDetails, updateCartUI, showToast, initToastContainer, escapeHtml, bindCardImageState, setGuaranteeStripVisible } from './ui.js';
import { cart, addToCart, clearCart } from './cart.js';
import { initAuth, getCurrentUser } from './auth.js';
import { initI18n, getCurrentLanguage, t } from './i18n.js';
import { setCurrency, formatPrice } from './currency.js';
import { rawServerData, renderRatingStars, renderStockBadge, syncWishlistButtons, toggleWishlistKey, getWishlist, resolveImageUrl, getCategoryTheme, bestSellerIds, applyProductBadge, getAppliedPromo, setAppliedPromo, clearAppliedPromo, getAppliedLoyalty, clearAppliedLoyalty, setPromoDiscounts, setupReveal } from './shared.js';
import { openModal, closeModal, initModalBehaviors } from './modals.js';
import { initRealtime, initPublicPulse } from './realtime.js';

// ======================================================
//  ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ط£ط³ط§ط³ظٹط© ظ„ظ„ط£ظ‚ط³ط§ظ… (ظ…ط³طھظˆط±ط¯ط© ظ…ظ† shared.js)
// ======================================================

let searchIndex = []; // ًںڑ€ ظپظ‡ط±ط³ ط§ظ„ط¨ط­ط« ط§ظ„ط³ط±ظٹط¹
let _currentCategoryKey = 'all'; // ظ…طھط؛ظٹط± ط¯ط§ط®ظ„ظٹ ظ„ظ…طھط§ط¨ط¹ط© ط§ظ„ظ‚ط³ظ… ط§ظ„ط­ط§ظ„ظٹ
let _categoryProducts = []; // ظ…ظ†طھط¬ط§طھ ط§ظ„ظ‚ط³ظ… ط§ظ„ط­ط§ظ„ظٹ (ظ„ظ„طھط±طھظٹط¨ ظˆط§ظ„ظپظ„طھط±ط©)
let _currentSort = 'latest'; // ط§ظ„طھط±طھظٹط¨ ط§ظ„ط­ط§ظ„ظٹ: latest | price_asc | price_desc | rating
const productCache = new Map(); // ط°ط§ظƒط±ط© طھط®ط²ظٹظ† ظ…ط¤ظ‚طھ ظ„ظ„ظ…ظ†طھط¬ط§طھ ط§ظ„طھظٹ ظٹطھظ… ط¬ظ„ط¨ظ‡ط§

// ======================================================
// ًںڑ€ طھط´ط؛ظٹظ„ ط³ظ„ط§ظٹط¯ط± ط§ظ„ط¹ط±ظˆط¶ طھظ„ظ‚ط§ط¦ظٹط§ظ‹
// ======================================================
function initHeroSlider() {
    const slides = document.querySelectorAll('.hero-section .slide');
    if (slides.length <= 1) return;

    let currentSlide = 0;
    setInterval(() => {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    }, 5000); // طھط¨ط¯ظٹظ„ ظƒظ„ 5 ط«ظˆط§ظ†ظچ
}

// ======================================================
// ًں›،ï¸ڈ طھط­ط¯ظٹط« ط´ط±ظٹط· ط§ظ„ط«ظ‚ط© ط¨ط¨ظٹط§ظ†ط§طھ ط­ظ‚ظٹظ‚ظٹط©
// ======================================================
let _lastTickerOrders = [];

function renderTickerItems() {
    const tickerZone = document.querySelector('.ticker-content');
    if (!tickerZone || _lastTickerOrders.length === 0) return;

    const itemsHtml = _lastTickerOrders.map(o => {
        const id = escapeHtml(String(o.orderId || '')).substring(0, 8);
        const name = escapeHtml(String(o.productName || ''));
        return `<span class="ticker-item"><i class="fas fa-check-circle" aria-hidden="true"></i><b>${id}</b><span class="ticker-name">${name}</span><em>${t('ticker_moment')}</em></span>`;
    }).join('<span class="ticker-sep" aria-hidden="true">âœ¦</span>');

    tickerZone.innerHTML = `${itemsHtml} <span class="ticker-item trust">${t('trust_all_codes')}</span>`;
}

async function updateTrustTicker() {
    const tickerZone = document.querySelector('.ticker-content');
    if (!tickerZone) return;

    try {
        const res = await fetch('/api/products/latest-orders'); // ط³ظ†ظپطھط±ط¶ ظˆط¬ظˆط¯ ظ‡ط°ط§ ط§ظ„ظ…ط³ط§ط± ط§ظ„ط¨ط³ظٹط·
        const data = await res.json();
        if (data.success && data.orders.length > 0) {
            _lastTickerOrders = data.orders;
            renderTickerItems();
            enqueueSocialProof();
        }
    } catch (_e) {
        // ظپظٹ ط­ط§ظ„ ط§ظ„ظپط´ظ„ ظ†طھط±ظƒ ط§ظ„ظ†طµ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ ط§ظ„ط¬ظ…ظٹظ„ ط§ظ„ط°ظٹ ظˆط¶ط¹ظ†ط§ظ‡
    }
}

// ======================================================
//  ًں”” Social Proof â€” ظ†ط¨ط¶ ط§ط¬طھظ…ط§ط¹ظٹ ط­ظٹ (ط¹ظ…ظ„ظٹط§طھ ط­ظ‚ظٹظ‚ظٹط© ظ…ظ† ط§ظ„ط³ط¬ظ„)
// ======================================================
const _socialQueue = [];
const _socialShown = new Set();
let _socialTimer = null;

function socialTimeAgo(ts) {
    if (!ts) return t('social_proof_now');
    const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
    if (mins < 1) return t('social_proof_now');
    if (mins < 60) return t('social_proof_mins').replace('{n}', String(mins));
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('social_proof_hrs').replace('{n}', String(hours));
    return t('social_proof_days').replace('{n}', String(Math.floor(hours / 24)));
}

function enqueueSocialProof() {
    const chip = document.getElementById('socialProof');
    if (!chip) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    _lastTickerOrders.forEach((o) => {
        const key = String(o.orderId || `${o.productName}-${o.time || ''}`);
        if (_socialShown.has(key)) return;
        _socialShown.add(key);
        _socialQueue.push({ name: o.productName || t('social_proof_product'), time: socialTimeAgo(o.time) });
    });
    if (_socialQueue.length && !_socialTimer) showNextSocialProof();
}

function showNextSocialProof() {
    const chip = document.getElementById('socialProof');
    if (!chip || _socialQueue.length === 0) return;
    const item = _socialQueue.shift();
    const nameEl = chip.querySelector('.social-proof-name');
    const metaEl = chip.querySelector('.social-proof-meta');
    if (!nameEl || !metaEl) return;
    nameEl.textContent = item.name;
    metaEl.textContent = t('social_proof_bought')
        .replace('{name}', item.name)
        .replace('{time}', item.time);
    chip.classList.add('show');
    chip.setAttribute('aria-hidden', 'false');
    _socialTimer = setTimeout(() => {
        chip.classList.remove('show');
        chip.setAttribute('aria-hidden', 'true');
        _socialTimer = null;
        setTimeout(showNextSocialProof, 3500);
    }, 5000);
}

// ======================================================
//  ط¯ظˆط§ظ„ظ…ط³ط§ط¹ط¯ط© (Helper Functions)
// ======================================================
function detectRegion(item) {
    const text = (`${item.productName || item.name || ""  } ${  item._id || item.id || ""}`).toLowerCase();
    if (text.includes('tr') || text.includes('طھط±ظƒظٹ')) return 'tr';
    if (text.includes('ae') || text.includes('ط§ظ…ط§ط±ط§طھ')) return 'ae';
    if (text.includes('sa') || text.includes('ط³ط¹ظˆط¯ظٹ')) return 'sa';
    if (text.includes('us') || text.includes('ط§ظ…ط±ظٹظƒظٹ')) return 'us';
    if (text.includes('eu') || text.includes('ط§ظˆط±ظˆط¨')) return 'eu';
    return 'global';
}

function formatItem(item, categoryKey, region) {
    const imageUrl = resolveImageUrl(item.image) || resolveImageUrl(`image/${categoryKey}.png`);

    return {
        id: item._id || item.id,
        name: item.name,
        description: item.description ? (item.description[getCurrentLanguage()] || item.description.en || item.description.ar || '') : '',
        price: (typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0).toFixed(0),
        region: region,
        category: categoryKey,
        image: imageUrl,
        rating: typeof item.rating === 'number' ? item.rating : 0,
        reviewsCount: typeof item.reviewsCount === 'number' ? item.reviewsCount : 0,
        availableStock: (item.availableStock === null || item.availableStock === undefined) ? null : Number(item.availableStock),
        updatedAt: item.updatedAt || null,
        totalSold: Number(item.totalSold || 0),
        isSubscription: !!item.isSubscription,
        subscriptionType: item.subscriptionType || null
    };
}

// ======================================================
//  â­گ طھظ‚ظٹظٹظ…ط§طھ ط§ظ„ظ…ظ†طھط¬ط§طھ (ظ…ط³طھظˆط±ط¯ط© ظ…ظ† shared.js)
// ======================================================

// ======================================================
//  â‌¤ï¸ڈ ظ‚ط§ط¦ظ…ط© ط§ظ„ط£ظ…ظ†ظٹط§طھ (Wishlist â€” localStorage)
// ======================================================

async function showWishlist() {
    const modal = document.getElementById('wishlistModal');
    const container = document.getElementById('wishlistGrid');
    if (!modal || !container) return;
    openModal(modal);
    const ids = getWishlist();

    if (ids.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; grid-column:1/-1; padding:30px;">ًں’” ${t('wishlist_empty')}</p>`;
        return;
    }

    container.innerHTML = `<p style="color:var(--text-muted); text-align:center; grid-column:1/-1; padding:30px;"><i class="fas fa-spinner fa-spin"></i> ${t('loading_generic')}</p>`;

    try {
        const res = await fetch('/api/products/search-index');
        const data = await res.json();
        const lang = getCurrentLanguage();
        const template = document.getElementById('product-card-template');
        container.innerHTML = '';

        const wished = data.products.filter(p => ids.includes(String(p._id || p.id)));
        if (wished.length === 0) {
            container.innerHTML = `<p style="color:var(--text-muted); text-align:center; grid-column:1/-1; padding:30px;">${t('wishlist_empty')}</p>`;
            return;
        }

        wished.forEach((item, idx) => {
            const localizedName = item.productName[lang] || item.productName['ar'];
            const detectedRegion = detectRegion(item);
            const regionInfo = getRegionDetails(detectedRegion);
            const clientItem = formatItem({ ...item, name: localizedName }, item.category, detectedRegion);

            const card = template.content.cloneNode(true);
            const cardElement = card.querySelector('.product-item-card');
            cardElement.dataset.productId = clientItem.id;
            cardElement.dataset.region = detectedRegion;
            cardElement.style.setProperty('--i', String(idx));
            card.querySelector('.card-flag-badge').innerHTML = regionInfo.isIcon ? '<i class="fas fa-globe"></i>' : `<img src="${regionInfo.flagUrl}" />`;
            const img = card.querySelector('.card-inner-img');
            img.src = clientItem.image;
            img.onerror = () => { img.src = '/image/logo.png'; };
            bindCardImageState(img);
            const quickAdd = card.querySelector('[data-quick-add]');
            if (quickAdd) quickAdd.dataset.productId = clientItem.id;
            card.querySelector('.card-title').textContent = clientItem.name;
            card.querySelector('.card-price').textContent = formatPrice(clientItem.price);
            card.querySelector('[data-wishlist-btn]').dataset.productId = clientItem.id;
            card.querySelector('[data-rating]').innerHTML = renderRatingStars(clientItem.rating, clientItem.reviewsCount);
            const stockBadge = card.querySelector('[data-stock-badge]');
            if (stockBadge) {
                const stockText = renderStockBadge(clientItem.availableStock);
                stockBadge.textContent = stockText;
                stockBadge.classList.toggle('out-of-stock', Number(clientItem.availableStock) <= 0);
            }
            applyProductBadge(card.querySelector('.product-badge'), { productId: clientItem.id });
            container.appendChild(card);
        });
        syncWishlistButtons();
    } catch (_e) {
        container.innerHTML = `<p style="color:#e74c3c; text-align:center; grid-column:1/-1; padding:30px;">â‌Œ ${t('wishlist_load_error')}</p>`;
    }
}

// ======================================================
//  âڑ™ï¸ڈ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ظ…ظˆظ‚ط¹ (ط£ط±ظ‚ط§ظ… ط§ظ„ط¯ظپط¹طŒ ط±ظˆط§ط¨ط· ط§ظ„طھظˆط§طµظ„طŒ ط§ظ„ط¥ط­طµط§ط¦ظٹط§طھ)
// ======================================================
let siteConfig = null;
let paymentProofUrl = null;

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

    // ظˆط³ط§ط¦ظ„ ط§ظ„ط¯ظپط¹: ط¥ظ† ظ„ظ… طھظڈط¶ط¨ط· ط£ط±ظ‚ط§ظ… ط§ظ„ط­ط³ط§ط¨ط§طھطŒ ظ†ط®ظپظٹ ط®ظٹط§ط±ط§طھ ط§ظ„ط¯ظپط¹ طھظ…ط§ظ…ط§ظ‹ (ظ„ط§ ظ†ط¹ط±ط¶ ط£ط±ظ‚ط§ظ…ط§ظ‹ ظˆظ‡ظ…ظٹط©)
    const payment = siteConfig.payment || {};
    const paymentOptionsEl = document.querySelector('.payment-options');
    const hasPaymentNumbers = Boolean(payment.jawwalNumber) || Boolean(payment.palpayNumber) || Boolean(payment.reflectNumber);
    if (paymentOptionsEl && !hasPaymentNumbers) {
        paymentOptionsEl.style.display = 'none';
    }

    // Stripe: ظ†ظڈط¸ظ‡ط± ط®ظٹط§ط± ط§ظ„ط¯ظپط¹ ط¨ط§ظ„ط¨ط·ط§ظ‚ط© ظپظ‚ط· ط¹ظ†ط¯ظ…ط§ ظٹظƒظˆظ† ظ…ظپط¹ظ„ط§ظ‹ ظپظٹ ط§ظ„ط®ط§ط¯ظ…
    const stripeOption = document.getElementById('stripePaymentOption');
    if (stripeOption) {
        stripeOption.style.display = (siteConfig.stripe && siteConfig.stripe.enabled) ? 'flex' : 'none';
    }

    // ط¥ط«ط¨ط§طھ ط§ظ„ظ…ط¨ظٹط¹ط§طھ ط§ظ„ط­ظٹ: ظٹظڈظ…ظ„ط£ ظ…ظ† ط¥ط­طµط§ط¦ظٹط§طھ ط­ظ‚ظٹظ‚ظٹط© ظ…ظ† ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ
    const proofEl = document.getElementById('liveSalesProof');
    const proofText = proofEl ? proofEl.querySelector('span') : null;
    const stats = siteConfig.stats || {};
    const customers = Math.max(0, Number(stats.customers) || 0);
    const orders = Math.max(0, Number(stats.orders) || 0);
    if (proofEl && proofText && (customers > 0 || orders > 0)) {
        proofText.textContent = t('live_sales_proof')
            .replace('{customers}', customers)
            .replace('{orders}', orders);
        proofEl.style.display = 'flex';
    } else if (proofEl) {
        proofEl.style.display = 'none';
    }

    // ط´ط±ظٹط· ط§ظ„ط¥ط­طµط§ط¦ظٹط§طھ ظپظٹ ط£ط¹ظ„ظ‰ ط§ظ„طµظپط­ط© ط§ظ„ط±ط¦ظٹط³ظٹط©
    const homeStatsStrip = document.getElementById('homeStatsStrip');
    const homeStatsCountEl = document.getElementById('homeStatsCount');
    const homeStatsTextEl = document.getElementById('homeStatsText');
    if (homeStatsStrip && (customers > 0 || orders > 0)) {
        const target = customers + orders;
        if (homeStatsCountEl) animateNumber(homeStatsCountEl, 0, target, 800);
        if (homeStatsTextEl) homeStatsTextEl.textContent = t('stats_strip_text')
            .replace('{customers}', customers)
            .replace('{orders}', orders);
        homeStatsStrip.hidden = false;
    } else if (homeStatsStrip) {
        homeStatsStrip.hidden = true;
    }

    const analytics = siteConfig.analytics || {};
    if (analytics.gaId && !document.querySelector('script[data-ga]')) {
        const s1 = document.createElement('script');
        s1.async = true; s1.dataset.ga = '1';
        s1.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(analytics.gaId)}`;
        document.head.appendChild(s1);
        const s2 = document.createElement('script');
        s2.dataset.ga = '1';
        s2.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${analytics.gaId.replace(/'/g,"\\'")}');`;
        document.head.appendChild(s2);
    }
    if (analytics.metaPixelId && !document.querySelector('script[data-meta-pixel]')) {
        const s = document.createElement('script');
        s.dataset.metaPixel = '1';
        s.textContent = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${analytics.metaPixelId.replace(/'/g,"\\'")}');fbq('track','PageView');`;
        document.head.appendChild(s);
    }
}

/**
 * ط¹ط¯ظ‘ط§ط¯ ظ…طھط­ط±ظƒ ظ…ظ† طµظپط± ط¥ظ„ظ‰ ط§ظ„ظ‚ظٹظ…ط© ط§ظ„ظ…ط³طھظ‡ط¯ظپط© (ط£ط«ط¨ط§طھ ط­ظٹ ظ„ظ„ط¥ط­طµط§ط¦ظٹط§طھ).
 * @param {HTMLElement} el - ط§ظ„ط¹ظ†طµط± ط§ظ„ط°ظٹ ظٹط¸ظ‡ط± ط§ظ„ط±ظ‚ظ….
 * @param {number} from - ظ‚ظٹظ…ط© ط§ظ„ط¨ط¯ط§ظٹط©.
 * @param {number} to - ط§ظ„ظ‚ظٹظ…ط© ط§ظ„ظ…ط³طھظ‡ط¯ظپط©.
 * @param {number} duration - ظ…ط¯ط© ط§ظ„ط­ط±ظƒط© ط¨ط§ظ„ظ…ظٹظ„ظٹ ط«ط§ظ†ظٹط©.
 */
function animateNumber(el, from, to, duration = 800) {
    if (typeof requestAnimationFrame !== 'function') {
        el.textContent = to.toLocaleString();
        return;
    }
    const prefersReducedMotion = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    if (prefersReducedMotion) {
        el.textContent = to.toLocaleString();
        return;
    }
    const start = performance.now();
    const tick = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
        el.textContent = Math.round(from + (to - from) * eased).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

// ======================================================
//  ًں”چ طھطھط¨ط¹ ط§ظ„ط·ظ„ط¨
// ======================================================
// ط®ط· ط²ظ…ظ†ظٹ ظ…ظ† 3 ط®ط·ظˆط§طھ ظ„ط­ط§ظ„ط© ط§ظ„ط·ظ„ط¨ (ظٹظڈط¨ظ†ظ‰ ظƒظ€ HTML ظˆط£ط³ظ„ط§ظƒظ‡ ظپظٹ style.css)
function buildOrderTimeline(status) {
    const steps = [
        { key: 'track_step_received', state: 'pending' },
        { key: 'track_step_processing', state: 'pending' },
        { key: 'track_step_delivered', state: 'pending' }
    ];

    if (status === 'pending') {
        steps[0].state = 'current';
    } else if (status === 'processing') {
        steps[0].state = 'done';
        steps[1].state = 'current';
    } else if (status === 'completed') {
        steps[0].state = 'done';
        steps[1].state = 'done';
        steps[2].state = 'done';
    }

    return `
        <div class="track-timeline">
            ${steps.map(step => `
                <div class="timeline-step ${step.state}">
                    <span class="timeline-dot">${step.state === 'done' ? '<i class="fas fa-check"></i>' : ''}</span>
                    <span class="timeline-step-label">${escapeHtml(t(step.key))}</span>
                </div>`).join('')}
        </div>`;
}

// ط¹ط±ط¶ ظپط´ظ„/ط§ط³طھط±ط¯ط§ط¯ ط¹ظ„ظ‰ ط§ظ„ط®ط· ط§ظ„ط²ظ…ظ†ظٹ ط¨ط§ظ„ظƒط§ظ…ظ„ (ط£ط­ظ…ط± + â‌Œ) ط¯ظˆظ† طµظ†ط¯ظˆظ‚ ط§ظ„ط£ظƒظˆط§ط¯
function buildOrderFailureTimeline() {
    const steps = ['track_step_received', 'track_step_processing', 'track_step_delivered'];
    return `
        <div class="track-timeline fail">
            ${steps.map(key => `
                <div class="timeline-step fail">
                    <span class="timeline-dot"><i class="fas fa-times"></i></span>
                    <span class="timeline-step-label">${escapeHtml(t(key))}</span>
                </div>`).join('')}
        </div>`;
}

async function handleTrackOrder() {
    const emailInput = document.getElementById('trackEmailInput');
    const orderIdInput = document.getElementById('trackOrderIdInput');
    const results = document.getElementById('trackOrderResults');
    if (!emailInput || !results) return;

    const email = emailInput.value.trim();
    const orderId = orderIdInput.value.trim();
    if (!email) { showToast(t('track_email_required'), 'error'); return; }

    results.innerHTML = `<p style="text-align:center; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> ${t('loading_generic')}</p>`;

    try {
        const res = await fetch('/api/track-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, orderId })
        });
        const data = await res.json();

        if (!data.success) {
            results.innerHTML = `<p style="color:#e74c3c; text-align:center;">â‌Œ ${escapeHtml(data.error || t('track_error_generic'))}</p>`;
            return;
        }
        if (data.orders.length === 0) {
            results.innerHTML = `<p style="color:var(--text-muted); text-align:center;">ًں”چ ${t('track_no_results')}</p>`;
            return;
        }

        const lang = getCurrentLanguage();
        const statusMap = {
            completed: { text: t('track_status_completed'), cls: 'completed' },
            pending: { text: t('track_status_pending'), cls: 'pending' },
            processing: { text: t('track_status_processing'), cls: 'processing' },
            failed: { text: t('track_status_failed'), cls: 'failed' },
            refunded: { text: t('track_status_refunded'), cls: 'refunded' }
        };

        results.innerHTML = data.orders.map(order => {
            const st = statusMap[order.status] || { text: order.status, cls: '' };
            const isFailure = order.status === 'failed' || order.status === 'refunded';
            const date = new Date(order.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
            const items = order.items.map(i => escapeHtml(i.name[lang] || i.name.ar)).join('طŒ ');
            const codesHtml = (!isFailure && order.codes && order.codes.length)
                ? `<div class="track-code-box"><span class="track-code-label">${escapeHtml(t('track_shipping_code'))}</span>${order.codes.map(c => `<span class="track-code-row"><code class="track-code" dir="ltr">${escapeHtml(c)}</code><button type="button" class="track-copy-btn" data-code="${escapeHtml(c)}" title="${escapeHtml(t('track_copy_code'))}" aria-label="${escapeHtml(t('track_copy_code'))}"><i class="fas fa-copy"></i></button></span>`).join('')}</div>`
                : '';
            return `
                <div class="track-result-card">
                    <div class="track-head">
                        <span class="track-id">#${escapeHtml(order.orderId)}</span>
                        <span class="status-badge ${st.cls}">${st.text}</span>
                    </div>
                    ${isFailure ? buildOrderFailureTimeline() : buildOrderTimeline(order.status)}
                    <div style="font-size:0.9rem; color:var(--text-muted);">${items}</div>
                    <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">${date} | <b style="color:#fff;">${formatPrice(order.price)}</b></div>
                    ${codesHtml}
                </div>`;
        }).join('');
    } catch (_e) {
        results.innerHTML = `<p style="color:#e74c3c; text-align:center;">â‌Œ ${t('auth_error_connection')}</p>`;
    }
}

// ======================================================
//  ًں’³ ط¥ظٹطµط§ظ„ ط§ظ„ط·ظ„ط¨ + ط§ط³طھظ„ط§ظ… ط§ظ„ط£ظƒظˆط§ط¯ ظ„ط­ط¸ظٹط§ظ‹
//  ظٹط¹ط±ط¶ ط±ظ‚ظ… ط§ظ„ط·ظ„ط¨طŒ ظٹظ†طھط¸ط± طھط£ظƒظٹط¯ ط§ظ„ط£ط¯ظ…ظ† ط¨ط§ظ„ط§ط³طھط·ظ„ط§ط¹طŒ ط«ظ…
//  ظٹط³ظ„ظ‘ظ… ط§ظ„ط£ظƒظˆط§ط¯ ظ…ط¹ ط²ط± ظ†ط³ط® ظˆط¹ط¯ظ‘ط§ط¯ ظٹظڈط®ظپظٹظ‡ط§ ط¨ط¹ط¯ 15 ط¯ظ‚ظٹظ‚ط©.
//  ط§ظ„ط£ظƒظˆط§ط¯ طھط¨ظ‚ظ‰ ظ…ط­ظپظˆط¸ط© ظپظٹ طھطھط¨ط¹ ط§ظ„ط·ظ„ط¨ ط­طھظ‰ ط¨ط¹ط¯ ط¥ط؛ظ„ط§ظ‚ ط§ظ„طµظپط­ط©.
// ======================================================
const RECEIPT_CODE_TTL = 15 * 60 * 1000; // 15 ط¯ظ‚ظٹظ‚ط© ظ…ظ† ظ„ط­ط¸ط© ط§ظ„طھط³ظ„ظٹظ…
let _receiptPollTimer = null;
let _receiptCountdownTimer = null;
let _receiptPollFn = null;
let _receiptContext = null;

function stopReceiptPolling() {
    if (_receiptPollTimer) { clearInterval(_receiptPollTimer); _receiptPollTimer = null; }
    _receiptPollFn = null;
}

function stopReceiptCountdown() {
    if (_receiptCountdownTimer) { clearInterval(_receiptCountdownTimer); _receiptCountdownTimer = null; }
}

async function copyTextToClipboard(text) {
    const str = String(text ?? '');
    try {
        await navigator.clipboard.writeText(str);
        return true;
    } catch (_e) {
        const ta = document.createElement('textarea');
        ta.value = str;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (_e2) { ok = false; }
        // ط£ظˆظ„ظˆظٹط© ط§ظ„ظ†ط¬ط§ط­: ط¥ظ† ظپط´ظ„ ط§ظ„طھظ†ظپظٹط° ظ†ظڈط¨ظ‚ظٹ ط§ظ„طھط­ط¯ظٹط¯ ظ„ظ„ظ†ط³ط® ط§ظ„ظٹط¯ظˆظٹ ط¨ظ€ Ctrl+C
        if (!ok) {
            const range = document.createRange();
            range.selectNodeContents(ta);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            return false;
        }
        ta.remove();
        return true;
    }
}

function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function renderReceiptCodes(order) {
    const zone = document.getElementById('deliveredCodesZone');
    const list = document.getElementById('receiptCodesList');
    const countdownEl = document.getElementById('receiptCountdown');
    const statusZone = document.getElementById('receiptStatusZone');
    if (!zone || !list) return;

    const codes = (order && order.codes && order.codes.length) ? order.codes : [];
    if (!codes.length) return;

    // ط¨ط¯ط§ظٹط© ط§ظ„ط¹ط¯ظ‘ط§ط¯ = ظˆظ‚طھ ط§ظƒطھظ…ط§ظ„ ط§ظ„ط·ظ„ط¨ ظ…ظ† ط§ظ„ط®ط§ط¯ظ… (ظٹط«ط¨طھ ط¹ط¨ط± ط¥ط¹ط§ط¯ط© ظپطھط­ ط§ظ„طµظپط­ط©)
    const startMs = order.completedAt ? new Date(order.completedAt).getTime() : Date.now();
    const endMs = startMs + RECEIPT_CODE_TTL;
    const ttlKey = `joker:receipt:end:${order.orderId}`;
    const stored = Number(sessionStorage.getItem(ttlKey) || 0);
    const finalEnd = (stored && stored >= endMs - RECEIPT_CODE_TTL && stored <= endMs + RECEIPT_CODE_TTL) ? stored : endMs;
    sessionStorage.setItem(ttlKey, String(finalEnd));

    list.innerHTML = codes.map(code =>
        `<div class="receipt-code-row">
            <code dir="ltr">${escapeHtml(code)}</code>
            <button type="button" class="receipt-copy-one" data-code="${escapeHtml(code)}" title="${escapeHtml(t('track_copy_code'))}" aria-label="${escapeHtml(t('track_copy_code'))}"><i class="fas fa-copy"></i></button>
        </div>`).join('');

    if (statusZone) statusZone.innerHTML = '';
    zone.hidden = false;
    zone.classList.remove('codes-hidden');
    const trackBtn = document.getElementById('openTrackingBtn');
    if (trackBtn) trackBtn.hidden = false;

    stopReceiptCountdown();
    const tick = () => {
        const remain = finalEnd - Date.now();
        if (remain <= 0) {
            stopReceiptCountdown();
            if (countdownEl) countdownEl.textContent = t('receipt_expired');
            list.classList.add('codes-hidden');
            list.querySelectorAll('code').forEach(c => { c.textContent = 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢'; });
            return;
        }
        if (countdownEl) countdownEl.textContent = t('receipt_countdown').replace('{time}', formatCountdown(remain));
    };
    tick();
    _receiptCountdownTimer = setInterval(tick, 1000);
}

function renderOrderReceipt({ email, orderId }) {
    stopReceiptPolling();
    stopReceiptCountdown();
    _receiptContext = { email, orderId };

    const titleEl = document.getElementById('modalProductTitle');
    const codeEl = document.getElementById('generatedCode');
    const statusZone = document.getElementById('receiptStatusZone');
    const codesZone = document.getElementById('deliveredCodesZone');
    const openTrackingBtn = document.getElementById('openTrackingBtn');

    if (titleEl) titleEl.textContent = email || '';
    if (codeEl) {
        codeEl.textContent = orderId || 'â€”';
        codeEl.classList.remove('revealed');
        requestAnimationFrame(() => codeEl.classList.add('revealed'));
    }
    if (statusZone) statusZone.innerHTML = '';
    if (codesZone) { codesZone.hidden = true; codesZone.classList.remove('codes-hidden'); }
    if (openTrackingBtn) openTrackingBtn.hidden = false;
    openModal(document.getElementById('codeModal'));

    if (statusZone) {
        statusZone.innerHTML = `
            <div class="receipt-waiting">
                <span class="receipt-spinner"><i class="fas fa-circle-notch fa-spin"></i></span>
                <p class="receipt-waiting-title">${escapeHtml(t('receipt_waiting_title'))}</p>
                <p class="receipt-waiting-desc">${escapeHtml(t('receipt_waiting_desc'))}</p>
            </div>`;
    }

    const poll = async () => {
        try {
            const res = await fetch('/api/track-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, orderId })
            });
            const data = await res.json();
            const order = data && data.orders && data.orders[0];
            if (!order) return;
            if (order.status === 'completed') {
                stopReceiptPolling();
                renderReceiptCodes(order);
            } else if (order.status === 'failed' || order.status === 'refunded') {
                stopReceiptPolling();
                if (statusZone) {
                    statusZone.innerHTML = `
                        <div class="receipt-failed">
                            <span class="receipt-failed-icon"><i class="fas fa-times-circle"></i></span>
                            <p class="receipt-failed-title">${escapeHtml(t('receipt_failed_title'))}</p>
                            <p class="receipt-failed-desc">${escapeHtml(t('receipt_failed_desc'))}</p>
                        </div>`;
                }
            }
        } catch (_e) { /* ط£ظٹ ط®ط·ط£ ط´ط¨ظƒط© ظپظٹ ط¬ظˆظ„ط© ظ…ط§ ظٹظڈط¹ط§ط¯ ظپظٹ ط§ظ„ط¬ظˆظ„ط© ط§ظ„ظ‚ط§ط¯ظ…ط© */ }
    };

    _receiptPollFn = poll;
    poll();
    _receiptPollTimer = setInterval(poll, 8000);
}

function openOrderTrackingFromReceipt() {
    const ctx = _receiptContext;
    stopReceiptPolling();
    stopReceiptCountdown();
    const trackModal = document.getElementById('trackOrderModal');
    const emailInput = document.getElementById('trackEmailInput');
    const orderInput = document.getElementById('trackOrderIdInput');
    if (ctx) {
        if (emailInput) emailInput.value = ctx.email;
        if (orderInput) orderInput.value = ctx.orderId;
    }
    closeModal(document.getElementById('codeModal'));
    if (trackModal) openModal(trackModal);
    if (ctx) handleTrackOrder();
}

// طھط­ط¯ظٹط« ظپظˆط±ظٹ ظ„ظ„ط¥ظٹطµط§ظ„ ط§ظ„ظ…ظپطھظˆط­ ط¹ظ†ط¯ ظˆطµظˆظ„ ط¥ط´ط¹ط§ط± WebSocket ظ„ط·ظ„ط¨ظچ ظ…ط¹ظ†ظٹ
window.addEventListener('joker-order-status', function(e) {
    const ctx = _receiptContext;
    const d = (e && e.detail) || {};
    if (ctx && d.orderId && String(d.orderId).toUpperCase() === String(ctx.orderId).toUpperCase() && _receiptPollFn) {
        _receiptPollFn();
    }
});

// ظ†ط³ط® ط§ظ„ط£ظƒظˆط§ط¯ ظ…ظ† ط§ظ„ط¥ظٹطµط§ظ„ ط£ظˆ ظ†ط§ظپط°ط© ط§ظ„طھطھط¨ط¹ (طھظپظˆظٹط¶)
document.addEventListener('click', function(e) {
    const copyBtn = e.target.closest('.receipt-copy-one, .track-copy-btn');
    if (copyBtn) {
        const code = copyBtn.dataset.code || (copyBtn.closest('.receipt-code-row, .track-code-row')?.querySelector('code')?.textContent || '');
        copyTextToClipboard(code).then(ok => {
            if (ok) {
                showToast(t('code_copied'), 'success');
                const icon = copyBtn.querySelector('i');
                if (icon) {
                    icon.classList.replace('fa-copy', 'fa-check');
                    setTimeout(() => { if (icon) icon.classList.replace('fa-check', 'fa-copy'); }, 1200);
                }
            } else {
                showToast(t('track_copy_manual'), 'info');
            }
        });
        return;
    }
    if (e.target.closest('#openTrackingBtn')) {
        openOrderTrackingFromReceipt();
    }
});

// ======================================================
//  ط¯ط§ظ„ط© طھط­ط¯ظٹط¯ ط§ظ„ط±ظٹط¬ظ† ظˆط¬ظ„ط¨ ط±ظˆط§ط¨ط· ط§ظ„ط£ط¹ظ„ط§ظ… ط§ظ„ظ…ط­ظ„ظٹط©
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
//  ط¯ط§ظ„ط© ظ„ظ…ط¹ط±ظپط© ط§ظ„ظ‚ط³ظ… ط§ظ„ط­ط§ظ„ظٹ
//  ط¹ط±ط¶ ط§ظ„ظ…ظ†طھط¬ط§طھ ط¯ط§ط®ظ„ ط§ظ„ظ‚ط³ظ…
// ======================================================
export function selectCategory(categoryKey) {
    // ط­ظپط¸ ط§ظ„ظ‚ط³ظ… ط§ظ„ط°ظٹ طھظ…طھ ط²ظٹط§ط±طھظ‡ ظپظٹ ط§ظ„طھط®ط²ظٹظ† ط§ظ„ظ…ط­ظ„ظٹ
    localStorage.setItem('joker_lastCategory', categoryKey);

    // ط§ط³طھط¹ط§ط¯ط© ط§ظ„ط¹ظ†ظˆط§ظ† ط§ظ„ط§ظپطھط±ط§ط¶ظٹ ط¹ظ†ط¯ ظ…ط؛ط§ط¯ط±ط© طµظپط­ط© طھظپط§طµظٹظ„ ط§ظ„ظ…ظ†طھط¬
    document.title = t('site_title');

    _currentCategoryKey = categoryKey; // طھط­ط¯ظٹط« ط§ظ„ظ‚ط³ظ… ط§ظ„ط­ط§ظ„ظٹ
    _categoryProducts = []; // طھطµظپظٹط± ط§ظ„ظ…ظ†طھط¬ط§طھ ط§ظ„ظ…ط®ط²ظ†ط©
    _currentSort = 'latest'; // ط¥ط¹ط§ط¯ط© طھط¹ظٹظٹظ† ط§ظ„طھط±طھظٹط¨
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
    grid.className = 'products-grid'; // طھط·ط¨ظٹظ‚ ظƒظ„ط§ط³ ط§ظ„ط´ط¨ظƒط© ظ„ظ„ظ…ظ†طھط¬ط§طھ
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

    // ط§ط³طھط®ط¯ط§ظ… ظ…ط¤ط´ط± طھط­ظ…ظٹظ„ ظ…ط±ط¦ظٹ ط£ظپط¶ظ„
    grid.innerHTML = Array.from({ length: 6 }, () => `
        <div class="skeleton-card">
            <div class="skeleton-img"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-price"></div>
            <div class="skeleton-actions">
                <div class="skeleton-btn"></div>
                <div class="skeleton-btn slim"></div>
            </div>
        </div>
    `).join('');

    renderCategoryBanner(categoryKey);
    setGuaranteeStripVisible(true);

    fetch(`/api/products/${categoryKey}?lang=${getCurrentLanguage()}`)
        .then(function(res) { return res.json(); })
        .then(function(data) { // ًں”¥ طھطµط­ظٹط­: ط§ظ„ظ…طھط؛ظٹط± ط§ظ„ط¢ظ† ظ‡ظˆ 'data' ط§ظ„ط°ظٹ ظٹط­طھظˆظٹ ط¹ظ„ظ‰ success ظˆ products
            if (!data.success || !data.products) {
                throw new Error(data.error || 'ظپط´ظ„ ظپظٹ ط¬ظ„ط¨ ط§ظ„ط¨ظٹط§ظ†ط§طھ');
            }

            _categoryProducts = data.products; // ط­ظپط¸ ط§ظ„ظ…ظ†طھط¬ط§طھ ظ„ظ„طھط±طھظٹط¨ ظˆط§ظ„ظپظ„طھط±ط©
            productCache.clear(); // طھظپط±ظٹط؛ ط§ظ„ظƒط§ط´ ظ‚ط¨ظ„ ظ…ظ„ط¦ظ‡ ظ…ظ† ط¬ط¯ظٹط¯
            renderCategoryProducts(grid);
        }).catch(err => console.error("Error fetching products:", err));
}

// ======================================================
//  ًںڈ·ï¸ڈ ط¨ط§ظ†ط± ط§ظ„ظ‚ط³ظ… ط§ظ„ط­ط§ظ„ظٹ
// ======================================================
function renderCategoryBanner(categoryKey) {
    const banner = document.getElementById('categoryBanner');
    if (!banner) return;
    const cat = rawServerData.categories[categoryKey];
    banner.hidden = false;

    const iconEl = banner.querySelector('.category-banner-icon i');
    const titleEl = banner.querySelector('.category-banner-title');
    const tagEl = banner.querySelector('.category-banner-tag');
    const metaEl = banner.querySelector('.category-banner-meta');
    const countEl = banner.querySelector('[data-banner-count]');

    if (titleEl) titleEl.textContent = cat ? cat.title : (categoryKey === 'all' ? t('all_products') : categoryKey);
    if (tagEl && cat && cat.desc) { tagEl.textContent = cat.desc; }
    else if (tagEl && !cat) { tagEl.textContent = t('category_banner_tag'); }
    // ظٹظڈظ…ظ„ط£ ط¨ط§ظ„ط¹ط¯ط¯ ط§ظ„ط­ظ‚ظٹظ‚ظٹ ظپظٹ renderCategoryProducts ط¨ط¹ط¯ ط§ظƒطھظ…ط§ظ„ ط§ظ„ط¬ظ„ط¨
    if (metaEl && countEl) countEl.textContent = '';
    if (iconEl) iconEl.className = (getCategoryTheme(categoryKey) || {}).icon || 'fas fa-gamepad';

    const accent = (getCategoryTheme(categoryKey) || {}).color || '#b8860b';
    banner.style.setProperty('--banner-accent', accent);
}

/**
 * طھظ‚ط¯ظٹظ… ظ…ظ†طھط¬ط§طھ ط§ظ„ظ‚ط³ظ… ط§ظ„ط­ط§ظ„ظٹ ظ…ط¹ طھط·ط¨ظٹظ‚ ط§ظ„طھط±طھظٹط¨ ظˆظپظ„طھط±ط© ط§ظ„طھظˆظپط± ظˆط§ظ„ظ…ظ†ط·ظ‚ط©.
 * @param {HTMLElement} [grid] - ط´ط¨ظƒط© ط§ظ„ط¹ط±ط¶ (ط§ظپطھط±ط§ط¶ظٹط§ظ‹ #mainCategories).
 */
function renderCategoryProducts(grid) {
    const targetGrid = grid || document.getElementById('mainCategories');
    if (!targetGrid) return;

    const lang = getCurrentLanguage();

    // 1) ظپط±ط² ط§ظ„ظ…ظ†طھط¬ط§طھ ط­ط³ط¨ ط§ظ„ط§ط®طھظٹط§ط±
    const sorted = [..._categoryProducts].sort((a, b) => {
        const pa = Number(a.price) || 0;
        const pb = Number(b.price) || 0;
        switch (_currentSort) {
            case 'price_asc': return pa - pb;
            case 'price_desc': return pb - pa;
            case 'rating': return (Number(b.rating) || 0) - (Number(a.rating) || 0);
            default: return Number(b.createdAt) - Number(a.createdAt); // ط§ظ„ط£ط­ط¯ط«
        }
    });

    // 2) ظپظ„طھط±ط© ط§ظ„طھظˆظپط± (ط§ظ„ظ…طھظˆظپط± ظپظ‚ط·)
    const availabilityCheck = document.getElementById('availabilityFilter');
    const inStockOnly = availabilityCheck ? availabilityCheck.checked : false;
    let visible = sorted;
    if (inStockOnly) {
        visible = sorted.filter(item => {
            // ط§ظ„ظ…ظ†طھط¬ط§طھ ط§ظ„ط®ط§ط±ط¬ظٹط© (API) طھط¹طھط¨ط± ظ…طھظˆظپط±ط© ظ…ط§ ظ„ظ… طھظڈط¹ظ„ظ… ط¨ط®ظ„ط§ظپ ط°ظ„ظƒ
            if (item.availableStock === null || item.availableStock === undefined) return true;
            return Number(item.availableStock) > 0;
        });
    }

    // 3) ظپظ„طھط±ط© ط§ظ„ظ…ظ†ط·ظ‚ط© ط§ظ„ط­ط§ظ„ظٹط©
    const activeRegion = document.querySelector('#regionFilterBar .filter-btn.active');
    const currentRegion = activeRegion ? activeRegion.dataset.target : 'all';

    // ط¹ط¯ط¯ ط§ظ„ط¨ط·ط§ظ‚ط§طھ ط§ظ„ط¸ط§ظ‡ط±ط© ظپط¹ظ„ظٹط§ظ‹ (ط¨ط¹ط¯ ظپظ„طھط±ط© ط§ظ„ظ…ظ†ط·ظ‚ط©) ظ„ط¹ط±ط¶ظ‡ ظپظٹ ط¨ط§ظ†ط± ط§ظ„ظ‚ط³ظ…
    const displayedCount = visible.filter(item =>
        currentRegion === 'all' || detectRegion(item) === currentRegion
    ).length;

    const bannerCountEl = document.querySelector('#categoryBanner [data-banner-count]');
    if (bannerCountEl) {
        bannerCountEl.textContent = t('banner_item_count').replace('{count}', String(displayedCount));
    }

    targetGrid.innerHTML = '';
    const template = document.getElementById('product-card-template');

    if (visible.length === 0) {
        const emptyTitle = inStockOnly
            ? (lang === 'en' ? 'No items are currently in stock.' : 'ظ„ط§ طھظˆط¬ط¯ ط¹ظ†ط§طµط± ظ…طھظˆظپط±ط© ط­ط§ظ„ظٹط§ظ‹.')
            : (lang === 'en' ? 'No cards are available in this category yet.' : 'ظ„ط§ طھظˆط¬ط¯ ط¨ط·ط§ظ‚ط§طھ ظ…طھط§ط­ط© ظپظٹ ظ‡ط°ط§ ط§ظ„ظ‚ط³ظ… ط­ط§ظ„ظٹط§ظ‹.');
        targetGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>${emptyTitle}</h3>
                <p>${lang === 'en' ? 'Please check back soon or try another option.' : 'طھظپط¶ظ„ ط¨ط§ظ„ط¹ظˆط¯ط© ظ„ط§ط­ظ‚ط§ظ‹ ط£ظˆ ط¬ط±ظ‘ط¨ ط®ظٹط§ط±ط§ظ‹ ط¢ط®ط±.'}</p>
            </div>
        `;
        return;
    }

    visible.forEach(function(item, idx) {
        const detectedRegion = detectRegion(item);
        if (currentRegion !== 'all' && detectedRegion !== currentRegion) return;
        const regionInfo = getRegionDetails(detectedRegion);
        const localizedName = item.productName[lang] || item.productName['ar'];
        const clientItem = formatItem({ ...item, name: localizedName }, _currentCategoryKey, detectedRegion);

        productCache.set(clientItem.id, clientItem); // ط¥ط¶ط§ظپط© ط§ظ„ظ…ظ†طھط¬ ظ„ظ„ظƒط§ط´

        const card = template.content.cloneNode(true);
        const cardElement = card.querySelector('.product-item-card');
        cardElement.dataset.productId = clientItem.id;
        cardElement.dataset.region = detectedRegion;
        cardElement.style.setProperty('--i', String(idx));
        card.querySelector('.card-flag-badge').innerHTML = regionInfo.isIcon ? '<i class="fas fa-globe"></i>' : `<img src="${regionInfo.flagUrl}" />`;
        const imgElement = card.querySelector('.card-inner-img');
        imgElement.src = clientItem.image;
        imgElement.onerror = () => { imgElement.src = '/image/logo.png'; }; // Fallback image
        bindCardImageState(imgElement);
        card.querySelector('.card-inner-img').alt = clientItem.name;
        const quickAdd = card.querySelector('[data-quick-add]');
        if (quickAdd) quickAdd.dataset.productId = clientItem.id;
        card.querySelector('.card-title').textContent = clientItem.name;
        card.querySelector('.card-price').textContent = formatPrice(clientItem.price);
        card.querySelector('[data-wishlist-btn]').dataset.productId = clientItem.id;
        card.querySelector('[data-rating]').innerHTML = renderRatingStars(clientItem.rating, clientItem.reviewsCount);
        const stockBadge = card.querySelector('[data-stock-badge]');
        if (stockBadge) {
            const stockText = renderStockBadge(clientItem.availableStock);
            stockBadge.textContent = stockText;
            stockBadge.classList.toggle('out-of-stock', Number(clientItem.availableStock) <= 0);
        }
        // ط´ط§ط±ط© ط§ظ„ط£ظƒط«ط± ظ…ط¨ظٹط¹ط§ظ‹ ظپظٹ ط¹ط±ط¶ ط§ظ„ظ‚ط³ظ… (ظƒظ„ط§ط³ظٹظƒظٹط©طŒ ظ„ط§ طھظڈط·ط¨ظ‘ظ‚ ط¹ظ„ظ‰ ظƒظ„ ط§ظ„ط¨ط·ط§ظ‚ط§طھ)
        const badge = card.querySelector('.product-badge');
        if (badge) {
            applyProductBadge(badge, { productId: clientItem.id });
        }
        targetGrid.appendChild(card);
    });
}

export const currentCategoryKey = () => _currentCategoryKey;

// ======================================================
//  ط¯ط§ظ„ط© ظ„طھظ‚ط¯ظٹظ… ط£ط²ط±ط§ط± ظپظ„طھط±ط© ط§ظ„ط£ظ‚ط³ط§ظ… ط¯ظٹظ†ط§ظ…ظٹظƒظٹط§ظ‹
// ======================================================
function renderCategoryFilterButtons() {
    const filterTabsContainer = document.getElementById('filterTabs');
    if (!filterTabsContainer) return;

    filterTabsContainer.innerHTML = ''; // طھظپط±ظٹط؛ ط§ظ„ط£ط²ط±ط§ط± ط§ظ„ظ‚ط¯ظٹظ…ط©

    // ط²ط± "ط§ظ„ظƒظ„" ط§ظ„ط§ظپطھط±ط§ط¶ظٹ
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn active';
    allBtn.dataset.filter = 'all';
    allBtn.textContent = t('filter_all');
    filterTabsContainer.appendChild(allBtn);

    // ط¥ط¶ط§ظپط© ط£ط²ط±ط§ط± ط§ظ„ط£ظ‚ط³ط§ظ… ظ…ظ† ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط³طھط±ط¬ط¹ط©
    for (const key in rawServerData.categories) {
        const category = rawServerData.categories[key];
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.filter = key;
        btn.textContent = category.title; // ط§ط³طھط®ط¯ط§ظ… ط§ظ„ط§ط³ظ… ط§ظ„ظ…طھط±ط¬ظ…
        filterTabsContainer.appendChild(btn);
    }
}

// ======================================================
//  ط¯ط§ظ„ط© ظ„طھظ‚ط¯ظٹظ… ط£ط²ط±ط§ط± ظپظ„طھط±ط© ط§ظ„ظ…ظ†ط§ط·ظ‚ ط¯ظٹظ†ط§ظ…ظٹظƒظٹط§ظ‹
// ======================================================
function renderRegionFilterButtons() {
    const regionFilterBar = document.getElementById('regionFilterBar');
    if (!regionFilterBar) return;

    regionFilterBar.innerHTML = ''; // طھظپط±ظٹط؛ ط§ظ„ط£ط²ط±ط§ط± ط§ظ„ظ‚ط¯ظٹظ…ط©

    const regions = [
        { key: 'all', text: t('filter_all'), icon: null },
        { key: 'global', text: t('filter_global'), icon: 'ًںŒگ' },
        { key: 'tr', text: t('filter_tr'), flag: 'tr.png' },
        { key: 'ae', text: t('filter_ae'), flag: 'ae.png' },
        { key: 'sa', text: t('filter_sa'), flag: 'sa.png' },
        { key: 'vn', text: t('filter_vn'), flag: 'vn.png' },
        { key: 'cn', text: t('filter_cn'), flag: 'cn.png' },
        { key: 'us', text: t('filter_us'), flag: 'us.png' }
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

    // طھظپط¹ظٹظ„ ط²ط± "ط§ظ„ظƒظ„" ط§ظپطھط±ط§ط¶ظٹط§ظ‹
    const allBtn = regionFilterBar.querySelector('[data-target="all"]');
    if (allBtn) allBtn.classList.add('active');
}

// ======================================================
//  ط¯ط§ظ„ط© ظ…ط³ط§ط¹ط¯ط© ظ„طھظ‚ط¯ظٹظ… ط§ظ„ظ…ظ†طھط¬ط§طھ (طھط¬ظ†ط¨ ط§ظ„طھظƒط±ط§ط±)
// ======================================================
function renderSkeletonCards(container, count = 6) {
    const grid = container.querySelector('.products-grid');
    if (!grid) return;
    grid.innerHTML = Array.from({ length: count }, () => `
        <div class="skeleton-card">
            <div class="skeleton-img"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-price"></div>
            <div class="skeleton-actions">
                <div class="skeleton-btn"></div>
                <div class="skeleton-btn slim"></div>
            </div>
        </div>
    `).join('');
}

function renderEmptyState(container, opts = {}) {
    const grid = container.querySelector('.products-grid') || container;
    const icon = opts.icon || 'fas fa-box-open';
    const title = opts.title || 'ظ„ط§ طھظˆط¬ط¯ ط¨ط·ط§ظ‚ط§طھ ظ…طھط§ط­ط© ط­ط§ظ„ظٹط§ظ‹.';
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

    grid.innerHTML = ''; // طھظپط±ظٹط؛ ط§ظ„ظ…ط­طھظˆظ‰
    const template = document.getElementById('product-card-template');
    const lang = getCurrentLanguage();

    if (products.length === 0) {
        renderEmptyState(container, {
            icon: 'fas fa-box-open',
            title: lang === 'en' ? 'No cards are currently available.' : 'ظ„ط§ طھظˆط¬ط¯ ط¨ط·ط§ظ‚ط§طھ ظ…طھط§ط­ط© ط­ط§ظ„ظٹط§ظ‹.',
            sub: lang === 'en' ? 'Please check back soon or try another category.' : 'طھظپط¶ظ„ ط¨ط§ظ„ط¹ظˆط¯ط© ظ„ط§ط­ظ‚ط§ظ‹ ط£ظˆ ط¬ط±ظ‘ط¨ ظ‚ط³ظ…ط§ظ‹ ط¢ط®ط±.'
        });
        return;
    }

    products.forEach((item, idx) => {
        // ط¨ظ…ط§ ط£ظ† ط§ط³ظ… ط§ظ„ظ…ظ†طھط¬ ظٹط£طھظٹ ظƒظƒط§ط¦ظ† (ar, en)طŒ ظ†ط®طھط§ط± ط§ظ„ظ„ط؛ط© ط§ظ„طµط­ظٹط­ط©
        const localizedName = item.productName[lang] || item.productName['ar'];
        const detectedRegion = detectRegion(item);
        const regionInfo = getRegionDetails(detectedRegion);
        const clientItem = formatItem({ ...item, name: localizedName }, item.category, detectedRegion);

        productCache.set(clientItem.id, clientItem); // ط¥ط¶ط§ظپط© ط§ظ„ظ…ظ†طھط¬ ظ„ظ„ظƒط§ط´ ظ„ظ„ظˆطµظˆظ„ ط§ظ„ط³ط±ظٹط¹

        const card = template.content.cloneNode(true);
        const cardElement = card.querySelector('.product-item-card');
        cardElement.dataset.productId = clientItem.id;
        cardElement.dataset.region = detectedRegion;
        cardElement.style.setProperty('--i', String(idx));
        card.querySelector('.card-flag-badge').innerHTML = regionInfo.isIcon ? '<i class="fas fa-globe"></i>' : `<img src="${regionInfo.flagUrl}" />`;
        const imgElement = card.querySelector('.card-inner-img');
        imgElement.src = clientItem.image;
        imgElement.onerror = () => { imgElement.src = '/image/logo.png'; }; // Fallback image
        bindCardImageState(imgElement);
        card.querySelector('.card-inner-img').alt = clientItem.name;
        const quickAdd = card.querySelector('[data-quick-add]');
        if (quickAdd) quickAdd.dataset.productId = clientItem.id;
        card.querySelector('.card-title').textContent = clientItem.name;
        card.querySelector('.card-price').textContent = formatPrice(clientItem.price);
        card.querySelector('[data-wishlist-btn]').dataset.productId = clientItem.id;
        card.querySelector('[data-rating]').innerHTML = renderRatingStars(clientItem.rating, clientItem.reviewsCount);
        const stockBadge = card.querySelector('[data-stock-badge]');
        if (stockBadge) {
            const stockText = renderStockBadge(clientItem.availableStock);
            stockBadge.textContent = stockText;
            stockBadge.classList.toggle('out-of-stock', Number(clientItem.availableStock) <= 0);
        }
        const badge = card.querySelector('.product-badge');
        if (badge) {
            const isNew = containerId === 'newly-added-container';
            applyProductBadge(badge, { productId: clientItem.id, isNew });
        }
        grid.appendChild(card);
    });
    setupReveal(grid);
}

// ======================================================
//  ط§ظ„ط¹ظˆط¯ط© ظ„ظ„ط±ط¦ظٹط³ظٹط©
// ======================================================
function goBack() {
    // ط­ط°ظپ ط§ظ„ظ‚ط³ظ… ط§ظ„ظ…ط­ظپظˆط¸ ط¹ظ†ط¯ ط§ظ„ط¹ظˆط¯ط© ظ„ظ„طµظپط­ط© ط§ظ„ط±ط¦ظٹط³ظٹط©
    localStorage.removeItem('joker_lastCategory');

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    showAllCategories();
    // ط§ظ„ط¹ظˆط¯ط© ظ„ط£ط¹ظ„ظ‰ ط§ظ„طµظپط­ط© ط¨ط¹ط¯ ط¥ط¸ظ‡ط§ط± ط§ظ„ط±ط¦ظٹط³ظٹط©
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

/**
 * ط¬ظ„ط¨ ظˆط¹ط±ط¶ ظ‚ط³ظ… "ط§ظ„ط£ظƒط«ط± ظ…ط¨ظٹط¹ط§ظ‹" ظپظٹ ط§ظ„طµظپط­ط© ط§ظ„ط±ط¦ظٹط³ظٹط©.
 */
async function renderBestSellingProducts() {
    const container = document.getElementById('best-selling-container');
    if (!container) return;

    renderSkeletonCards(container, 4);
    try {
        const res = await fetch(`/api/products/best-selling?lang=${getCurrentLanguage()}`);
        const data = await res.json();
        if (data.success) {
            // ظ…ظ„ط، ظ…ط¬ظ…ظˆط¹ط© ظ…ط¹ط±ظ‘ظپط§طھ ط§ظ„ط£ظƒط«ط± ظ…ط¨ظٹط¹ط§ظ‹ ط­طھظ‰ طھط­ط§ظپط¸ ط§ظ„ط¨ط·ط§ظ‚ط§طھ ط¹ظ„ظ‰ ط´ط§ط±طھظ‡ط§ ظپظٹ ظƒظ„ ط§ظ„ط£ظ‚ط³ط§ظ…
            bestSellerIds.clear();
            (Array.isArray(data.products) ? data.products : []).forEach(p => {
                const pid = String(p._id || p.id || '');
                if (pid) bestSellerIds.add(pid);
            });
            renderProductCards(data.products, 'best-selling-container');
        } else {
            renderEmptyState(container, {
                icon: 'fas fa-fire',
                title: getCurrentLanguage() === 'en' ? 'No best sellers yet.' : 'ظ„ط§ طھظˆط¬ط¯ ظ…ظ†طھط¬ط§طھ ط§ظ„ط£ظƒط«ط± ظ…ط¨ظٹط¹ط§ظ‹ ط¨ط¹ط¯.',
                sub: getCurrentLanguage() === 'en' ? 'Products appear here once orders take place.' : 'طھط¸ظ‡ط± ط§ظ„ظ…ظ†طھط¬ط§طھ ظ‡ظ†ط§ ط¨ط¹ط¯ ط¥طھظ…ط§ظ… ط£ظˆظ„ظ‰ ط§ظ„ط·ظ„ط¨ط§طھ.'
            });
        }
    } catch (error) {
        console.error("Failed to render best-selling products:", error);
        renderEmptyState(container, {
            icon: 'fas fa-fire',
            title: getCurrentLanguage() === 'en' ? 'No best sellers yet.' : 'ظ„ط§ طھظˆط¬ط¯ ظ…ظ†طھط¬ط§طھ ط§ظ„ط£ظƒط«ط± ظ…ط¨ظٹط¹ط§ظ‹ ط¨ط¹ط¯.',
            sub: getCurrentLanguage() === 'en' ? 'Products appear here once orders take place.' : 'طھط¸ظ‡ط± ط§ظ„ظ…ظ†طھط¬ط§طھ ظ‡ظ†ط§ ط¨ط¹ط¯ ط¥طھظ…ط§ظ… ط£ظˆظ„ظ‰ ط§ظ„ط·ظ„ط¨ط§طھ.'
        });
    }
}

/**
 * ط¬ظ„ط¨ ظˆط¹ط±ط¶ ظ‚ط³ظ… "ط£ط¶ظٹظپ ط­ط¯ظٹط«ط§ظ‹" ظپظٹ ط§ظ„طµظپط­ط© ط§ظ„ط±ط¦ظٹط³ظٹط©.
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
                title: getCurrentLanguage() === 'en' ? 'No new products yet.' : 'ظ„ط§ طھظˆط¬ط¯ ظ…ظ†طھط¬ط§طھ ط¬ط¯ظٹط¯ط© ط¨ط¹ط¯.',
                sub: getCurrentLanguage() === 'en' ? 'New products will appear here.' : 'ط³طھط¸ظ‡ط± ط§ظ„ظ…ظ†طھط¬ط§طھ ط§ظ„ط¬ط¯ظٹط¯ط© ظ‡ظ†ط§.'
            });
        }
    } catch (error) {
        console.error("Failed to render newly added products:", error);
        renderEmptyState(container, {
            icon: 'fas fa-sparkles',
            title: getCurrentLanguage() === 'en' ? 'No new products yet.' : 'ظ„ط§ طھظˆط¬ط¯ ظ…ظ†طھط¬ط§طھ ط¬ط¯ظٹط¯ط© ط¨ط¹ط¯.',
            sub: getCurrentLanguage() === 'en' ? 'New products will appear here.' : 'ط³طھط¸ظ‡ط± ط§ظ„ظ…ظ†طھط¬ط§طھ ط§ظ„ط¬ط¯ظٹط¯ط© ظ‡ظ†ط§.'
        });
    }
}

// ======================================================
//  ًںژپ ظ‚ط³ظ… "ط¹ط±ظˆط¶ ط¬ط§ظ‡ط²ط© ط§ظ„ط´ط­ظ†" â€” ط¨ظٹط§ظ†ط§طھ ط­ظ‚ظٹظ‚ظٹط© ظ…ظ† /api/promotions
// ======================================================
const _promoProducts = new Map(); // ظ…ط¹ط±ظ‘ظپ ط§ظ„ظ…ظ†طھط¬ â†گ clientItem (ظ„ظپطھط­ ط§ظ„طھظپط§طµظٹظ„)

async function renderPromotions() {
    const section = document.getElementById('promoSection');
    const container = document.getElementById('promoContainer');
    if (!section || !container) return;

    try {
        const res = await fetch('/api/promotions');
        const data = await res.json();
        const promos = data?.success && Array.isArray(data.promotions) ? data.promotions : [];

        if (promos.length === 0) {
            section.hidden = true;
            container.innerHTML = '';
            _promoProducts.clear();
            return;
        }

        const lang = getCurrentLanguage();
        section.hidden = false;
        _promoProducts.clear();
        // طھط¹ط¨ط¦ط© ط®ط±ظٹط·ط© ط§ظ„ط®طµظˆظ…ط§طھ ظ„ط´ط§ط±ط© ط§ظ„ظ…ظ†طھط¬
        {
            const map = new Map();
            promos.forEach(p => {
                const pct = Number(p.discountPercent) || 0;
                if (p.productId) map.set(String(p.productId), pct);
                else if (p.products) p.products.forEach(pr => { if (pr._id) map.set(String(pr._id), pct); });
            });
            setPromoDiscounts(map);
        }

        container.innerHTML = promos.map((promo, index) => {
            const title = promo.title?.[lang] || promo.title?.ar || '';
            const description = promo.description ? (promo.description[lang] || promo.description.ar || '') : '';
            const products = Array.isArray(promo.products) ? promo.products.slice(0, 3) : [];

            const chips = products.map(product => {
                const localizedName = product.productName?.[lang] || product.productName?.ar || '';
                const thumb = resolveImageUrl(product.image) || '/image/logo.png';
                const chipPrice = Number(product.salePrice ?? product.price) || 0;
                const fullPrice = Number(product.price) || 0;
                const detectedRegion = detectRegion(product);
                const clientItem = formatItem({ ...product, name: localizedName },
                    promo.target?.type === 'category' ? promo.target.key : (product.category || ''), detectedRegion);
                _promoProducts.set(clientItem.id, clientItem);
                return `
                    <button type="button" class="promo-product-chip" data-promo-product="${escapeHtml(clientItem.id)}">
                        <img src="${escapeHtml(thumb)}" alt="${escapeHtml(localizedName)}" width="56" height="56" loading="lazy" decoding="async">
                        <span class="promo-chip-info">
                            <span class="promo-chip-name">${escapeHtml(localizedName)}</span>
                            <span class="promo-chip-prices">
                                <span class="promo-chip-price">${formatPrice(chipPrice)}</span>
                                ${fullPrice > chipPrice ? `<s class="promo-chip-old">${formatPrice(fullPrice)}</s>` : ''}
                            </span>
                        </span>
                    </button>`;
            }).join('');

            const categoryKey = promo.target?.type === 'category' ? promo.target.key : null;
            const browseBtn = categoryKey
                ? `<button type="button" class="promo-browse-btn" data-promo-category="${escapeHtml(categoryKey)}">${escapeHtml(t('promo_browse_category'))}</button>`
                : '';

            const expiresAt = promo.expiresAt ? new Date(promo.expiresAt) : null;
            const expiryHtml = expiresAt && !Number.isNaN(expiresAt.getTime())
                ? `<span class="promo-expires">${t('promo_expires').replace('{date}', expiresAt.toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>`
                : '';

            return `
                <article class="promo-card" style="animation-delay:${index * 70}ms">
                    <div class="promo-card-head">
                        <span class="promo-discount-badge">${escapeHtml(t('promo_discount').replace('{percent}', String(promo.discountPercent ?? 0)))}</span>
                        ${expiryHtml}
                    </div>
                    <h3 class="promo-card-title">${escapeHtml(title)}</h3>
                    ${description ? `<p class="promo-card-desc">${escapeHtml(description)}</p>` : ''}
                    <div class="promo-product-chips">${chips || `<span class="promo-empty-chips">${escapeHtml(t('promo_sale'))}</span>`}</div>
                    ${browseBtn}
                </article>`;
        }).join('');
    } catch (_err) {
        section.hidden = true;
    }
}

// طھظپط§ط¹ظ„ط§طھ ظ‚ط³ظ… ط§ظ„ط¹ط±ظˆط¶ (ظپطھط­ طھظپط§طµظٹظ„ ظ…ظ†طھط¬ + طھطµظپط­ ط§ظ„ظ‚ط³ظ…)
function initPromoSectionInteractions() {
    const container = document.getElementById('promoContainer');
    if (!container) return;

    container.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-promo-product]');
        if (chip) {
            const item = _promoProducts.get(chip.dataset.promoProduct);
            if (item) showProductDetails(item, item.category || 'all');
            return;
        }
        const browse = e.target.closest('[data-promo-category]');
        if (browse) {
            const key = browse.dataset.promoCategory;
            if (key) selectCategory(key);
        }
    });
}

// ط­ظ‚ظ„ ظƒظˆط¯ ط§ظ„ط®طµظ… ظپظٹ ظ†ط§ظپط°ط© ط§ظ„ط³ظ„ط© (طھط·ط¨ظٹظ‚/ط¥ط²ط§ظ„ط© + طھط؛ط°ظٹط© ط±ط§ط¬ط¹ط© ظپظˆط±ظٹط©)
function initPromoInput() {
    const input = document.getElementById('promoCodeInput');
    const applyBtn = document.getElementById('applyPromoBtn');
    const removeBtn = document.getElementById('removePromoBtn');
    const feedback = document.getElementById('promoFeedback');
    if (!input || !applyBtn || !feedback) return;

    const showState = (state, message) => {
        feedback.hidden = false;
        feedback.dataset.state = state;
        feedback.textContent = message;
        if (removeBtn) removeBtn.hidden = state !== 'applied';
    };

    const existing = getAppliedPromo();
    if (existing) {
        input.value = existing.code;
        showState('applied', t('promo_applied').replace('{code}', existing.code.toUpperCase()));
    } else if (removeBtn) {
        removeBtn.hidden = true;
    }

    const apply = async () => {
        const code = input.value.trim();
        if (!code) {
            showState('error', t('promo_invalid'));
            return;
        }
        if (cart.length === 0) {
            showState('error', t('promo_not_applicable'));
            return;
        }
        applyBtn.disabled = true;
        try {
            // ظ†ط±ط³ظ„ ظƒظ„ ظ…ظ†طھط¬ط§طھ ط§ظ„ط³ظ„ط© â€” ط§ظ„ط®ط§ط¯ظ… ظٹط±ظپط¶ ط§ظ„ظƒظˆط¯ ط¥ظ† ظ„ظ… ظٹظ†ط·ط¨ظ‚ ط¹ظ„ظ‰ ط¬ظ…ظٹط¹ظ‡ط§
            const res = await fetch('/api/promotions/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, productIds: cart.map(item => item.id) })
            });
            const data = await res.json();
            if (data && data.ok) {
                setAppliedPromo({
                    code,
                    label: t('promo_applied').replace('{code}', code.toUpperCase()),
                    percent: data.discountPercent,
                    anchorProductId: String(cart[0]?.id || '')
                });
                showState('applied', t('promo_applied').replace('{code}', code.toUpperCase()));
            } else {
                clearAppliedPromo();
                const message = data?.code === 'not_applicable' ? t('promo_not_applicable') : t('promo_invalid');
                showState('error', message);
            }
            updateCartUI();
        } catch (_err) {
            clearAppliedPromo();
            showState('error', t('promo_invalid'));
            updateCartUI();
        } finally {
            applyBtn.disabled = false;
        }
    };

    applyBtn.addEventListener('click', apply);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            apply();
        }
    });
    input.addEventListener('input', () => { feedback.hidden = true; });
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            clearAppliedPromo();
            input.value = '';
            feedback.hidden = true;
            removeBtn.hidden = true;
            updateCartUI();
        });
    }
}

// ======================================================
//  ًں’¬ ظ‚ط³ظ… "ظ‚ط§ظ„ظˆط§ ط¹ظ†ط§" â€” ط³ظ„ط§ظٹط¯ط± ط§ظ„طھظ‚ظٹظٹظ…ط§طھ (ط¨ظٹط§ظ†ط§طھ ط­ظ‚ظٹظ‚ظٹط©)
// ======================================================
let _testimonialsCards = [];
let _testimonialsIndex = 0;
let _testimonialsTimer = null;

function _getTestimonialsPerView() {
    const slider = document.getElementById('testimonialsSlider');
    if (!slider) return 3;
    const raw = window.getComputedStyle(slider).getPropertyValue('--per-view').trim();
    const perView = Number(raw);
    return perView >= 1 ? perView : 3;
}

function _getTestimonialsMaxIndex(cards) {
    const perView = _getTestimonialsPerView();
    return Math.max(0, (cards || _testimonialsCards).length - perView);
}

function _updateTestimonialsTransform() {
    const track = document.getElementById('testimonialsTrack');
    const slider = document.getElementById('testimonialsSlider');
    if (!track || !slider) return;
    const cards = _testimonialsCards.length ? _testimonialsCards : Array.from(track.children);
    const [firstCard] = cards;
    if (!firstCard) return;
    const perView = _getTestimonialsPerView();
    const maxIndex = Math.max(0, cards.length - perView);
    if (_testimonialsIndex > maxIndex) _testimonialsIndex = maxIndex;
    const step = firstCard.getBoundingClientRect().width || firstCard.offsetWidth;
    const direction = document.documentElement.dir === 'rtl' ? 1 : -1;
    track.style.transform = `translateX(${direction * _testimonialsIndex * step}px)`;
    slider.classList.toggle('single-page', maxIndex === 0);
}

function _stopTestimonialsAuto() {
    if (_testimonialsTimer) {
        clearInterval(_testimonialsTimer);
        _testimonialsTimer = null;
    }
}

function _restartTestimonialsAuto() {
    const slider = document.getElementById('testimonialsSlider');
    if (slider && slider.matches(':hover')) return; // ط¥ظٹظ‚ط§ظپ ظ…ط¤ظ‚طھ ط£ط«ظ†ط§ط، ظ…ط±ظˆط± ط§ظ„ظ…ط§ظˆط³
    _stopTestimonialsAuto();
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    _testimonialsTimer = setInterval(() => {
        _testimonialsIndex = (_testimonialsIndex + 1) % (_getTestimonialsMaxIndex() + 1);
        _updateTestimonialsTransform();
    }, 6000);
}

function _bindTestimonialsControls() {
    const slider = document.getElementById('testimonialsSlider');
    if (!slider || slider.dataset.bound === 'true') return;
    slider.dataset.bound = 'true';

    const prevBtn = document.getElementById('testimonialsPrevBtn');
    const nextBtn = document.getElementById('testimonialsNextBtn');
    const maxIndex = () => _getTestimonialsMaxIndex();

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            _testimonialsIndex = (_testimonialsIndex - 1 + maxIndex() + 1) % (maxIndex() + 1);
            _updateTestimonialsTransform();
            _restartTestimonialsAuto();
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            _testimonialsIndex = (_testimonialsIndex + 1) % (maxIndex() + 1);
            _updateTestimonialsTransform();
            _restartTestimonialsAuto();
        });
    }

    // ط¥ظٹظ‚ط§ظپ ط§ظ„طھط´ط؛ظٹظ„ ط§ظ„طھظ„ظ‚ط§ط¦ظٹ ط¹ظ†ط¯ ط§ظ„طھظ…ط±ظٹط±/ط§ظ„طھط±ظƒظٹط² ظˆط§ط³طھط¦ظ†ط§ظپظ‡ ط¹ظ†ط¯ ط§ظ„ظ…ط؛ط§ط¯ط±ط©
    slider.addEventListener('mouseenter', _stopTestimonialsAuto);
    slider.addEventListener('mouseleave', _restartTestimonialsAuto);
    slider.addEventListener('focusin', _stopTestimonialsAuto);
    slider.addEventListener('focusout', _restartTestimonialsAuto);

    // ط¥ط¹ط§ط¯ط© ط­ط³ط§ط¨ ط­ط¬ظ… ط§ظ„طµظپط­ط© ط¹ظ†ط¯ طھط؛ظٹظٹط± ط¹ط±ط¶ ط§ظ„ظ†ط§ظپط°ط©
    let resizeRaf = null;
    window.addEventListener('resize', () => {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = null;
            _updateTestimonialsTransform();
        });
    });

    // ط¹ظ†ط¯ ط¹ظˆط¯ط© ط§ظ„ظ‚ط³ظ… ط¥ظ„ظ‰ ط§ظ„ط´ط§ط´ط© (ظ…ط«ظ„ط§ظ‹ ط¨ط¹ط¯ طھطµظپط­ ظ‚ط³ظ…) ظ†ط¹ظٹط¯ ط¶ط¨ط· ط§ظ„ظ…ظˆط¶ط¹
    if (window.IntersectionObserver) {
        const visibilityObserver = new window.IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) _updateTestimonialsTransform();
            });
        });
        visibilityObserver.observe(slider);
    }
}

/**
 * طھط§ط±ظٹط® ظ†ط³ط¨ظٹ ظ‚طµظٹط± ظ…ط­ظ„ظٹ ("ظ…ظ†ط° X"/"X ago") ط¹ط¨ط± Intl.RelativeTimeFormat.
 */
function formatTestimonialDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const locale = getCurrentLanguage() === 'en' ? 'en' : 'ar';

    if (window.Intl && window.Intl.RelativeTimeFormat) {
        const formatter = new window.Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
        const diffSec = (date.getTime() - Date.now()) / 1000;
        const absSec = Math.abs(diffSec);
        if (absSec < 60) return formatter.format(Math.round(diffSec / 1), 'second');
        if (absSec < 3600) return formatter.format(Math.round(diffSec / 60), 'minute');
        if (absSec < 86400) return formatter.format(Math.round(diffSec / 3600), 'hour');
        if (absSec < 2592000) return formatter.format(Math.round(diffSec / 86400), 'day');
        if (absSec < 31536000) return formatter.format(Math.round(diffSec / 2592000), 'month');
        return formatter.format(Math.round(diffSec / 31536000), 'year');
    }

    // ط§ط­طھظٹط§ط·ظٹ: طھط§ط±ظٹط® ظ‚طµظٹط± ظپظ‚ط·
    return date.toLocaleDateString(locale === 'en' ? 'en-GB' : 'ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * ط¬ظ„ط¨ ظˆط¹ط±ط¶ طھظ‚ظٹظٹظ…ط§طھ ط§ظ„ط¹ظ…ظ„ط§ط، ظپظٹ ط§ظ„ظ‚ط³ظ… ط§ظ„ط±ط¦ظٹط³ظٹ.
 * ط¥ط°ط§ ظ„ظ… طھظˆط¬ط¯ طھظ‚ظٹظٹظ…ط§طھ ظٹظڈط®ظپظ‰ ط§ظ„ظ‚ط³ظ… ظƒط§ظ…ظ„ط§ظ‹ (ظ„ط§ ظ…ظƒط§ظ† ظپط§ط±ط؛).
 */
async function renderTestimonials() {
    const section = document.getElementById('testimonialsSection');
    const track = document.getElementById('testimonialsTrack');
    if (!section || !track) return;

    section.hidden = true;
    _stopTestimonialsAuto();

    try {
        const res = await fetch('/api/testimonials');
        const data = await res.json();
        if (!data.success || !Array.isArray(data.testimonials) || data.testimonials.length === 0) return;

        const lang = getCurrentLanguage();
        track.innerHTML = data.testimonials.map(item => {
            const productName = String((item.productName || {})[lang] || (item.productName || {}).ar || '');
            const comment = item.comment ? item.comment.trim() : '';
            const commentHtml = comment
                ? escapeHtml(comment)
                : `<span class="testimonial-anonymous">${escapeHtml(t('testimonial_anonymous'))}</span>`;
            return `
                <div class="testimonial-card">
                    <div class="testimonial-card-inner">
                        <div class="testimonial-stars">${renderRatingStars(item.rating, 0)}</div>
                        <p class="testimonial-text">${commentHtml}</p>
                        <div class="testimonial-footer">
                            <span class="testimonial-product"><i class="fas fa-tag"></i> ${escapeHtml(productName)}</span>
                            <span class="testimonial-verified"><i class="fas fa-check-circle"></i> ${escapeHtml(t('testimonial_verified'))}</span>
                            <span class="testimonial-date">${escapeHtml(formatTestimonialDate(item.createdAt))}</span>
                        </div>
                    </div>
                </div>`;
        }).join('');

        _testimonialsCards = Array.from(track.querySelectorAll('.testimonial-card'));
        _testimonialsIndex = 0;
        _bindTestimonialsControls();
        _updateTestimonialsTransform();
        _restartTestimonialsAuto();
        section.hidden = false;
    } catch (_e) {
        // ظپط´ظ„ ط§ظ„ط¬ظ„ط¨ â†’ ظٹظڈط¨ظ‚ظ‰ ط§ظ„ظ‚ط³ظ… ظ…ط®ظپظٹط§ظ‹ (ظ„ط§ ظ†ط¹ط±ط¶ ط£ظٹ ظ…ط­طھظˆظ‰ ظˆظ‡ظ…ظٹ)
    }
}

/**
 * ظٹط¹ط§ظ„ط¬ ط­ط¯ط« طھط؛ظٹظٹط± ط§ظ„ظ„ط؛ط©طŒ ظˆظٹظ‚ظˆظ… ط¨ط¬ظ„ط¨ ط¨ظٹط§ظ†ط§طھ ط§ظ„ط£ظ‚ط³ط§ظ… ظˆط§ظ„ظ…ظ†طھط¬ط§طھ ظˆط¹ط±ط¶ظ‡ط§ ط¨ط§ظ„ظ„ط؛ط© ط§ظ„ط¬ط¯ظٹط¯ط©.
 */
async function handleLanguageChange(event) {
    try {
        const lang = event.detail.lang || getCurrentLanguage(); // ط§ظ„ط£ظˆظ„ظˆظٹط© ظ„ظ„ط؛ط© ط§ظ„ظ…ظ…ط±ط±ط© ظپظٹ ط§ظ„ط­ط¯ط«
        const res = await fetch(`/api/categories?lang=${lang}`);
        const data = await res.json();
        if (data.success) {
            rawServerData.categories = data.categories;
            renderCategoryFilterButtons(); // ط¥ط¹ط§ط¯ط© ط¹ط±ط¶ ط£ط²ط±ط§ط± ط§ظ„ط£ظ‚ط³ط§ظ…
            renderRegionFilterButtons();   // ط¥ط¹ط§ط¯ط© ط¹ط±ط¶ ط£ط²ط±ط§ط± ط§ظ„ظ…ظ†ط§ط·ظ‚

            // طھط­ط¯ظٹط« ظƒظ„ ط§ظ„ظ…ظ‚ط§ط·ط¹ ط§ظ„ط¯ظٹظ†ط§ظ…ظٹظƒظٹط© ظ„ظ„ط؛ط© ط§ظ„ط¬ط¯ظٹط¯ط©
            productCache.clear();          // طھظپط±ظٹط؛ ط§ظ„ظƒط§ط´ ط­طھظ‰ طھظڈط¹ط±ط¶ ط§ظ„طھظپط§طµظٹظ„ ط¨ط§ظ„ظ„ط؛ط© ط§ظ„ط¬ط¯ظٹط¯ط©
            renderBestSellingProducts();   // ط¥ط¹ط§ط¯ط© ط¹ط±ط¶ "ط§ظ„ط£ظƒط«ط± ظ…ط¨ظٹط¹ط§ظ‹"
            renderNewlyAddedProducts();    // ط¥ط¹ط§ط¯ط© ط¹ط±ط¶ "ظˆطµظ„ ط­ط¯ظٹط«ط§ظ‹"
            renderPromotions();            // ط¥ط¹ط§ط¯ط© ط¹ط±ط¶ "ط¹ط±ظˆط¶ ط¬ط§ظ‡ط²ط© ط§ظ„ط´ط­ظ†"
            renderTestimonials();          // ط¥ط¹ط§ط¯ط© ط¹ط±ط¶ "ظ‚ط§ظ„ظˆط§ ط¹ظ†ط§"

            const grid = document.getElementById('mainCategories');
            const inCategoryView = grid && grid.classList.contains('products-grid');
            if (inCategoryView) {
                // ط¥ط¹ط§ط¯ط© ط¬ظ„ط¨ ظˆط¹ط±ط¶ ظ…ظ†طھط¬ط§طھ ط§ظ„ظ‚ط³ظ… ط§ظ„ط­ط§ظ„ظٹ ط¨ط§ظ„ظ„ط؛ط© ط§ظ„ط¬ط¯ظٹط¯ط©
                selectCategory(_currentCategoryKey || 'all');
            } else if (!isProductDeepLink()) {
                showAllCategories(); // ط¹ط±ط¶ ط§ظ„ط£ظ‚ط³ط§ظ… ط§ظ„ط±ط¦ظٹط³ظٹط© ط¨ط¹ط¯ ط¬ظ„ط¨ظ‡ط§
            } else {
                handleProductDeepLink(); // ط¥ط¹ط§ط¯ط© ط¹ط±ط¶ طھظپط§طµظٹظ„ ط§ظ„ظ…ظ†طھط¬ ط¨ط§ظ„ظ„ط؛ط© ط§ظ„ط¬ط¯ظٹط¯ط©
            }
        }
        // ط¥ط¹ط§ط¯ط© طھط·ط¨ظٹظ‚ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ظ…ظˆظ‚ط¹ ط­طھظ‰ طھطھط­ط¯ط« طھط±ط¬ظ…ط© ط¥ط«ط¨ط§طھ ط§ظ„ظ…ط¨ظٹط¹ط§طھ ظˆط§ظ„ط´ط§ط±ط§طھ
        applySiteConfig();
    } catch (error) {
        console.error("Failed to reload dynamic categories:", error);
    }
    renderTickerItems(); // ط¥ط¹ط§ط¯ط© ط¹ط±ط¶ ط´ط±ظٹط· ط§ظ„ط«ظ‚ط© ط¨ط§ظ„ظ„ط؛ط© ط§ظ„ط¬ط¯ظٹط¯ط©
}

// ظ‡ظ„ ظ†ط­ظ† ط¯ط§ط®ظ„ ط±ط§ط¨ط· ط¹ظ…ظٹظ‚ ظ…ط¨ط§ط´ط± ظ„ظ…ظ†طھط¬طں
function isProductDeepLink() {
    return /^\/product\/[a-fA-F0-9]{24}\/?$/.test(window.location.pathname);
}

/**
 * ظپطھط­ ط±ط§ط¨ط· ط¹ظ…ظٹظ‚ ظ…ط¨ط§ط´ط± ظ„ظ„ظ…ظ†طھط¬ ط¹ظ†ط¯ ظپطھط­ طµظپط­ط© /product/:id (SEO + ظ…ط´ط§ط±ظƒط©).
 * ظٹط¨ط­ط« ط§ظ„ظ…ظ†طھط¬ ظپظٹ ظپظ‡ط±ط³ ط§ظ„ط¨ط­ط«طŒ ظˆط¥ظ† ظ„ظ… ظٹط¬ط¯ظ‡ ظٹط¬ظ„ط¨ ط¨ظٹط§ظ†ط§طھظ‡ ظ…ظ† ط§ظ„ط®ط§ط¯ظ… ظ…ط¨ط§ط´ط±ط©
 * (fallback) ط­طھظ‰ ظ„ط§ ظٹظپط´ظ„ ط§ظ„ط±ط§ط¨ط· ط§ظ„ط¹ظ…ظٹظ‚ ط¨طµظ…طھ ط£ط¨ط¯ط§ظ‹.
 * ط¹ظ†ط¯ ط¥ط¹ط§ط¯ط© ط§ظ„ط§ط³طھط¯ط¹ط§ط، (ظ…ط«ظ„ط§ظ‹ ط¨ط¹ط¯ طھط؛ظٹظٹط± ط§ظ„ظ„ط؛ط©) ظٹظڈط¹ط§ط¯ ط§ظ„ط¹ط±ط¶ ظ…ظ† ط§ظ„ظƒط§ط´
 * ط¯ظˆظ† ط¥ط¹ط§ط¯ط© ط¬ظ„ط¨ ط¥ط¶ط§ظپظٹط© ظ…ظ† ط§ظ„ط®ط§ط¯ظ….
 */
let deepLinkProductData = null;

async function handleProductDeepLink() {
    const match = window.location.pathname.match(/^\/product\/([a-fA-F0-9]{24})\/?$/);
    if (!match) return;
    const [, productId] = match;

    const found = searchIndex.find(p => String(p._id) === productId);
    if (found) {
        const lang = getCurrentLanguage();
        const localizedName = found.productName[lang] || found.productName['ar'] || '';
        const clientItem = formatItem({ ...found, name: localizedName }, found.category, detectRegion(found));
        showProductDetails(clientItem, found.category);
        return;
    }

    // ط¥ط¹ط§ط¯ط© ط§ظ„ط§ط³طھط¯ط¹ط§ط، ظ„ظ†ظپط³ ط§ظ„ظ…ظ†طھط¬ â†’ ط¥ط¹ط§ط¯ط© ط§ظ„ط¹ط±ط¶ ظ…ظ† ط§ظ„ظƒط§ط´ ط¯ظˆظ† ط¥ط¹ط§ط¯ط© ط¬ظ„ط¨
    if (deepLinkProductData && String(deepLinkProductData._id) === productId) {
        const lang = getCurrentLanguage();
        const localizedName = deepLinkProductData.productName[lang] || deepLinkProductData.productName['ar'] || '';
        const clientItem = formatItem({ ...deepLinkProductData, name: localizedName }, deepLinkProductData.category, detectRegion(deepLinkProductData));
        showProductDetails(clientItem, deepLinkProductData.category);
        return;
    }

    // ط§ظ„ظ…ظ†طھط¬ ط؛ظٹط± ظ…ظˆط¬ظˆط¯ ظپظٹ ظپظ‡ط±ط³ ط§ظ„ط¨ط­ط« â†’ ط¬ظ„ط¨ ظ…ط¨ط§ط´ط± ظ…ظ† ط§ظ„ط®ط§ط¯ظ… (ظ„ط§ ظپط´ظ„ طµط§ظ…طھ).
    try {
        const res = await fetch(`/api/products/item/${productId}`);
        const data = await res.json();
        if (data.success && data.product) {
            deepLinkProductData = data.product;
            const item = data.product;
            const lang = getCurrentLanguage();
            const localizedName = item.productName[lang] || item.productName['ar'] || '';
            const clientItem = formatItem({ ...item, name: localizedName }, item.category, detectRegion(item));
            showProductDetails(clientItem, item.category);
        }
    } catch (error) {
        console.error('Failed to load product for deep link:', error);
    }
}

/**
 * طھط­ظ…ظٹظ„ ظپظ‡ط±ط³ ط§ظ„ط¨ط­ط« (ظ…ظ†طھط¬ ظˆط§ط­ط¯ ظپظ‚ط· ط¨ط§ظ„ط±ط؛ظ… ظ…ظ† ط§ظ„ط§ط³ظ…) â€” ظٹظڈط³طھط®ط¯ظ… ظ„ظ„ط¨ط­ط« ط§ظ„ط³ط±ظٹط¹
 * ظˆظ„ظپطھط­ طµظپط­ط© طھظپط§طµظٹظ„ ط§ظ„ظ…ظ†طھط¬ ط¹ط¨ط± ط§ظ„ط±ظˆط§ط¨ط· ط§ظ„ط¹ظ…ظٹظ‚ط©.
 */
async function loadSearchIndex() {
    try {
        const res = await fetch('/api/products/search-index');
        const data = await res.json();
        if (data.success) {
            searchIndex = data.products;
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') console.log(`âœ… طھظ… طھط­ظ…ظٹظ„ ظپظ‡ط±ط³ ط§ظ„ط¨ط­ط« ط¨ظ†ط¬ط§ط­ (${searchIndex.length} ظ…ظ†طھط¬).`);
        }
    } catch (error) {
        console.error('Failed to fetch search index:', error);
    }
}

/**
 * طھظ‡ظٹط¦ط© ط§ظ„طھط·ط¨ظٹظ‚ ط¨ط§ظ„ظƒط§ظ…ظ„: ط¬ظ„ط¨ ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ط£ط³ط§ط³ظٹط© ظˆط±ط¨ط· ط§ظ„ط£ط­ط¯ط§ط«.
 */
async function initializeApp() {
    // ًں”‌ ط¥ط¬ط¨ط§ط± ط§ظ„ظ…طھطµظپط­ ط¹ظ„ظ‰ ط¨ط¯ط، ط§ظ„طµظپط­ط© ظ…ظ† ط§ظ„ط£ط¹ظ„ظ‰ ط¹ظ†ط¯ ط§ظ„طھط­ط¯ظٹط«
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
    
    // 0. ًں”¥ ط®ط·ظˆط© ط­ط§ط³ظ…ط©: ط±ط¨ط· ط§ظ„ظ…ط³طھظ…ط¹ ط£ظˆظ„ط§ظ‹ ظ„ط¶ظ…ط§ظ† ط§ظ„طھظ‚ط§ط· ط§ظ„ط­ط¯ط« ط§ظ„ط£ظˆظ„ظٹ
    window.addEventListener('languageChanged', handleLanguageChange);

    // 1. طھظ‡ظٹط¦ط© ظ†ط¸ط§ظ… ط§ظ„طھط±ط¬ظ…ط© ط£ظˆظ„ط§ظ‹. ط³ظٹظ‚ظˆظ… ظ‡ط°ط§ طھظ„ظ‚ط§ط¦ظٹط§ظ‹ ط¨طھط­ط¯ظٹط¯ ط§ظ„ظ„ط؛ط© ط§ظ„طµط­ظٹط­ط©طŒ
    // طھط­ظ…ظٹظ„ ط§ظ„طھط±ط¬ظ…ط§طھطŒ ظˆط¥ط·ظ„ط§ظ‚ ط­ط¯ط« 'languageChanged'. ظ†ظ†طھط¸ط± ط§ظƒطھظ…ط§ظ„ظ‡ ظ‚ط¨ظ„
    // ط¹ط±ط¶ ط§ظ„ظ…ط­طھظˆظ‰ ط§ظ„ط¯ظٹظ†ط§ظ…ظٹظƒظٹ ظ„ط¶ظ…ط§ظ† طھط±ط¬ظ…طھظ‡ ط¨ط§ظ„ظ„ط؛ط© ط§ظ„طµط­ظٹط­ط© ظ…ظ†ط° ط§ظ„ط¨ط¯ط§ظٹط©.
    await initI18n(); 

    // 2. ط§ظ„ظ…ط³طھظ…ط¹ ظ„ط­ط¯ط« 'languageChanged' (ط§ظ„ظ…ظڈط³ط¬ظژظ‘ظ„ ط£ط¹ظ„ط§ظ‡ ظˆظٹظڈط·ظ„ظ‚ ط£ط«ظ†ط§ط، initI18n)
    //    ظ‡ظˆ ط§ظ„ظ…ط³ط¤ظˆظ„ ط§ظ„ظˆط­ظٹط¯ ط¹ظ† ط¬ظ„ط¨ ط§ظ„ط£ظ‚ط³ط§ظ… ظˆط¹ط±ط¶ ط£ط²ط±ط§ط± ط§ظ„ظپظ„طھط±ط© ظˆط§ظ„ظ…ظ‚ط§ط·ط¹ ط§ظ„ط±ط¦ظٹط³ظٹط©
    //    (ط§ظ„ط£ظƒط«ط± ظ…ط¨ظٹط¹ط§ظ‹طŒ ظˆطµظ„ ط­ط¯ظٹط«ط§ظ‹طŒ "ظ‚ط§ظ„ظˆط§ ط¹ظ†ط§") â€” ظ„ط§ ظ†ظƒط±ط± ط§ظ„ط§ط³طھط¯ط¹ط§ط،ط§طھ ظ‡ظ†ط§.
    // 3. ط¨ط§ظ‚ظٹ ط¹ظ…ظ„ظٹط§طھ ط§ظ„طھظ‡ظٹط¦ط© ط§ظ„طھظٹ ظ„ط§ طھط¹طھظ…ط¯ ط¹ظ„ظ‰ ط§ظ„ظ„ط؛ط©.
    initToastContainer(); // طھظ‡ظٹط¦ط© ط­ط§ظˆظٹط© ط§ظ„ط¥ط´ط¹ط§ط±ط§طھ
    initHeroSlider(); // طھط´ط؛ظٹظ„ ط§ظ„ط³ظ„ط§ظٹط¯ط±

    // ًںڑ€ ط¬ظ„ط¨ ظپظ‡ط±ط³ ط§ظ„ط¨ط­ط« (ظ…ط±ط© ظˆط§ط­ط¯ط© ظپظ‚ط· ظ‡ظ†ط§) â€” ظٹظڈط³طھط®ط¯ظ… ظ„ظ„ط¨ط­ط« ط§ظ„ط³ط±ظٹط¹ ظˆظ„ظ„ط±ظˆط§ط¨ط· ط§ظ„ط¹ظ…ظٹظ‚ط©
    await loadSearchIndex();

    // ًںڑ€ ظپطھط­ ط±ط§ط¨ط· ط¹ظ…ظٹظ‚ ظ…ط¨ط§ط´ط± ظ„ظ„ظ…ظ†طھط¬ (طھط­ط³ظٹظ† SEO + ظ‚ط§ط¨ظ„ظٹط© ظ…ط´ط§ط±ظƒط© ط§ظ„ط±ظˆط§ط¨ط·)
    await handleProductDeepLink();

    initAuth(); 
    initRealtime(); // ط¥ط´ط¹ط§ط±ط§طھ ظ„ط­ط¸ظٹط© ظ„ط­ط§ظ„ط© ط§ظ„ط·ظ„ط¨ط§طھ ظ„ظ„ظ…ط³طھط®ط¯ظ…ظٹظ† ط§ظ„ظ…ط³ط¬ظ„ظٹظ†
    initPublicPulse(); // ظ†ط¨ط¶ ط­ظٹ ط­ظ‚ظٹظ‚ظٹ â€” ط·ظ„ط¨ ظ…ظƒطھظ…ظ„ ظٹط¸ظ‡ط± ظ„ظƒظ„ ط§ظ„ط²ظˆط§ط± ظپظˆط±ط§ظ‹
    updateTrustTicker(); // طھط­ط¯ظٹط« ط´ط±ظٹط· ط§ظ„ط«ظ‚ط©
    setInterval(updateTrustTicker, 45000); // طھط­ط¯ظٹط« ط¯ظˆط±ظٹ ظ„ظ„ط´ط±ظٹط· + طھط؛ط°ظٹط© social proof
    setupReveal(document); // ط¸ظ‡ظˆط± ظ…طھط¯ط±ظ‘ط¬ ظ„ط¹ظ†ط§ظˆظٹظ† ط§ظ„ط£ظ‚ط³ط§ظ… ظˆط¨ط·ط§ظ‚ط§طھظ‡ط§ ط§ظ„ط«ط§ط¨طھط©
    renderPromotions(); // ط¹ط±ط¶ ظ‚ط³ظ… "ط¹ط±ظˆط¶ ط¬ط§ظ‡ط²ط© ط§ظ„ط´ط­ظ†"

    // âڑ™ï¸ڈ ط¬ظ„ط¨ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ظ…ظˆظ‚ط¹ (ط£ط±ظ‚ط§ظ… ط§ظ„ط¯ظپط¹طŒ ط§ظ„ط³ظˆط´ظٹط§ظ„طŒ ط§ظ„ط¥ط­طµط§ط¦ظٹط§طھ) ظ‚ط¨ظ„ ط±ط¨ط· ط§ظ„ط£ط­ط¯ط§ط«
    await fetchSiteConfig();
    applySiteConfig();
    
    updateCartUI(); // طھط­ط¯ظٹط« ط§ظ„ط³ظ„ط© ظپظˆط± ظپطھط­ ط§ظ„طµظپط­ط©

    setupEventListeners();
    syncWishlistButtons(); // طھظپط¹ظٹظ„ ط£ط²ط±ط§ط± ط§ظ„ط£ظ…ظ†ظٹط§طھ ط¨ط¹ط¯ ط£ظˆظ„ ط¹ط±ط¶
    initModalBehaviors(); // ط¥ط؛ظ„ط§ظ‚ ط§ظ„ظ†ظˆط§ظپط° ط¨ط§ظ„ط®ظ„ظپظٹط©/ط²ط± ط§ظ„ط¥ط؛ظ„ط§ظ‚ + ط§ظ„طھط¨ظˆظٹط¨
    initPromoSectionInteractions(); // طھظپط§ط¹ظ„ط§طھ ط¨ط·ط§ظ‚ط§طھ ط§ظ„ط¹ط±ظˆط¶
    initPromoInput(); // ط­ظ‚ظ„ ظƒظˆط¯ ط§ظ„ط®طµظ… ظپظٹ ظ†ط§ظپط°ط© ط§ظ„ط³ظ„ط©
}

function setupEventListeners() {
    // ط±ط¨ط· ط§ظ„ط£ط­ط¯ط§ط« ط¨ط¹ط¯ طھط­ظ…ظٹظ„ ط§ظ„ط¨ظٹط§ظ†ط§طھ

    const logoHomeBtn = document.getElementById('logoHomeBtn');
    if (logoHomeBtn) {
        logoHomeBtn.addEventListener('click', function() { goBack(); });
    }

    // ط§ط³طھط®ط¯ط§ظ… ط§ظ„طھظپظˆظٹط¶ (Event Delegation) ظ„ط£ط²ط±ط§ط± ظپظ„طھط±ط© ط§ظ„ظ…ظ†ط§ط·ظ‚
    document.addEventListener('click', function(e) {
        const regionFilterBar = document.getElementById('regionFilterBar');
        if (regionFilterBar && regionFilterBar.contains(e.target)) {
            const btn = e.target.closest('.filter-btn');
            if (!btn || !btn.dataset.target) return;

            regionFilterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // ط¥ط¹ط§ط¯ط© طھظ‚ط¯ظٹظ… ط§ظ„ط´ط¨ظƒط© ظ…ط¹ طھط·ط¨ظٹظ‚ ظپظ„طھط±ط© ط§ظ„ظ…ظ†ط·ظ‚ط© + ط§ظ„طھط±طھظٹط¨ + ط§ظ„طھظˆظپط±
            renderCategoryProducts();
            return; // ظ…ظ†ط¹ طھظƒط±ط§ط± ط§ظ„ظ…ط¹ط§ظ„ط¬ط© ط¥ط°ط§ ظƒط§ظ† ط§ظ„ط­ط¯ط« ط¯ط§ط®ظ„ ط´ط±ظٹط· ط§ظ„ظپظ„طھط±ط©
        } // ط¥ط؛ظ„ط§ظ‚ ظƒطھظ„ط© if ظ‡ظ†ط§
    }); // ط¥ط؛ظ„ط§ظ‚ ط¯ط§ظ„ط© addEventListener ظ‡ظ†ط§

    // â”€â”€â”€ ط£ط¯ظˆط§طھ ط§ظ„طھط±طھظٹط¨ ظˆظپظ„طھط±ط© ط§ظ„طھظˆظپط± â”€â”€â”€
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

    // ط£ط­ط¯ط§ط« ط§ظ„ظ…ظˆط¯ط§ظ„ط§طھ ط§ظ„ط¹ط§ظ…ط© ظ„طھط¬ظ†ط¨ ط§ظ„طھظƒط±ط§ط±
    // ط¥ط؛ظ„ط§ظ‚ ط§ظ„ط³ظ„ط© ظˆظ†ط§ظپط°ط© ط§ظ„ظƒظˆط¯ ظٹط¹طھظ…ط¯ ط¹ظ„ظ‰ [data-close-modal] ط¹ط¨ط± initModalBehaviors
    // (ظٹظڈط؛ظ„ظ‚ ط¹ط¨ط± closeModal â€” ظٹظ†ط¸ظپ aria-modal ظˆظپط®ظ‘ ط§ظ„طھط¨ظˆظٹط¨ ظˆظ‚ظپظ„ ط§ظ„طھظ…ط±ظٹط±)
    const purchaseModal = document.getElementById('purchaseModal');

    const copyCodeBtn = document.getElementById('copyCodeBtn');
    if (copyCodeBtn) {
        copyCodeBtn.addEventListener('click', function() {
            const codeText = document.getElementById('generatedCode').textContent;
            copyTextToClipboard(codeText).then(ok => {
                if (ok) showToast(t('code_copied'), 'success');
                else showToast(t('track_copy_manual'), 'info');
            });
        });
    }

    // ط¥ظٹظ‚ط§ظپ ط§ظ„ط§ط³طھط·ظ„ط§ط¹/ط§ظ„ط¹ط¯ظ‘ط§ط¯ ط¹ظ†ط¯ ط¥ط؛ظ„ط§ظ‚ ط¥ظٹطµط§ظ„ ط§ظ„ط·ظ„ط¨
    const receiptOverlay = document.getElementById('codeModal');
    if (receiptOverlay) {
        receiptOverlay.addEventListener('click', function(e) {
            if (e.target.closest('[data-close-modal]') || e.target === receiptOverlay) {
                stopReceiptPolling();
                stopReceiptCountdown();
            }
        });
    }

    // طµط§ط¦ط¯ ط¶ط؛ط·ط§طھ ط§ظ„ظƒط±ظˆطھ ظˆط§ظ„ط¯ط®ظˆظ„ ظ„ظ„ط³ظ„ط©
    document.getElementById('mainCategories').addEventListener('click', function(e) {
        if (e.target.closest('[data-wishlist-btn]')) return; // ظ„ط§ طھظپطھط­ ط§ظ„طھظپط§طµظٹظ„ ط¹ظ†ط¯ ط¶ط؛ط· ط²ط± ط§ظ„ط£ظ…ظ†ظٹط§طھ
        if (e.target.closest('[data-quick-add]')) return; // ظ„ط§ طھظپطھط­ ط§ظ„طھظپط§طµظٹظ„ ط¹ظ†ط¯ ط¶ط؛ط· ط²ط± ط§ظ„ط¥ط¶ط§ظپط© ط§ظ„ط³ط±ظٹط¹ط©
        
        const enterBtn = e.target.closest('.enter-btn[data-category]');
        if (enterBtn) {
            selectCategory(enterBtn.dataset.category);
            return;
        }
        
        const buyBtn = e.target.closest('.buy-btn[data-item]');
        if (buyBtn && buyBtn.dataset.productId) { // طھط£ظƒط¯ ظ…ظ† ظˆط¬ظˆط¯ productId
            const item = productCache.get(buyBtn.dataset.productId); // ط§ط³طھط±ط¬ط§ط¹ ط§ظ„ظ…ظ†طھط¬ ظ…ظ† ط§ظ„ظƒط§ط´
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

    // ط§ط³طھط®ط¯ط§ظ… ط§ظ„طھظپظˆظٹط¶ (Event Delegation) ظ„ط£ط²ط±ط§ط± ظپظ„طھط±ط© ط§ظ„ط£ظ‚ط³ط§ظ…
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

    // --- ظ†ط¸ط§ظ… ط§ظ„ط¨ط­ط« ط§ظ„ط°ظƒظٹ ط§ظ„ط¬ط¯ظٹط¯ ظ…ط¹ ط§ظ„ط¥ظƒظ…ط§ظ„ ط§ظ„طھظ„ظ‚ط§ط¦ظٹ ---
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
                    : `ظ„ط§ طھظˆط¬ط¯ ظ†طھط§ط¦ط¬ ظ„ط¨ط­ط«ظƒ "<strong>${escapeHtml(query)}</strong>"`;
                resultsContainer.innerHTML = `<div class="autocomplete-empty"><i class="fas fa-search-minus"></i> ${msg}</div>`;
                showResults();
                return;
            }

            results.forEach(product => {
                const imgSrc = resolveImageUrl(product.image) || '/image/logo.png';
                const name = escapeHtml(product.productName[lang] || product.productName['ar'] || '');
                const categoryTitle = escapeHtml(rawServerData.categories[product.category]?.title || t('category_unknown'));

                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.innerHTML = `
                    <img src="${escapeHtml(imgSrc)}" alt="${name}" loading="lazy" decoding="async">
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

            // ط¥ط¸ظ‡ط§ط± skeleton loading ط¨ظٹظ†ظ…ط§ ط§ظ„ط¨ط­ط«
            renderLoadingSkeleton();

            debounceTimer = setTimeout(() => {
                const lang = getCurrentLanguage();
                const lowerCaseQuery = query.toLowerCase();

                // --- âœ¨ ط¨ط­ط« ظ…ظˆط­ط¯ + ظپظ„طھط±ط§طھ ظپط¦ط©/ط³ط¹ط±/طھظ‚ظٹظٹظ… ---
                const catFilter=document.getElementById('searchFilterCategory')?.value||'';
                const priceFilter=document.getElementById('searchFilterPrice')?.value||'';
                const ratingFilter=parseFloat(document.getElementById('searchFilterRating')?.value||'');
                const sortFilter=document.getElementById('searchFilterSort')?.value||'';
                let results = searchIndex.filter(product => {
                    const nameAr = (product.productName.ar || '').toLowerCase();
                    const nameEn = (product.productName.en || '').toLowerCase();
                    const category = (product.category || '').toLowerCase();
                    const matchesText = nameAr.includes(lowerCaseQuery) || nameEn.includes(lowerCaseQuery) || category.includes(lowerCaseQuery);
                    if(!matchesText) return false;
                    if(catFilter && product.category!==catFilter) return false;
                    const price=Number(product.price)||0;
                    if(priceFilter){
                        const [minStr,maxStr]=priceFilter.split('-');
                        const min=minStr?parseFloat(minStr):0;
                        const max=maxStr?parseFloat(maxStr):Infinity;
                        if(price < min || price > max) return false;
                    }
                    if(!Number.isNaN(ratingFilter) && (Number(product.rating)||0) < ratingFilter) return false;
                    return true;
                });
                if(sortFilter==='price_asc') results.sort((a,b)=>(Number(a.price)||0)-(Number(b.price)||0));
                else if(sortFilter==='price_desc') results.sort((a,b)=>(Number(b.price)||0)-(Number(a.price)||0));
                else if(sortFilter==='rating') results.sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0));
                results=results.slice(0,10);
                renderResults(results, lang, query);
            }, 300); // ط§ظ†طھط¸ط§ط± 300ms ط¨ط¹ط¯ طھظˆظ‚ظپ ط§ظ„ظ…ط³طھط®ط¯ظ… ط¹ظ† ط§ظ„ظƒطھط§ط¨ط©
        });

        // ط¥ط®ظپط§ط، ط§ظ„ظ†طھط§ط¦ط¬ ط¹ظ†ط¯ ط§ظ„ط¶ط؛ط· ط®ط§ط±ط¬ ط­ظ‚ظ„ ط§ظ„ط¨ط­ط«
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container') && !e.target.closest('.search-container-mobile')) {
                hideResults();
            }
        });

        // ط¥ط®ظپط§ط، ط§ظ„ظ†طھط§ط¦ط¬ ط¹ظ†ط¯ ط§ظ„ط¶ط؛ط· ط¹ظ„ظ‰ Escape
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideResults();
            }
        });
    };

    setupAutocomplete('searchInput', 'autocomplete-results');
    setupAutocomplete('searchInputMobile', 'autocomplete-results-mobile');
    // ظپظ„طھط±ط§طھ ط§ظ„ط¨ط­ط« ط§ظ„ط°ظƒظٹ
    (function initSearchFilters(){
        const catSel=document.getElementById('searchFilterCategory');
        const filtersWrap=document.getElementById('searchFilters');
        const populateCats=()=>{
            if(!catSel) return;
            const cats=rawServerData.categories||{};
            const existing=[...catSel.options].map(o=>o.value);
            Object.entries(cats).forEach(([key,cat])=>{
                if(existing.includes(key)) return;
                const o=document.createElement('option'); o.value=key; o.textContent=cat.title||key; catSel.appendChild(o);
            });
        };
        populateCats();
        window.addEventListener('languageChanged', populateCats);
        const showFilters=(show)=>{ if(filtersWrap) filtersWrap.hidden=!show; };
        const triggerSearch=()=>{
            const inp=document.getElementById('searchInput');
            if(inp) inp.dispatchEvent(new Event('input'));
            const inpM=document.getElementById('searchInputMobile');
            if(inpM) inpM.dispatchEvent(new Event('input'));
        };
        ['searchFilterCategory','searchFilterPrice','searchFilterRating','searchFilterSort'].forEach(id=>{
            const el=document.getElementById(id);
            if(el) el.addEventListener('change', triggerSearch);
        });
        const inp=document.getElementById('searchInput');
        if(inp){ inp.addEventListener('input',()=>{ const q=inp.value.trim(); showFilters(q.length>=2); }); }
        const inpM=document.getElementById('searchInputMobile');
        if(inpM){ inpM.addEventListener('input',()=>{ const q=inpM.value.trim(); showFilters(q.length>=2); }); }
    })();
    // ط¥ط«ط¨ط§طھ ط§ظ„ط¯ظپط¹ â€” ظ…ط¹ط§ظٹظ†ط© ط§ظ„طµظˆط±ط©
    (function initPaymentProof(){
        const input=document.getElementById('paymentProofInput');
        const preview=document.getElementById('paymentProofPreview');
        const img=document.getElementById('paymentProofImg');
        const removeBtn=document.getElementById('removeProofBtn');
        if(!input) return;
        input.addEventListener('change', async()=>{
            const file=input.files?.[0];
            if(!file || !file.type.startsWith('image/')) return;
            if(file.size>5*1024*1024){ showToast('ط­ط¬ظ… ط§ظ„طµظˆط±ط© ظƒط¨ظٹط± (5MB max)','error'); input.value=''; return; }
            const form=new FormData(); form.append('image', file);
            try{
                const res=await fetch('/api/upload/review-image',{method:'POST', body:form});
                const data=await res.json();
                if(data.success && data.url){
                    paymentProofUrl=data.url;
                    if(img) img.src=data.url;
                    if(preview) preview.style.display='flex';
                    showToast('طھظ… ط±ظپط¹ طµظˆط±ط© ط§ظ„ط¥ط«ط¨ط§طھ','success');
                }else{ showToast(data.error||'ظپط´ظ„ ط§ظ„ط±ظپط¹','error'); }
            }catch(_e){ showToast('ظپط´ظ„ ط§ظ„ط±ظپط¹','error'); }
        });
        if(removeBtn) removeBtn.addEventListener('click',()=>{ paymentProofUrl=null; if(preview) preview.style.display='none'; if(img) img.src=''; input.value=''; });
    })();

    // ظپطھط­ ط§ظ„ط³ظ„ط© ط¹ط¨ط± ط²ط± ط§ظ„ظ‡ظٹط¯ط±
    const cartHeaderBtn = document.getElementById('cartHeaderBtn');
    const openPurchaseCheckout = function() {
        // طھط­ط³ظٹظ† طھط¬ط±ط¨ط© ط§ظ„ظ…ط³طھط®ط¯ظ…: طھط¹ط¨ط¦ط© ط§ظ„ط¥ظٹظ…ظٹظ„ طھظ„ظ‚ط§ط¦ظٹط§ظ‹ ط¥ط°ط§ ظƒط§ظ† ظ…ط³ط¬ظ„ط§ظ‹ ط¯ط®ظˆظ„ظ‡
        const loggedInUser = getCurrentUser();
        const emailInput = document.getElementById('user-email');
        if (loggedInUser && emailInput) {
            emailInput.value = loggedInUser.email;
        }
        setCheckoutStep(1);
        updateCartUI();
        openModal(purchaseModal);
    };
    if (cartHeaderBtn && purchaseModal) {
        cartHeaderBtn.addEventListener('click', openPurchaseCheckout);
    }

    // ط´ط±ظٹط· ط§ظ„ط³ظ„ط© ط§ظ„ط«ط§ط¨طھ ظ„ظ„ط¬ظˆط§ظ„ (ط²ط± ط¥طھظ…ط§ظ… ط§ظ„ط´ط±ط§ط، + ظ…ظ†ط·ظ‚ط© ظ…ط¹ظ„ظˆظ…ط§طھ ط§ظ„ط³ظ„ط©)
    const mobileCheckoutBtn = document.getElementById('mobileCartCheckoutBtn');
    if (mobileCheckoutBtn && purchaseModal) {
        mobileCheckoutBtn.addEventListener('click', openPurchaseCheckout);
    }
    const mobileBarInfo = document.getElementById('mobileCartBarInfo');
    if (mobileBarInfo && purchaseModal) {
        mobileBarInfo.addEventListener('click', openPurchaseCheckout);
        mobileBarInfo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPurchaseCheckout();
            }
        });
    }

    // ======================================================
    //  ط®ط·ظˆط§طھ ط§ظ„ط´ط±ط§ط، (ط¨ظٹط§ظ†ط§طھ â†گ ط¯ظپط¹ â†گ ط§ط³طھظ„ط§ظ…)
    // ======================================================
    let checkoutStep = 1;
    const checkoutPrevBtn = document.getElementById('checkoutPrevBtn');
    const checkoutNextBtn = document.getElementById('checkoutNextBtn');
    const submitOrderBtnEl = document.getElementById('submitOrderBtn');

    function setCheckoutStep(step) {
        checkoutStep = Math.min(3, Math.max(1, step));

        document.querySelectorAll('[data-checkout-panel]').forEach(panel => {
            const active = Number(panel.dataset.checkoutPanel) === checkoutStep;
            panel.classList.toggle('active', active);
            panel.setAttribute('aria-hidden', String(!active));
        });

        document.querySelectorAll('[data-checkout-step-label]').forEach(stepEl => {
            const stepNumber = Number(stepEl.dataset.checkoutStepLabel);
            stepEl.classList.toggle('active', stepNumber <= checkoutStep);
            stepEl.classList.toggle('done', stepNumber < checkoutStep);
        });

        if (checkoutPrevBtn) checkoutPrevBtn.disabled = checkoutStep === 1;
        if (checkoutNextBtn) checkoutNextBtn.style.display = checkoutStep === 3 ? 'none' : 'inline-flex';
        if (submitOrderBtnEl) submitOrderBtnEl.style.display = checkoutStep === 3 ? 'inline-flex' : 'none';

        if (checkoutStep === 3) updateCartUI(); // طھط­ط¯ظٹط« ظ…ظ„ط®طµ ط§ظ„ظ…ط±ط§ط¬ط¹ط© ظ‚ط¨ظ„ ط§ظ„ط¸ظ‡ظˆط±
    }

    if (checkoutNextBtn) {
        checkoutNextBtn.addEventListener('click', () => {
            if (checkoutStep === 1) {
                const email = document.getElementById('user-email');
                if (!email || !email.value.trim()) { showToast(t('checkout_email_required'), 'error'); return; }
            }
            if (checkoutStep === 2) {
                const gateway = document.querySelector('input[name="payment_gateway"]:checked')?.value || 'jawwal_pay';
                const refInput = document.getElementById('paymentRefInput');
                if (gateway !== 'stripe' && (!refInput || !refInput.value.trim())) {
                    showToast(t('checkout_ref_required'), 'error');
                    return;
                }
            }
            setCheckoutStep(checkoutStep + 1);
        });
    }
    if (checkoutPrevBtn) {
        checkoutPrevBtn.addEventListener('click', () => setCheckoutStep(checkoutStep - 1));
    }

    // طھط؛ظٹظٹط± ط§ظ„ظ…ط­ط§ظپط¸ ط¯ظٹظ†ط§ظ…ظٹظƒظٹط§ظ‹ ط¯ط§ط®ظ„ ط§ظ„ظ…ظˆط¯ط§ظ„
    const paymentOptionsContainer = document.querySelector('.payment-options');
    const instructionsZone = document.getElementById('paymentInstructions');

    const updatePaymentInstructions = (method) => {
        if (!instructionsZone) return;
        const payment = siteConfig?.payment || {};
        const jawwal = payment.jawwalNumber || '';
        const palpay = payment.palpayNumber || '';
        const refakt = payment.reflectNumber || jawwal || '';
        const num = '<span style="color: #fff; font-weight: bold; letter-spacing: 1px;">';
        const foot = '<p style="margin: 5px 0; color: #b9bbbe;">';
        if (method === 'jawwal_pay') {
            instructionsZone.innerHTML = jawwal
                ? `<p style="margin: 0 0 8px 0; color: #ff9f43; font-weight: bold;"><i class="fas fa-wallet"></i> ${t('pay_inst_jawwal_title')}</p><p style="margin: 5px 0;">${t('pay_inst_transfer_to')} ${num}${jawwal}</span></p>${foot}${t('pay_inst_followup')}</p>`
                : `<p style="margin: 0 0 8px 0; color: #ff9f43; font-weight: bold;"><i class="fas fa-wallet"></i> ${t('pay_inst_jawwal_title')}</p>${foot}${t('pay_inst_later')}</p>`;
        } else if (method === 'palpay') {
            instructionsZone.innerHTML = palpay
                ? `<p style="margin: 0 0 8px 0; color: #0072ff; font-weight: bold;"><i class="fas fa-university"></i> ${t('pay_inst_palpay_title')}</p><p style="margin: 5px 0;">${t('pay_inst_transfer_wallet')} ${num}${palpay}</span></p>${foot}${t('pay_inst_followup_palpay')}</p>`
                : `<p style="margin: 0 0 8px 0; color: #0072ff; font-weight: bold;"><i class="fas fa-university"></i> ${t('pay_inst_palpay_title')}</p>${foot}${t('pay_inst_later')}</p>`;
        } else if (method === 'stripe') {
            instructionsZone.innerHTML = `<p style="margin: 0 0 8px 0; color: #635bff; font-weight: bold;"><i class="fas fa-credit-card"></i> ${t('stripe_heading')}</p><p style="margin: 5px 0; color: #b9bbbe;">${t('stripe_desc')}</p>`;
        } else if (method === 'refakt') {
            instructionsZone.innerHTML = refakt
                ? `<p style="margin: 0 0 8px 0; color: #12b489; font-weight: bold;"><i class="fas fa-wallet"></i> ${t('pay_inst_reflect_title')}</p><p style="margin: 5px 0;">${t('pay_inst_transfer_wallet')} ${num}${refakt}</span></p>${foot}${t('pay_inst_followup')}</p>`
                : `<p style="margin: 0 0 8px 0; color: #12b489; font-weight: bold;"><i class="fas fa-wallet"></i> ${t('pay_inst_reflect_title')}</p>${foot}${t('pay_inst_later')}</p>`;
        }
    };

    if (paymentOptionsContainer) {
        paymentOptionsContainer.addEventListener('change', (e) => {
            if (e.target.name === 'payment_gateway') {
                updatePaymentInstructions(e.target.value);
            }
        });
        // ط¹ط±ط¶ ط§ظ„طھط¹ظ„ظٹظ…ط§طھ ط§ظ„ط§ظپطھط±ط§ط¶ظٹط© ط¹ظ†ط¯ ط§ظ„طھط­ظ…ظٹظ„
        updatePaymentInstructions('jawwal_pay');
    }

    // ط¥ط±ط³ط§ظ„ ط·ظ„ط¨ ط§ظ„ط³ظ„ط© ط§ظ„ظƒط§ظ…ظ„ ط¨ط§ظ„ظƒط§ظ…ظ„ ظ„ظ„ظ€ Backend
    const submitOrderBtn = document.getElementById('submitOrderBtn');
    if (submitOrderBtn) {
        submitOrderBtn.addEventListener('click', async function() {
            const email = document.getElementById('user-email').value.trim();
            const paymentRef = document.getElementById('paymentRefInput').value.trim();
            const gateway = document.querySelector('input[name="payment_gateway"]:checked')?.value || 'jawwal_pay';

            if (!email) { showToast(t('checkout_email_required'), 'error'); return; }
            if (gateway !== 'stripe' && !paymentRef) { showToast(t('checkout_ref_required'), 'error'); return; }
            if (cart.length === 0) { showToast(t('checkout_cart_empty'), 'error'); return; }

            // طھط¬ظ‡ظٹط² ظ…طµظپظˆظپط© ط§ظ„ظ…ظ†طھط¬ط§طھ ظ„ظƒظٹ ظٹط³طھظ„ظ…ظ‡ط§ ط§ظ„ط³ظٹط±ظپط± ط¯ظپط¹ط© ظˆط§ط­ط¯ط©
            const appliedPromo = getAppliedPromo();
            const appliedLoyalty = getAppliedLoyalty();
            const orderData = {
                cartItems: cart.map(item => ({ id: item.id, qty: item.qty })),
                customerEmail: email,
                paymentGateway: gateway,
                paymentRef: paymentRef,
                ...(paymentProofUrl ? { paymentProofUrl } : {}),
                ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
                ...(appliedLoyalty ? { loyaltyPoints: appliedLoyalty.points } : {})
            };

            submitOrderBtn.disabled = true;
            submitOrderBtn.textContent = t('checkout_submitting');

            try {
                // ط§ظ„ط¬ظ„ط³ط© طھظڈط±ط³ظ„ طھظ„ظ‚ط§ط¦ظٹط§ظ‹ ط¹ط¨ط± HttpOnly cookie (ظ„ط§ ط­ط§ط¬ط© ظ„طھط®ط²ظٹظ† طھظˆظƒظ† ظپظٹ localStorage)
                const response = await fetch('/api/checkout', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(orderData)
                });

                const result = await response.json();

                if (result.success) {
                    closeModal(purchaseModal);
                    setCheckoutStep(1);
                    cart.length = 0; // طھظپط±ظٹط؛ ط§ظ„ظ…طµظپظˆظپط©
                    localStorage.removeItem('joker_cart');
                    clearAppliedPromo(); // ط¥ط²ط§ظ„ط© ظƒظˆط¯ ط§ظ„ط®طµظ… ط¨ط¹ط¯ ط¥طھظ…ط§ظ… ط§ظ„ط·ظ„ط¨
                    clearAppliedLoyalty();
                    paymentProofUrl=null;
                    const ppPreview=document.getElementById('paymentProofPreview'); if(ppPreview) ppPreview.style.display='none';
                    const ppImg=document.getElementById('paymentProofImg'); if(ppImg) ppImg.src='';
                    const ppInput=document.getElementById('paymentProofInput'); if(ppInput) ppInput.value='';
                    updateCartUI();
                    if (result.gateway === 'stripe' && result.stripeUrl) {
                        window.open(result.stripeUrl, '_blank', 'noopener');
                        showToast(t('checkout_stripe_success'), 'success');
                    } else {
                        renderOrderReceipt({ email, orderId: result.orderId || '' });
                        showToast(t('checkout_success'), 'success');
                    }
                } else {
                    showToast(`â‌Œ ${escapeHtml(result.error || t('checkout_error_generic'))}`, 'error');
                }
            } catch (_err) {
                showToast(t('checkout_error_connection'), 'error');
            } finally {
                submitOrderBtn.disabled = false;
                submitOrderBtn.textContent = t('submit_order_button');
            }
        });
    }

    const clearBtn = document.getElementById('clearCartBtn'); 
    if (clearBtn) {
        clearBtn.onclick = clearCart;
    }

    // ط²ط± ط§ظ„ظ€ Hero â€” ط§ظ„ط¹ظˆط¯ط© ظ„ظ„ط±ط¦ظٹط³ظٹط© ظˆط§ظ„طھظ…ط±ظٹط± ظ„ظ„ط£ظ‚ط³ط§ظ…
    document.addEventListener('click', function(e) {
        const cta = e.target.closest('[data-hero-cta]');
        if (!cta) return;
        goBack();
        const target = document.getElementById('mainCategories');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ط²ط± ط§ظ„ط¹ظˆط¯ط© ط¥ظ„ظ‰ ط§ظ„ط£ط¹ظ„ظ‰
    const backToTopBtn = document.getElementById('backToTop');
    if (backToTopBtn) {
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const onScroll = () => {
            backToTopBtn.classList.toggle('is-visible', window.scrollY > 420);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        backToTopBtn.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
        });
    }

    // ط£ط²ط±ط§ط± ط§ظ„ط£ظ…ظ†ظٹط§طھ (طھظپظˆظٹط¶)
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('[data-wishlist-btn]');
        if (!btn) return;
        e.preventDefault();
        const id = btn.dataset.productId;
        if (!id) return;
        const added = toggleWishlistKey(id);
        showToast(added ? t('wishlist_added') : t('wishlist_removed'), added ? 'success' : 'info');
    });

    // ط²ط± "ط¥ط¶ط§ظپط© ط³ط±ظٹط¹ط©" (+)
    document.addEventListener('click', function(e) {
        const addBtn = e.target.closest('[data-quick-add]');
        if (!addBtn) return;
        e.preventDefault();
        e.stopPropagation();
        const id = addBtn.dataset.productId;
        if (!id) return;
        const item = productCache.get(id);
        if (!item) return;
        // ط§ظ„ظ…ط®ط²ظˆظ† ط؛ظٹط± ظ…ط¹ط±ظˆظپ (ط®ط§ط±ط¬ظٹ) â†’ ظٹظڈط¹طھط¨ط± ظ…طھظˆظپط±ط§ظ‹ط› ط§ظ„ظ†ظپط§ط° ظپظ‚ط· ط¹ظ†ط¯ظ…ط§ ظٹظƒظˆظ† ط±ظ‚ظ…ط§ظ‹ ظ…ط¹ط±ظˆظپط§ظ‹ â‰¤ 0
        if (item.availableStock !== null && item.availableStock !== undefined && Number(item.availableStock) <= 0) {
            showToast(t('stock_out'), 'error');
            return;
        }
        addToCart(item); // addToCart ظٹط¹ط±ط¶ ط¥ط´ط¹ط§ط± "cart_added" ط¨ظ†ظپط³ظ‡ ظˆظ„ط§ ط­ط§ط¬ط© ظ„ط¥ط´ط¹ط§ط± ظ…ظƒط±ط±
        addBtn.classList.add('added');
        const label = addBtn.querySelector('i');
        if (label) label.classList.replace('fa-plus', 'fa-check');
        setTimeout(() => {
            addBtn.classList.remove('added');
            if (label) label.classList.replace('fa-check', 'fa-plus');
        }, 1400);
    });

    // طھط£ط«ظٹط± 3D ط®ظپظٹظپ ط¹ظ†ط¯ ظ…ط±ظˆط± ط§ظ„ظپط£ط±ط© ط¹ظ„ظ‰ ط§ظ„ظƒط±طھ
    document.addEventListener('mousemove', function(e) {
        const card = e.target.closest('.product-item-card');
        if (!card || card.closest('.tilt-disabled')) return;
        if (!window.matchMedia('(hover: hover)').matches) return;
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.setProperty('--tilt-x', `${py * -5}deg`);
        card.style.setProperty('--tilt-y', `${px * 5}deg`);
    });
    document.addEventListener('mouseleave', () => {
        document.querySelectorAll('.product-item-card').forEach(card => {
            card.style.setProperty('--tilt-x', '0deg');
            card.style.setProperty('--tilt-y', '0deg');
        });
    });

    // ظپطھط­/ط¥ط؛ظ„ط§ظ‚ ظ†ط§ظپط°ط© طھطھط¨ط¹ ط§ظ„ط·ظ„ط¨
    const trackFooterBtn = document.getElementById('trackOrderFooterBtn');
    const trackModal = document.getElementById('trackOrderModal');
    const closeTrackBtn = document.getElementById('closeTrackOrderModal');
    if (trackFooterBtn && trackModal) {
        trackFooterBtn.addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('trackEmailInput').value = '';
            document.getElementById('trackOrderIdInput').value = '';
            document.getElementById('trackOrderResults').innerHTML = '';
            openModal(trackModal);
        });
    }
    if (closeTrackBtn && trackModal) {
        closeTrackBtn.addEventListener('click', function() { closeModal(trackModal); });
    }
    const trackOrderBtn = document.getElementById('trackOrderBtn');
    if (trackOrderBtn) {
        trackOrderBtn.addEventListener('click', handleTrackOrder);
    }

    // طھط­ط¯ظٹط« ظ†ط§ظپط°ط© ط§ظ„طھطھط¨ط¹ طھظ„ظ‚ط§ط¦ظٹط§ظ‹ ط¹ظ†ط¯ طھط؛ظٹظ‘ط± ط­ط§ظ„ط© ط·ظ„ط¨ ط¹ط¨ط± WebSocket (ظ…ظ† realtime.js)
    window.addEventListener('joker-order-status', function(e) {
        const orderId = e.detail && e.detail.orderId;
        if (!orderId) return;
        const trackModalEl = document.getElementById('trackOrderModal');
        if (!trackModalEl || !trackModalEl.classList.contains('active')) return;
        const idInput = document.getElementById('trackOrderIdInput');
        if (!idInput) return;
        const current = idInput.value.trim();
        if (current && current.toLowerCase() === String(orderId).toLowerCase()) {
            handleTrackOrder();
        }
    });

    // ظپطھط­/ط¥ط؛ظ„ط§ظ‚ ظ†ط§ظپط°ط© ظ‚ط§ط¦ظ…ط© ط§ظ„ط£ظ…ظ†ظٹط§طھ
    const wishlistFooterBtn = document.getElementById('wishlistFooterBtn');
    const wishlistModal = document.getElementById('wishlistModal');
    if (wishlistFooterBtn && wishlistModal) {
        wishlistFooterBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showWishlist();
        });
    }
}

//  طھظ‡ظٹط¦ط© ط§ظ„ط£ط­ط¯ط§ط« ط¹ظ†ط¯ طھط­ظ…ظٹظ„ ط§ظ„طµظپط­ط©
// ======================================================
document.addEventListener('DOMContentLoaded', function() {
    // ط§ط³طھط¯ط¹ط§ط، ط¯ط§ظ„ط© ط§ظ„طھظ‡ظٹط¦ط© ط§ظ„ط±ط¦ظٹط³ظٹط© ط§ظ„طھظٹ ط£طµط¨ط­طھ ط§ظ„ط¢ظ† طھط­طھظˆظٹ ط¹ظ„ظ‰ ظƒظ„ ط§ظ„ظ…ظ†ط·ظ‚ ط§ظ„ظ„ط§ط²ظ… ط¨ط§ظ„طھط±طھظٹط¨ ط§ظ„طµط­ظٹط­.
    initializeApp(); 
});

// ======================================================
// ًںچ‍ ظ†ط¸ط§ظ… ط§ظ„ط¥ط´ط¹ط§ط±ط§طھ ط§ظ„ظ…ظ†ط¨ط«ظ‚ط© (Toast Notifications)
// ======================================================
// طھظ… ظ†ظ‚ظ„ ظ‡ط°ط§ ط§ظ„ظ…ظ†ط·ظ‚ ط¨ط§ظ„ظƒط§ظ…ظ„ ط¥ظ„ظ‰ ui.js

// ======================================================
// ًں¤‌ طھطµط¯ظٹط± ط§ظ„ط£ط¯ظˆط§طھ ط§ظ„ظ…ط³ط§ط¹ط¯ط© ط§ظ„ظ…ظڈط³طھط®ط¯ظ…ط© ظپظٹ ui.js
// (ظ…ظ†طھط¬ط§طھ ظ…ط´ط§ط¨ظ‡ط© / ط´ظˆظ‡ط¯طھ ظ…ط¤ط®ط±ط§ظ‹) â€” import ط¯ظٹظ†ط§ظ…ظٹظƒظٹ
// ======================================================
export { productCache, formatItem, detectRegion, getRegionDetails };
