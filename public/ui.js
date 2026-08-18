import { rawServerData, renderRatingStars, renderStockBadge, syncWishlistButtons, resolveImageUrl, getCategoryTheme, applyProductBadge, cartTotals, getAppliedPromo } from './shared.js';
import { formatPrice } from './currency.js';
import { t, getCurrentLanguage } from './i18n.js';

let toastContainer = null;

/**
 * تهريب القيم لإدراجها بأمان في HTML (منع XSS).
 */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * تجهيز صورة الكرت: يربط حالة "تحميل الصورة" لإيقاف الـ shimmer عند اكتمالها.
 * @param {HTMLImageElement} img - عنصر الصورة داخل بطاقة منتج.
 */
export function bindCardImageState(img) {
    if (!img) return;
    const container = img.closest('.card-img-container');
    if (!container) return;
    const done = () => container.classList.add('img-loaded');
    if (img.complete && img.naturalWidth > 0) done();
    else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
    }
}

/**
 * إظهار/إخفاء شريط الضمانات داخل منطقة القسم والمنتجات.
 * @param {boolean} visible
 */
export function setGuaranteeStripVisible(visible) {
    const strip = document.getElementById('trustGuardStrip');
    if (strip) strip.hidden = !visible;
}

/**
 * دالة لمشاركة المنتج على وسائل التواصل الاجتماعي.
 * تستخدم Web Share API إذا كانت متاحة، أو توفر خياراً احتياطياً.
 * @param {object} product - بيانات المنتج للمشاركة.
 */
export function shareProduct(product) {
    const pageUrl = window.location.href; // مشاركة رابط الصفحة الحالية
    const shareText = t('share_text').replace('{name}', product.name);

    if (navigator.share) {
        navigator.share({
            title: product.name,
            text: shareText,
            url: pageUrl,
        }).then(() => {
            console.log('Product shared successfully');
        }).catch((error) => {
            console.error('Error sharing product:', error);
        });
    } else {
        // خيار احتياطي للمتصفحات التي لا تدعم Web Share API
        // يمكن إضافة المزيد من خيارات المشاركة هنا (تويتر، واتساب، إلخ)
        const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}&quote=${encodeURIComponent(shareText)}`;
        const shareWindow = window.open(facebookUrl, '_blank', 'width=600,height=400');
        if (shareWindow) shareWindow.focus();
        else showToast(t('share_popup_required'), 'info');
    }
}

/**
 * تهيئة حاوية الإشعارات.
 */
export function initToastContainer() {
    if (!document.getElementById('toast-container')) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = 'position:fixed; top:20px; left:20px; z-index:10000; display:flex; flex-direction:column; gap:10px;';
        document.body.appendChild(toastContainer);
    } else {
        toastContainer = document.getElementById('toast-container');
    }
}

/**
 * عرض إشعار منبثق (Toast).
 * @param {string} message - الرسالة.
 * @param {string} type - النوع (success, error, info).
 */
export function showToast(message, type = 'info') {
    if (!toastContainer) initToastContainer();

    const toast = document.createElement('div');
    toast.className = `neon-toast toast-${type}`;
    const header = document.createElement('div');
    header.className = 'toast-header';
    header.textContent = type.toUpperCase();
    const body = document.createElement('div');
    body.textContent = message;
    toast.append(header, body);

    // تحديد لون الشريط الجانبي بناءً على النوع
    const colors = { success: '#2ecc71', error: '#e74c3c', info: '#3498db' };
    toast.style.borderLeft = `4px solid ${colors[type] || colors.info}`;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
}

/**
 * عرض جميع الأقسام الرئيسية.
 */
export function showAllCategories() {
    const grid = document.getElementById('mainCategories');
    if (!grid) return;

    // إعادة الرابط إلى الواجهة الرئيسية عند العودة للأقسام
    if (history.replaceState && window.location.pathname.startsWith('/product/')) {
        history.replaceState(null, '', '/');
    }

    const homeSections = document.getElementById('homeSections');
    if (homeSections) homeSections.classList.remove('hidden');

    grid.className = '';
    grid.removeAttribute('style');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:30px;';

    const backContainer = document.getElementById('back-container');
    if (backContainer) backContainer.style.display = 'none';

    const regionBar = document.getElementById('regionFilterBar');
    if (regionBar) regionBar.style.display = 'none';

    const toolbar = document.getElementById('categoryToolbar');
    if (toolbar) toolbar.classList.add('hidden');

    const categoryBanner = document.getElementById('categoryBanner');
    if (categoryBanner) categoryBanner.hidden = true;
    setGuaranteeStripVisible(false);

    document.querySelectorAll('#filterTabs .filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('#filterTabs .filter-btn[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');

    const template = document.getElementById('category-card-template');
    grid.innerHTML = ''; // تفريغ المحتوى قبل الإضافة

    Object.entries(rawServerData.categories).forEach(([key, cat], idx) => {
        const card = template.content.cloneNode(true);
        const cardElement = card.querySelector('.category-card');
        cardElement.dataset.category = key;
        cardElement.style.setProperty('--i', String(idx));
        const theme = getCategoryTheme(key);
        cardElement.style.setProperty('--cat-color', theme.color);
        card.querySelector('img').src = resolveImageUrl(cat.image);
        card.querySelector('img').alt = cat.title;
        card.querySelector('h3').textContent = cat.title;
        card.querySelector('p').textContent = cat.desc;
        card.querySelector('.enter-btn').dataset.category = key;
        grid.appendChild(card);
    });
}

/**
 * عرض تفاصيل المنتج.
 * @param {object} product - بيانات المنتج.
 */
export function showProductDetails(product, currentCategory = '') {
    const grid = document.getElementById('mainCategories');
    if (!grid) return;

    const homeSections = document.getElementById('homeSections');
    if (homeSections) homeSections.classList.add('hidden');

    const toolbar = document.getElementById('categoryToolbar');
    if (toolbar) toolbar.classList.add('hidden');

    setGuaranteeStripVisible(true);

    // استخدام القالب الجاهز من HTML
    const template = document.getElementById('product-details-template');
    if (!template) {
        console.error('Product details template not found!');
        return;
    }

    // 🔥 نقل تعريف الدالة إلى هنا، حيث يتم استخدامها فقط
    const renderRelatedProducts = async (productId) => {
        const relatedContainer = view.querySelector('#related-products-grid');
        if (!relatedContainer) return;

        relatedContainer.innerHTML = `<div class="loader-container" style="grid-column:1/-1; text-align:center; padding:40px 0;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-neon);"></i></div>`;

        try {
            const lang = (await import('./i18n.js')).getCurrentLanguage();
            const res = await fetch(`/api/products/related/${productId}?lang=${lang}`);
            const data = await res.json();

            if (data.success && data.products.length > 0) {
                relatedContainer.innerHTML = '';
                const productCardTemplate = document.getElementById('product-card-template');
                const { productCache, formatItem, detectRegion, getRegionDetails } = await import('./script.js');

                data.products.forEach((item, idx) => {
                    const localizedName = item.productName[lang] || item.productName['ar'];
                    const detectedRegion = detectRegion(item);
                    const regionInfo = getRegionDetails(detectedRegion);
                    const clientItem = formatItem({ ...item, name: localizedName }, item.category, detectedRegion);

                    productCache.set(clientItem.id, clientItem);

                    const card = productCardTemplate.content.cloneNode(true);
                    const cardElement = card.querySelector('.product-item-card');
                    cardElement.dataset.productId = clientItem.id;
                    cardElement.dataset.region = detectedRegion;
                    cardElement.style.setProperty('--i', String(idx));
                    card.querySelector('.card-flag-badge').innerHTML = regionInfo.isIcon ? '<i class="fas fa-globe"></i>' : `<img src="${regionInfo.flagUrl}" />`;
                    const imgElement = card.querySelector('.card-inner-img');
                    imgElement.src = clientItem.image;
                    imgElement.onerror = () => { imgElement.src = '/image/logo.png'; }; // Fallback image
                    bindCardImageState(imgElement);
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
                        applyProductBadge(badge, { productId: clientItem.id });
                    }
                    relatedContainer.appendChild(card);
                });
                syncWishlistButtons();
            } else {
                relatedContainer.parentElement.style.display = 'none';
            }
        } catch (error) {
            console.error("Failed to render related products:", error);
            relatedContainer.parentElement.style.display = 'none';
        }
    };

    const view = template.content.cloneNode(true);

    // ملء القالب ببيانات المنتج
    const detailImgElement = view.querySelector('.detail-img');
    detailImgElement.src = resolveImageUrl(product.image) || resolveImageUrl(`image/${currentCategory || 'all'}.png`);
    detailImgElement.onerror = () => { detailImgElement.src = '/image/logo.png'; }; // Fallback image
    view.querySelector('.detail-img').alt = product.name;
    view.querySelector('.product-name').textContent = product.name;
    view.querySelector('.product-price').textContent = formatPrice(product.price);
    const ratingZone = view.querySelector('[data-rating]');
    if (ratingZone) {
        ratingZone.innerHTML = renderRatingStars(product.rating, product.reviewsCount);
    }
    const wishlistBtn = view.querySelector('[data-wishlist-btn]');
    if (wishlistBtn) {
        wishlistBtn.dataset.productId = product.id;
        wishlistBtn.classList.toggle('active', (JSON.parse(localStorage.getItem('joker_wishlist') || '[]') || []).includes(String(product.id)));
        if (wishlistBtn.classList.contains('active')) wishlistBtn.querySelector('i').className = 'fas fa-heart';
    }
    const regionSpan = view.querySelector('.product-region');
    if (regionSpan) {
        regionSpan.textContent = product.region;
    }

    // عرض الوصف الحقيقي من قاعدة البيانات (إن وُجد)
    const descriptionEl = view.querySelector('[data-detail-description]');
    if (descriptionEl && product.description && product.description.trim()) {
        descriptionEl.textContent = product.description;
    }
    
    // إضافة منطق لزر "إضافة للسلة"
    const buyButton = view.querySelector('.buy-btn');
    buyButton.addEventListener('click', async () => {
        // هنا يجب استيراد دالة addToCart من cart.js
        // ونفترض أنها موجودة في النطاق
        const { addToCart } = await import('./cart.js');
        addToCart(product);
    });

    // إضافة منطق لزر "مشاركة المنتج"
    const shareButton = view.querySelector('.share-btn');
    if (shareButton) {
        shareButton.addEventListener('click', () => shareProduct(product));
    }

    // إضافة منطق لزر "العودة"
    const backButton = view.querySelector('.back-to-main-btn');
    backButton.addEventListener('click', async () => {
        const { selectCategory } = await import('./script.js');
        selectCategory(currentCategory);
    });

    // === نظام التقييمات (رجوع 1-5 + تعليق + عرض التقييمات) ===
    const renderProductReviews = async (productId, container) => {
        const reviewsContainer = container || view.querySelector('#product-reviews-list');
        if (!reviewsContainer) return;
        try {
            const res = await fetch(`/api/products/${productId}/reviews`);
            const data = await res.json();
            if (!data.success || !Array.isArray(data.reviews) || data.reviews.length === 0) {
                reviewsContainer.innerHTML = `<div class="reviews-empty">${t('reviews_empty')}</div>`;
                return;
            }
            reviewsContainer.innerHTML = data.reviews.map(review => `
                <div class="review-item">
                    <div class="review-meta">
                        ${renderRatingStars(review.rating, 0)}
                        <span class="review-date">${new Date(review.createdAt).toLocaleDateString(getCurrentLanguage() === 'en' ? 'en-US' : 'ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                    ${review.comment ? `<p class="review-comment">${escapeHtml(review.comment)}</p>` : ''}
                </div>
            `).join('');
        } catch (_err) {
            reviewsContainer.innerHTML = `<div class="reviews-empty">${t('reviews_load_error')}</div>`;
        }
    };

    const reviewStars = view.querySelector('[data-review-stars]');
    const reviewComment = view.querySelector('[data-review-comment]');
    const reviewSubmitBtn = view.querySelector('.review-submit-btn');
    let selectedRating = 0;

    const updateStarDisplay = () => {
        if (!reviewStars) return;
        reviewStars.querySelectorAll('i').forEach(star => {
            const value = Number(star.dataset.star);
            star.className = value <= selectedRating ? 'fas fa-star star-active' : 'far fa-star';
        });
    };
    if (reviewStars) {
        reviewStars.querySelectorAll('i').forEach(star => {
            star.addEventListener('click', () => {
                selectedRating = Number(star.dataset.star);
                updateStarDisplay();
            });
        });
    }
    if (reviewSubmitBtn) {
        reviewSubmitBtn.addEventListener('click', async () => {
            if (selectedRating < 1) {
                showToast(t('review_select_first'), 'error');
                return;
            }
            reviewSubmitBtn.disabled = true;
            try {
                const res = await fetch(`/api/products/${product.id}/review`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rating: selectedRating, comment: reviewComment ? reviewComment.value : '' })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(data.message || t('review_thanks'), 'success');
                    selectedRating = 0;
                    if (reviewStars) updateStarDisplay();
                    if (reviewComment) reviewComment.value = '';
                    renderProductReviews(product.id);
                    const ratingZoneEl = view.querySelector('[data-rating]');
                    if (ratingZoneEl && data.rating) {
                        ratingZoneEl.innerHTML = renderRatingStars(data.rating, data.reviewsCount);
                    }
                } else {
                    showToast(`❌ ${escapeHtml(data.error || data.message || t('review_failed'))}`, 'error');
                }
            } catch (_err) {
                showToast(t('review_error'), 'error');
            } finally {
                reviewSubmitBtn.disabled = false;
            }
        });
    }
    renderProductReviews(product.id);

    grid.className = 'product-details-wrapper';
    grid.innerHTML = ''; // تفريغ الشبكة أولاً
    grid.appendChild(view);

    // بعد عرض المنتج، نقوم بجلب وعرض المنتجات ذات الصلة
    renderRelatedProducts(product.id);

    // تحديث عنوان الرابط ليتوافق مع المنتج (رابط قابل للمشاركة/الفهرسة)
    if (history.replaceState && product.id) {
        history.replaceState(null, '', `/product/${product.id}`);
    }
}

// تحديث واجهة السلة: العدّاد + قائمة العناصر + المجموع الإجمالي
export function updateCartUI() {
    const items = JSON.parse(localStorage.getItem('joker_cart') || '[]');
    const badge = document.getElementById('cartCountBadge');
    const list = document.getElementById('cartItemsList');
    const totalEl = document.getElementById('cartTotalAmount');

    const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
    if (badge) {
        badge.textContent = String(totalQty);
        badge.classList.toggle('has-items', totalQty > 0);
    }

    if (list) {
        if (items.length === 0) {
            list.innerHTML = `<p style="text-align:center; color: var(--text-muted); padding: 20px 0;">${t('cart_empty')}</p>`;
        } else {
            list.innerHTML = items.map((item, index) => `
                <div class="cart-item">
                    <div class="cart-item-details">
                        <span class="cart-item-name">${escapeHtml(item.name)}</span>
                        <span class="cart-item-price">${formatPrice(item.price)}</span>
                    </div>
                    <button type="button" class="cart-qty-btn" data-cart-dec="${index}" aria-label="${t('cart_decrease')}">−</button>
                    <input type="text" class="cart-item-qty" value="${Number(item.qty) || 1}" readonly>
                    <button type="button" class="cart-qty-btn" data-cart-inc="${index}" aria-label="${t('cart_increase')}">+</button>
                    <button type="button" class="cart-item-remove" data-cart-remove="${index}" aria-label="${t('cart_remove')}">×</button>
                </div>`).join('');
        }
    }

    const totals = cartTotals(items);
    if (totalEl) totalEl.textContent = formatPrice(totals.total);

    // صف الخصم في الخطوة 1 (يظهر فقط عند وجود كود مطبّق)
    const cartDiscountRow = document.getElementById('cartDiscountRow');
    const cartDiscountLabel = document.getElementById('cartDiscountLabel');
    const cartDiscountAmount = document.getElementById('cartDiscountAmount');
    const promo = getAppliedPromo();
    if (cartDiscountRow && cartDiscountLabel && cartDiscountAmount) {
        if (promo && totals.discount > 0) {
            cartDiscountRow.hidden = false;
            cartDiscountLabel.textContent = t('cart_discount').replace('{code}', promo.code || '');
            cartDiscountAmount.textContent = `-${formatPrice(totals.discount)}`;
        } else {
            cartDiscountRow.hidden = true;
        }
    }

    // ملخص المراجعة (الخطوة 3) — قائمة قراءة فقط
    const reviewList = document.getElementById('cartReviewList');
    if (reviewList) {
        reviewList.innerHTML = items.length === 0
            ? ''
            : items.map(item => `
                <div class="review-cart-item">
                    <span class="review-cart-name">${escapeHtml(item.name)}</span>
                    <span class="review-cart-qty">× ${Number(item.qty) || 1}</span>
                    <span class="review-cart-price">${formatPrice(Number(item.price || 0) * (Number(item.qty) || 1))}</span>
                </div>`).join('');
        const reviewTotalEl = document.querySelector('.review-total-row .cart-total-amount');
        if (reviewTotalEl) reviewTotalEl.textContent = formatPrice(totals.total);
        const reviewDiscountRow = document.getElementById('reviewDiscountRow');
        const reviewDiscountLabel = document.getElementById('reviewDiscountLabel');
        const reviewDiscountAmount = document.getElementById('reviewDiscountAmount');
        if (reviewDiscountRow && reviewDiscountLabel && reviewDiscountAmount) {
            if (promo && totals.discount > 0) {
                reviewDiscountRow.hidden = false;
                reviewDiscountLabel.textContent = t('cart_discount').replace('{code}', promo.code || '');
                reviewDiscountAmount.textContent = `-${formatPrice(totals.discount)}`;
            } else {
                reviewDiscountRow.hidden = true;
            }
        }
    }

    bindCartListEvents(list);
}

// ربط أزرار الكمية والحذف داخل قائمة السلة (تفويض، مع منع التكرار)
let _cartListBound = false;
function bindCartListEvents(list) {
    if (!list || _cartListBound) return;
    _cartListBound = true;
    list.addEventListener('click', async (e) => {
        const incBtn = e.target.closest('[data-cart-inc]');
        const decBtn = e.target.closest('[data-cart-dec]');
        const rmBtn = e.target.closest('[data-cart-remove]');
        if (!incBtn && !decBtn && !rmBtn) return;

        const { increaseQuantity, decreaseQuantity, removeFromCart } = await import('./cart.js');
        const index = incBtn ? Number(incBtn.dataset.cartInc)
                     : decBtn ? Number(decBtn.dataset.cartDec)
                     : Number(rmBtn.dataset.cartRemove);
        if (incBtn) increaseQuantity(index);
        else if (decBtn) decreaseQuantity(index);
        else removeFromCart(index);
    });
}
