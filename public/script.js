import { showAllCategories, showProductDetails, updateCartUI, showToast, initToastContainer, escapeHtml, bindCardImageState, setGuaranteeStripVisible } from './ui.js';
import { cart, addToCart, clearCart } from './cart.js';
import { initAuth, getCurrentUser } from './auth.js';
import { initI18n, getCurrentLanguage, t } from './i18n.js';
import { setCurrency, formatPrice } from './currency.js';
import { rawServerData, renderRatingStars, renderStockBadge, syncWishlistButtons, toggleWishlistKey, getWishlist, resolveImageUrl, getCategoryTheme, bestSellerIds, applyProductBadge, getAppliedPromo, setAppliedPromo, clearAppliedPromo, getAppliedLoyalty, clearAppliedLoyalty, setPromoDiscounts, setupReveal } from './shared.js';
import { openModal, closeModal, initModalBehaviors } from './modals.js';
import { initRealtime, initPublicPulse } from './realtime.js';

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
let _lastTickerOrders = [];

function renderTickerItems() {
    const tickerZone = document.querySelector('.ticker-content');
    if (!tickerZone || _lastTickerOrders.length === 0) return;

    const itemsHtml = _lastTickerOrders.map(o => {
        const id = escapeHtml(String(o.orderId || '')).substring(0, 8);
        const name = escapeHtml(String(o.productName || ''));
        return `<span class="ticker-item"><i class="fas fa-check-circle" aria-hidden="true"></i><b>${id}</b><span class="ticker-name">${name}</span><em>${t('ticker_moment')}</em></span>`;
    }).join('<span class="ticker-sep" aria-hidden="true">✦</span>');

    tickerZone.innerHTML = `${itemsHtml} <span class="ticker-item trust">${t('trust_all_codes')}</span>`;
}

async function updateTrustTicker() {
    const tickerZone = document.querySelector('.ticker-content');
    if (!tickerZone) return;

    try {
        const res = await fetch('/api/products/latest-orders'); // سنفترض وجود هذا المسار البسيط
        const data = await res.json();
        if (data.success && data.orders.length > 0) {
            _lastTickerOrders = data.orders;
            renderTickerItems();
            enqueueSocialProof();
        }
    } catch (_e) {
        // في حال الفشل نترك النص الافتراضي الجميل الذي وضعناه
    }
}

// ======================================================
//  🔔 Social Proof — نبض اجتماعي حي (عمليات حقيقية من السجل)
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
//  ⭐ تقييمات المنتجات (مستوردة من shared.js)
// ======================================================

// ======================================================
//  ❤️ قائمة الأمنيات (Wishlist — localStorage)
// ======================================================

async function showWishlist() {
    const modal = document.getElementById('wishlistModal');
    const container = document.getElementById('wishlistGrid');
    if (!modal || !container) return;
    openModal(modal);
    const ids = getWishlist();

    if (ids.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; grid-column:1/-1; padding:30px;">💔 ${t('wishlist_empty')}</p>`;
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
        container.innerHTML = `<p style="color:#e74c3c; text-align:center; grid-column:1/-1; padding:30px;">❌ ${t('wishlist_load_error')}</p>`;
    }
}

// ======================================================
//  ⚙️ إعدادات الموقع (أرقام الدفع، روابط التواصل، الإحصائيات)
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

    // وسائل الدفع: إن لم تُضبط أرقام الحسابات، نخفي خيارات الدفع تماماً (لا نعرض أرقاماً وهمية)
    const payment = siteConfig.payment || {};
    const paymentOptionsEl = document.querySelector('.payment-options');
    const hasPaymentNumbers = Boolean(payment.jawwalNumber) || Boolean(payment.palpayNumber) || Boolean(payment.refaktNumber);
    if (paymentOptionsEl && !hasPaymentNumbers) {
        paymentOptionsEl.style.display = 'none';
    }

    // Stripe: نُظهر خيار الدفع بالبطاقة فقط عندما يكون مفعلاً في الخادم
    const stripeOption = document.getElementById('stripePaymentOption');
    if (stripeOption) {
        stripeOption.style.display = (siteConfig.stripe && siteConfig.stripe.enabled) ? 'flex' : 'none';
    }

    // إثبات المبيعات الحي: يُملأ من إحصائيات حقيقية من قاعدة البيانات
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

    // شريط الإحصائيات في أعلى الصفحة الرئيسية
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
 * عدّاد متحرك من صفر إلى القيمة المستهدفة (أثبات حي للإحصائيات).
 * @param {HTMLElement} el - العنصر الذي يظهر الرقم.
 * @param {number} from - قيمة البداية.
 * @param {number} to - القيمة المستهدفة.
 * @param {number} duration - مدة الحركة بالميلي ثانية.
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
//  🔍 تتبع الطلب
// ======================================================
// خط زمني من 3 خطوات لحالة الطلب (يُبنى كـ HTML وأسلاكه في style.css)
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

// عرض فشل/استرداد على الخط الزمني بالكامل (أحمر + ❌) دون صندوق الأكواد
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
            results.innerHTML = `<p style="color:#e74c3c; text-align:center;">❌ ${escapeHtml(data.error || t('track_error_generic'))}</p>`;
            return;
        }
        if (data.orders.length === 0) {
            results.innerHTML = `<p style="color:var(--text-muted); text-align:center;">🔍 ${t('track_no_results')}</p>`;
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
            const items = order.items.map(i => escapeHtml(i.name[lang] || i.name.ar)).join('، ');
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
        results.innerHTML = `<p style="color:#e74c3c; text-align:center;">❌ ${t('auth_error_connection')}</p>`;
    }
}

// ======================================================
//  💳 إيصال الطلب + استلام الأكواد لحظياً
//  يعرض رقم الطلب، ينتظر تأكيد الأدمن بالاستطلاع، ثم
//  يسلّم الأكواد مع زر نسخ وعدّاد يُخفيها بعد 15 دقيقة.
//  الأكواد تبقى محفوظة في تتبع الطلب حتى بعد إغلاق الصفحة.
// ======================================================
const RECEIPT_CODE_TTL = 15 * 60 * 1000; // 15 دقيقة من لحظة التسليم
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
        // أولوية النجاح: إن فشل التنفيذ نُبقي التحديد للنسخ اليدوي بـ Ctrl+C
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

    // بداية العدّاد = وقت اكتمال الطلب من الخادم (يثبت عبر إعادة فتح الصفحة)
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
            list.querySelectorAll('code').forEach(c => { c.textContent = '••••••••'; });
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
        codeEl.textContent = orderId || '—';
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
        } catch (_e) { /* أي خطأ شبكة في جولة ما يُعاد في الجولة القادمة */ }
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

// تحديث فوري للإيصال المفتوح عند وصول إشعار WebSocket لطلبٍ معني
window.addEventListener('joker-order-status', function(e) {
    const ctx = _receiptContext;
    const d = (e && e.detail) || {};
    if (ctx && d.orderId && String(d.orderId).toUpperCase() === String(ctx.orderId).toUpperCase() && _receiptPollFn) {
        _receiptPollFn();
    }
});

// نسخ الأكواد من الإيصال أو نافذة التتبع (تفويض)
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

    // استعادة العنوان الافتراضي عند مغادرة صفحة تفاصيل المنتج
    document.title = t('site_title');

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
        .then(function(data) { // 🔥 تصحيح: المتغير الآن هو 'data' الذي يحتوي على success و products
            if (!data.success || !data.products) {
                throw new Error(data.error || 'فشل في جلب البيانات');
            }

            _categoryProducts = data.products; // حفظ المنتجات للترتيب والفلترة
            productCache.clear(); // تفريغ الكاش قبل ملئه من جديد
            renderCategoryProducts(grid);
        }).catch(err => console.error("Error fetching products:", err));
}

// ======================================================
//  🏷️ بانر القسم الحالي
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
    // يُملأ بالعدد الحقيقي في renderCategoryProducts بعد اكتمال الجلب
    if (metaEl && countEl) countEl.textContent = '';
    if (iconEl) iconEl.className = (getCategoryTheme(categoryKey) || {}).icon || 'fas fa-gamepad';

    const accent = (getCategoryTheme(categoryKey) || {}).color || '#b8860b';
    banner.style.setProperty('--banner-accent', accent);
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

    // عدد البطاقات الظاهرة فعلياً (بعد فلترة المنطقة) لعرضه في بانر القسم
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

    visible.forEach(function(item, idx) {
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
        // شارة الأكثر مبيعاً في عرض القسم (كلاسيكية، لا تُطبّق على كل البطاقات)
        const badge = card.querySelector('.product-badge');
        if (badge) {
            applyProductBadge(badge, { productId: clientItem.id });
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
    allBtn.textContent = t('filter_all');
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
        { key: 'all', text: t('filter_all'), icon: null },
        { key: 'global', text: t('filter_global'), icon: '🌐' },
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

    products.forEach((item, idx) => {
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
//  العودة للرئيسية
// ======================================================
function goBack() {
    // حذف القسم المحفوظ عند العودة للصفحة الرئيسية
    localStorage.removeItem('joker_lastCategory');

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    showAllCategories();
    // العودة لأعلى الصفحة بعد إظهار الرئيسية
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
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
            // ملء مجموعة معرّفات الأكثر مبيعاً حتى تحافظ البطاقات على شارتها في كل الأقسام
            bestSellerIds.clear();
            (Array.isArray(data.products) ? data.products : []).forEach(p => {
                const pid = String(p._id || p.id || '');
                if (pid) bestSellerIds.add(pid);
            });
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

// ======================================================
//  🎁 قسم "عروض جاهزة الشحن" — بيانات حقيقية من /api/promotions
// ======================================================
const _promoProducts = new Map(); // معرّف المنتج ← clientItem (لفتح التفاصيل)

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
        // تعبئة خريطة الخصومات لشارة المنتج
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

// تفاعلات قسم العروض (فتح تفاصيل منتج + تصفح القسم)
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

// حقل كود الخصم في نافذة السلة (تطبيق/إزالة + تغذية راجعة فورية)
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
            // نرسل كل منتجات السلة — الخادم يرفض الكود إن لم ينطبق على جميعها
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
//  💬 قسم "قالوا عنا" — سلايدر التقييمات (بيانات حقيقية)
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
    if (slider && slider.matches(':hover')) return; // إيقاف مؤقت أثناء مرور الماوس
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

    // إيقاف التشغيل التلقائي عند التمرير/التركيز واستئنافه عند المغادرة
    slider.addEventListener('mouseenter', _stopTestimonialsAuto);
    slider.addEventListener('mouseleave', _restartTestimonialsAuto);
    slider.addEventListener('focusin', _stopTestimonialsAuto);
    slider.addEventListener('focusout', _restartTestimonialsAuto);

    // إعادة حساب حجم الصفحة عند تغيير عرض النافذة
    let resizeRaf = null;
    window.addEventListener('resize', () => {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = null;
            _updateTestimonialsTransform();
        });
    });

    // عند عودة القسم إلى الشاشة (مثلاً بعد تصفح قسم) نعيد ضبط الموضع
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
 * تاريخ نسبي قصير محلي ("منذ X"/"X ago") عبر Intl.RelativeTimeFormat.
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

    // احتياطي: تاريخ قصير فقط
    return date.toLocaleDateString(locale === 'en' ? 'en-GB' : 'ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * جلب وعرض تقييمات العملاء في القسم الرئيسي.
 * إذا لم توجد تقييمات يُخفى القسم كاملاً (لا مكان فارغ).
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
        // فشل الجلب → يُبقى القسم مخفياً (لا نعرض أي محتوى وهمي)
    }
}

/**
 * يعالج حدث تغيير اللغة، ويقوم بجلب بيانات الأقسام والمنتجات وعرضها باللغة الجديدة.
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

            // تحديث كل المقاطع الديناميكية للغة الجديدة
            productCache.clear();          // تفريغ الكاش حتى تُعرض التفاصيل باللغة الجديدة
            renderBestSellingProducts();   // إعادة عرض "الأكثر مبيعاً"
            renderNewlyAddedProducts();    // إعادة عرض "وصل حديثاً"
            renderPromotions();            // إعادة عرض "عروض جاهزة الشحن"
            renderTestimonials();          // إعادة عرض "قالوا عنا"

            const grid = document.getElementById('mainCategories');
            const inCategoryView = grid && grid.classList.contains('products-grid');
            if (inCategoryView) {
                // إعادة جلب وعرض منتجات القسم الحالي باللغة الجديدة
                selectCategory(_currentCategoryKey || 'all');
            } else if (!isProductDeepLink()) {
                showAllCategories(); // عرض الأقسام الرئيسية بعد جلبها
            } else {
                handleProductDeepLink(); // إعادة عرض تفاصيل المنتج باللغة الجديدة
            }
        }
        // إعادة تطبيق إعدادات الموقع حتى تتحدث ترجمة إثبات المبيعات والشارات
        applySiteConfig();
    } catch (error) {
        console.error("Failed to reload dynamic categories:", error);
    }
    renderTickerItems(); // إعادة عرض شريط الثقة باللغة الجديدة
}

// هل نحن داخل رابط عميق مباشر لمنتج؟
function isProductDeepLink() {
    return /^\/product\/[a-fA-F0-9]{24}\/?$/.test(window.location.pathname);
}

/**
 * فتح رابط عميق مباشر للمنتج عند فتح صفحة /product/:id (SEO + مشاركة).
 * يبحث المنتج في فهرس البحث، وإن لم يجده يجلب بياناته من الخادم مباشرة
 * (fallback) حتى لا يفشل الرابط العميق بصمت أبداً.
 * عند إعادة الاستدعاء (مثلاً بعد تغيير اللغة) يُعاد العرض من الكاش
 * دون إعادة جلب إضافية من الخادم.
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

    // إعادة الاستدعاء لنفس المنتج → إعادة العرض من الكاش دون إعادة جلب
    if (deepLinkProductData && String(deepLinkProductData._id) === productId) {
        const lang = getCurrentLanguage();
        const localizedName = deepLinkProductData.productName[lang] || deepLinkProductData.productName['ar'] || '';
        const clientItem = formatItem({ ...deepLinkProductData, name: localizedName }, deepLinkProductData.category, detectRegion(deepLinkProductData));
        showProductDetails(clientItem, deepLinkProductData.category);
        return;
    }

    // المنتج غير موجود في فهرس البحث → جلب مباشر من الخادم (لا فشل صامت).
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
    // تحميل الترجمات، وإطلاق حدث 'languageChanged'. ننتظر اكتماله قبل
    // عرض المحتوى الديناميكي لضمان ترجمته باللغة الصحيحة منذ البداية.
    await initI18n(); 

    // 2. المستمع لحدث 'languageChanged' (المُسجَّل أعلاه ويُطلق أثناء initI18n)
    //    هو المسؤول الوحيد عن جلب الأقسام وعرض أزرار الفلترة والمقاطع الرئيسية
    //    (الأكثر مبيعاً، وصل حديثاً، "قالوا عنا") — لا نكرر الاستدعاءات هنا.
    // 3. باقي عمليات التهيئة التي لا تعتمد على اللغة.
    initToastContainer(); // تهيئة حاوية الإشعارات
    initHeroSlider(); // تشغيل السلايدر

    // 🚀 جلب فهرس البحث (مرة واحدة فقط هنا) — يُستخدم للبحث السريع وللروابط العميقة
    await loadSearchIndex();

    // 🚀 فتح رابط عميق مباشر للمنتج (تحسين SEO + قابلية مشاركة الروابط)
    await handleProductDeepLink();

    initAuth(); 
    initRealtime(); // إشعارات لحظية لحالة الطلبات للمستخدمين المسجلين
    initPublicPulse(); // نبض حي حقيقي — طلب مكتمل يظهر لكل الزوار فوراً
    updateTrustTicker(); // تحديث شريط الثقة
    setInterval(updateTrustTicker, 45000); // تحديث دوري للشريط + تغذية social proof
    setupReveal(document); // ظهور متدرّج لعناوين الأقسام وبطاقاتها الثابتة
    renderPromotions(); // عرض قسم "عروض جاهزة الشحن"

    // ⚙️ جلب إعدادات الموقع (أرقام الدفع، السوشيال، الإحصائيات) قبل ربط الأحداث
    await fetchSiteConfig();
    applySiteConfig();
    
    updateCartUI(); // تحديث السلة فور فتح الصفحة

    setupEventListeners();
    syncWishlistButtons(); // تفعيل أزرار الأمنيات بعد أول عرض
    initModalBehaviors(); // إغلاق النوافذ بالخلفية/زر الإغلاق + التبويب
    initPromoSectionInteractions(); // تفاعلات بطاقات العروض
    initPromoInput(); // حقل كود الخصم في نافذة السلة
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
    // إغلاق السلة ونافذة الكود يعتمد على [data-close-modal] عبر initModalBehaviors
    // (يُغلق عبر closeModal — ينظف aria-modal وفخّ التبويب وقفل التمرير)
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

    // إيقاف الاستطلاع/العدّاد عند إغلاق إيصال الطلب
    const receiptOverlay = document.getElementById('codeModal');
    if (receiptOverlay) {
        receiptOverlay.addEventListener('click', function(e) {
            if (e.target.closest('[data-close-modal]') || e.target === receiptOverlay) {
                stopReceiptPolling();
                stopReceiptCountdown();
            }
        });
    }

    // صائد ضغطات الكروت والدخول للسلة
    document.getElementById('mainCategories').addEventListener('click', function(e) {
        if (e.target.closest('[data-wishlist-btn]')) return; // لا تفتح التفاصيل عند ضغط زر الأمنيات
        if (e.target.closest('[data-quick-add]')) return; // لا تفتح التفاصيل عند ضغط زر الإضافة السريعة
        
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

            // إظهار skeleton loading بينما البحث
            renderLoadingSkeleton();

            debounceTimer = setTimeout(() => {
                const lang = getCurrentLanguage();
                const lowerCaseQuery = query.toLowerCase();

                // --- ✨ بحث موحد + فلترات فئة/سعر/تقييم ---
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
    // فلترات البحث الذكي
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
    // إثبات الدفع — معاينة الصورة
    (function initPaymentProof(){
        const input=document.getElementById('paymentProofInput');
        const preview=document.getElementById('paymentProofPreview');
        const img=document.getElementById('paymentProofImg');
        const removeBtn=document.getElementById('removeProofBtn');
        if(!input) return;
        input.addEventListener('change', async()=>{
            const file=input.files?.[0];
            if(!file || !file.type.startsWith('image/')) return;
            if(file.size>5*1024*1024){ showToast('حجم الصورة كبير (5MB max)','error'); input.value=''; return; }
            const form=new FormData(); form.append('image', file);
            try{
                const res=await fetch('/api/upload/review-image',{method:'POST', body:form});
                const data=await res.json();
                if(data.success && data.url){
                    paymentProofUrl=data.url;
                    if(img) img.src=data.url;
                    if(preview) preview.style.display='flex';
                    showToast('تم رفع صورة الإثبات','success');
                }else{ showToast(data.error||'فشل الرفع','error'); }
            }catch(_e){ showToast('فشل الرفع','error'); }
        });
        if(removeBtn) removeBtn.addEventListener('click',()=>{ paymentProofUrl=null; if(preview) preview.style.display='none'; if(img) img.src=''; input.value=''; });
    })();

    // فتح السلة عبر زر الهيدر
    const cartHeaderBtn = document.getElementById('cartHeaderBtn');
    const openPurchaseCheckout = function() {
        // تحسين تجربة المستخدم: تعبئة الإيميل تلقائياً إذا كان مسجلاً دخوله
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

    // شريط السلة الثابت للجوال (زر إتمام الشراء + منطقة معلومات السلة)
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
    //  خطوات الشراء (بيانات ← دفع ← استلام)
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

        if (checkoutStep === 3) updateCartUI(); // تحديث ملخص المراجعة قبل الظهور
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

    // تغيير المحافظ ديناميكياً داخل المودال
    const paymentOptionsContainer = document.querySelector('.payment-options');
    const instructionsZone = document.getElementById('paymentInstructions');

    const updatePaymentInstructions = (method) => {
        if (!instructionsZone) return;
        const payment = siteConfig?.payment || {};
        const jawwal = payment.jawwalNumber || '';
        const palpay = payment.palpayNumber || '';
        const refakt = payment.refaktNumber || jawwal || '';
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

            if (!email) { showToast(t('checkout_email_required'), 'error'); return; }
            if (gateway !== 'stripe' && !paymentRef) { showToast(t('checkout_ref_required'), 'error'); return; }
            if (cart.length === 0) { showToast(t('checkout_cart_empty'), 'error'); return; }

            // تجهيز مصفوفة المنتجات لكي يستلمها السيرفر دفعة واحدة
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
                // الجلسة تُرسل تلقائياً عبر HttpOnly cookie (لا حاجة لتخزين توكن في localStorage)
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
                    cart.length = 0; // تفريغ المصفوفة
                    localStorage.removeItem('joker_cart');
                    clearAppliedPromo(); // إزالة كود الخصم بعد إتمام الطلب
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
                    showToast(`❌ ${escapeHtml(result.error || t('checkout_error_generic'))}`, 'error');
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

    // زر الـ Hero — العودة للرئيسية والتمرير للأقسام
    document.addEventListener('click', function(e) {
        const cta = e.target.closest('[data-hero-cta]');
        if (!cta) return;
        goBack();
        const target = document.getElementById('mainCategories');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // زر العودة إلى الأعلى
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

    // أزرار الأمنيات (تفويض)
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('[data-wishlist-btn]');
        if (!btn) return;
        e.preventDefault();
        const id = btn.dataset.productId;
        if (!id) return;
        const added = toggleWishlistKey(id);
        showToast(added ? t('wishlist_added') : t('wishlist_removed'), added ? 'success' : 'info');
    });

    // زر "إضافة سريعة" (+)
    document.addEventListener('click', function(e) {
        const addBtn = e.target.closest('[data-quick-add]');
        if (!addBtn) return;
        e.preventDefault();
        e.stopPropagation();
        const id = addBtn.dataset.productId;
        if (!id) return;
        const item = productCache.get(id);
        if (!item) return;
        // المخزون غير معروف (خارجي) → يُعتبر متوفراً؛ النفاذ فقط عندما يكون رقماً معروفاً ≤ 0
        if (item.availableStock !== null && item.availableStock !== undefined && Number(item.availableStock) <= 0) {
            showToast(t('stock_out'), 'error');
            return;
        }
        addToCart(item); // addToCart يعرض إشعار "cart_added" بنفسه ولا حاجة لإشعار مكرر
        addBtn.classList.add('added');
        const label = addBtn.querySelector('i');
        if (label) label.classList.replace('fa-plus', 'fa-check');
        setTimeout(() => {
            addBtn.classList.remove('added');
            if (label) label.classList.replace('fa-check', 'fa-plus');
        }, 1400);
    });

    // تأثير 3D خفيف عند مرور الفأرة على الكرت
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

    // تحديث نافذة التتبع تلقائياً عند تغيّر حالة طلب عبر WebSocket (من realtime.js)
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

    // فتح/إغلاق نافذة قائمة الأمنيات
    const wishlistFooterBtn = document.getElementById('wishlistFooterBtn');
    const wishlistModal = document.getElementById('wishlistModal');
    if (wishlistFooterBtn && wishlistModal) {
        wishlistFooterBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showWishlist();
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
