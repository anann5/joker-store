import { getCurrentLanguage, t, isI18nReady } from '/i18n.js';

const SUGGESTED_CATEGORIES = [
    { key: 'pubg', icon: 'fas fa-crosshairs', labelKey: 'menu_pubg_btn' },
    { key: 'steam', icon: 'fab fa-steam', labelKey: 'menu_steam_btn' },
    { key: 'playstation', icon: 'fab fa-playstation', labelKey: 'menu_playstation_btn' },
    { key: 'fortnite', icon: 'fas fa-gun', labelKey: 'menu_fortnite_btn' }
];

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function renderEmptyState(container) {
    const suggestions = SUGGESTED_CATEGORIES.map(item => `
        <a class="empty-suggestion" href="/?category=${escapeHtml(item.key)}">
            <i class="${item.icon}" aria-hidden="true"></i>
            <span>${escapeHtml(t(item.labelKey))}</span>
        </a>
    `).join('');

    container.innerHTML = `
        <div class="empty-state offers-empty">
            <div class="empty-state-icon"><i class="fas fa-tags" aria-hidden="true"></i></div>
            <h3>${escapeHtml(t('offers_empty_title'))}</h3>
            <p>${escapeHtml(t('offers_empty_sub'))}</p>
            <div class="empty-state-actions">
                <a class="enter-btn" href="/"><i class="fas fa-store" aria-hidden="true"></i> <span>${escapeHtml(t('offers_empty_browse'))}</span></a>
                <a class="enter-btn ghost" href="/contact"><i class="fas fa-headset" aria-hidden="true"></i> <span>${escapeHtml(t('offers_empty_contact'))}</span></a>
            </div>
            <p class="empty-suggestions-title">${escapeHtml(t('offers_suggestions_title'))}</p>
            <div class="empty-state-suggestions">${suggestions}</div>
        </div>
    `;
}

function renderErrorState(container) {
    container.innerHTML = `
        <div class="empty-state offers-empty">
            <div class="empty-state-icon"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i></div>
            <h3>${escapeHtml(t('offers_load_failed'))}</h3>
            <div class="empty-state-actions">
                <button type="button" class="enter-btn" id="offersRetryBtn"><i class="fas fa-rotate-right" aria-hidden="true"></i> <span>${escapeHtml(t('offers_retry'))}</span></button>
            </div>
        </div>
    `;
    container.querySelector('#offersRetryBtn')?.addEventListener('click', () => loadOffers());
}

async function loadOffers() {
    const container = document.getElementById('offersContainer');
    if (!container) return;
    try {
        const res = await fetch('/api/promotions');
        const data = await res.json();
        if (!data.success || !data.promotions || data.promotions.length === 0) {
            renderEmptyState(container);
            return;
        }
        const lang = getCurrentLanguage();
        container.innerHTML = data.promotions.map(promo => {
            const title = promo.title?.[lang] || promo.title?.ar || '';
            const desc = promo.description?.[lang] || promo.description?.ar || '';
            const discount = promo.discountPercent || 0;
            const expiresAt = promo.expiresAt ? new Date(promo.expiresAt) : null;
            const products = promo.products || [];
            return `
                <div class="promo-block">
                    <div class="promo-block-inner">
                        <div class="promo-head">
                            <span class="promo-discount-pill">-${discount}%</span>
                            <h3 class="promo-block-title">${escapeHtml(title)}</h3>
                        </div>
                        ${desc ? `<p class="promo-block-desc">${escapeHtml(desc)}</p>` : ''}
                        ${expiresAt ? `<p class="promo-expiry"><i class="fas fa-clock" aria-hidden="true"></i> ${escapeHtml(t('offers_ends'))} ${expiresAt.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</p>` : ''}
                        ${products.length > 0 ? `
                            <div class="products-grid promo-products-grid">
                                ${products.map(p => {
                                    const name = p.productName?.[lang] || p.productName?.ar || '';
                                    const salePrice = p.salePrice || p.price;
                                    return `
                                        <div class="product-item-card promo-product-tile" data-product-id="${escapeHtml(p._id)}">
                                            <img src="${escapeHtml(p.image || '/image/logo.png')}" alt="${escapeHtml(name)}" loading="lazy" decoding="async">
                                            <div class="promo-product-name">${escapeHtml(name)}</div>
                                            <div class="promo-price-row">
                                                <span class="promo-sale-price">${Number(salePrice).toFixed(2)} ₪</span>
                                                ${p.price !== salePrice ? `<span class="promo-old-price">${Number(p.price).toFixed(2)} ₪</span>` : ''}
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        container.querySelectorAll('[data-product-id]').forEach(el => {
            el.addEventListener('click', () => { window.location.href = `/product/${el.dataset.productId}`; });
        });
    } catch (_err) {
        renderErrorState(container);
    }
}

let offersStarted = false;
function startOffers() {
    if (offersStarted) return;
    offersStarted = true;
    loadOffers();
}

if (isI18nReady()) {
    startOffers();
} else {
    window.addEventListener('languageChanged', startOffers, { once: true });
    // شبكة أمان: لا نترك الصفحة عالقة إن تعذّر تحميل ملف الترجمة
    setTimeout(startOffers, 1200);
}

const btt = document.getElementById('backToTop');
if (btt) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) btt.classList.add('is-visible');
        else btt.classList.remove('is-visible');
    }, { passive: true });
    btt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// روابط التواصل في الفوتر + زر واتساب العائم من إعدادات الموقع
fetch('/api/site-config')
    .then(r => r.json())
    .then(d => {
        const social = d?.siteConfig?.social || {};
        const wa = social.whatsapp;
        const waBtn = document.getElementById('whatsappFloatBtn');
        if (wa && waBtn) {
            waBtn.href = `https://wa.me/${String(wa).replace(/[^0-9]/g, '')}`;
            waBtn.style.display = 'flex';
        }
        const socialMap = {
            footerWhatsapp: 'whatsapp',
            footerTelegram: 'telegram',
            footerInstagram: 'instagram',
            footerTiktok: 'tiktok'
        };
        for (const [id, key] of Object.entries(socialMap)) {
            const link = document.getElementById(id);
            const value = social[key];
            if (!link || !value) continue;
            link.href = key === 'whatsapp'
                ? `https://wa.me/${String(value).replace(/[^0-9]/g, '')}`
                : (/^https?:\/\//.test(value) ? value : `https://${value}`);
            link.style.display = 'flex';
        }
    })
    .catch(() => {});
