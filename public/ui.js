import { rawServerData, selectCategory, currentCategoryKey } from './script.js';
import { cart, clearCart } from './cart.js';

let toastContainer = null;

/**
 * دالة لمشاركة المنتج على وسائل التواصل الاجتماعي.
 * تستخدم Web Share API إذا كانت متاحة، أو توفر خياراً احتياطياً.
 * @param {object} product - بيانات المنتج للمشاركة.
 */
export function shareProduct(product) {
    const pageUrl = window.location.href; // مشاركة رابط الصفحة الحالية
    const shareText = `شاهد هذا المنتج الرائع: ${product.name} في متجر Joker Store!`;

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
        else showToast('الرجاء تفعيل النوافذ المنبثقة لمشاركة المنتج.', 'info');
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

    grid.className = '';
    grid.removeAttribute('style');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:30px;';

    const backContainer = document.getElementById('back-container');
    if (backContainer) backContainer.style.display = 'none';

    const regionBar = document.getElementById('regionFilterBar');
    if (regionBar) regionBar.style.display = 'none';

    document.querySelectorAll('#filterTabs .filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('#filterTabs .filter-btn[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');

    const template = document.getElementById('category-card-template');
    grid.innerHTML = ''; // تفريغ المحتوى قبل الإضافة

    Object.entries(rawServerData.categories).forEach(([key, cat]) => {
        const card = template.content.cloneNode(true);
        card.querySelector('.category-card').dataset.category = key;
        card.querySelector('img').src = cat.image;
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
export function showProductDetails(product) {
    const grid = document.getElementById('mainCategories');
    if (!grid) return;

    // استخدام القالب الجاهز من HTML
    const template = document.getElementById('product-details-template');
    if (!template) {
        console.error('Product details template not found!');
        return;
    }

    // 🔥 نقل تعريف الدالة إلى هنا، حيث يتم استخدامها فقط
    const renderRelatedProducts = async (productId, categoryKey) => {
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

                data.products.forEach(item => {
                    const localizedName = item.productName[lang] || item.productName['ar'];
                    const detectedRegion = detectRegion(item);
                    const regionInfo = getRegionDetails(detectedRegion);
                    const clientItem = formatItem({ ...item, name: localizedName }, item.category, detectedRegion);

                    productCache.set(clientItem.id, clientItem);

                    const card = productCardTemplate.content.cloneNode(true);
                    const cardElement = card.querySelector('.product-item-card');
                    cardElement.dataset.productId = clientItem.id;
                    cardElement.dataset.region = detectedRegion;
                    card.querySelector('.card-flag-badge').innerHTML = regionInfo.isIcon ? '<i class="fas fa-globe"></i>' : `<img src="${regionInfo.flagUrl}" />`;
                    const imgElement = card.querySelector('.card-inner-img');
                    imgElement.src = clientItem.image;
                    imgElement.onerror = () => { imgElement.src = 'image/logo.png'; }; // Fallback image
                    card.querySelector('.card-title').textContent = clientItem.name;
                    card.querySelector('.card-price').textContent = `${clientItem.price}$`;
                    relatedContainer.appendChild(card);
                });
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
    detailImgElement.src = product.image || `image/${currentCategoryKey()}.png`;
    detailImgElement.onerror = () => { detailImgElement.src = 'image/logo.png'; }; // Fallback image
    view.querySelector('.detail-img').alt = product.name;
    view.querySelector('.product-name').textContent = product.name;
    view.querySelector('.product-price').textContent = `${product.price}$`;
    const regionSpan = view.querySelector('.product-region');
    if (regionSpan) {
        regionSpan.textContent = product.region;
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
    backButton.addEventListener('click', () => selectCategory(currentCategoryKey()));

    grid.className = 'product-details-wrapper';
    grid.innerHTML = ''; // تفريغ الشبكة أولاً
    grid.appendChild(view);

    // بعد عرض المنتج، نقوم بجلب وعرض المنتجات ذات الصلة
    renderRelatedProducts(product.id, currentCategoryKey());
}

// دالة تحديث واجهة السلة (يمكن نقلها من cart.js إذا كانت هناك)
export function updateCartUI() { /* ... الكود الخاص بتحديث واجهة السلة ... */ }