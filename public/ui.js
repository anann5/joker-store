import { cart, removeFromCart, increaseQuantity, decreaseQuantity, addToCart } from './cart.js';
import { selectCategory, currentCategoryKey, rawServerData } from './script.js';

// ======================================================
//  دوال الواجهة الرسومية (UI Functions)
// ======================================================

/**
 * يعرض الأقسام الرئيسية في الشبكة.
 */
export function showAllCategories() {
    const grid = document.getElementById('mainCategories');
    if (!grid) return;
    
    grid.className = ''; 
    grid.removeAttribute('style');

    document.getElementById('back-container').style.display = 'none';
    document.getElementById('regionFilterBar').style.display = 'none';

    document.querySelectorAll('#filterTabs .filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#filterTabs .filter-btn[data-filter="all"]').classList.add('active');

    grid.innerHTML = ''; // تفريغ الشبكة
    const template = document.getElementById('category-card-template');

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
 * يعرض تفاصيل منتج واحد.
 * @param {object} item - بيانات المنتج.
 */
export function showProductDetails(item) {
    const grid = document.getElementById('mainCategories');
    document.getElementById('regionFilterBar').style.display = 'none';

    grid.className = 'product-details-wrapper';
    grid.removeAttribute('style');

    const template = document.getElementById('product-details-template');
    const view = template.content.cloneNode(true);

    view.querySelector('.detail-img').src = item.image;
    view.querySelector('.product-name').textContent = item.name;
    view.querySelector('.product-region').textContent = item.region.toUpperCase();
    view.querySelector('.product-price').textContent = `${item.price}$`;
    
    view.querySelector('.buy-btn').onclick = () => addToCart(item);
    view.querySelector('.back-to-main-btn').onclick = () => selectCategory(currentCategoryKey());

    grid.innerHTML = ''; // تفريغ الشبكة
    grid.appendChild(view);

    window.scrollTo(0, 0);
}

/**
 * يحدث واجهة سلة التسوق في النافذة المنبثقة.
 */
export function updateCartUI() {
    const badge = document.getElementById('cartCountBadge');
    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    if (badge) badge.textContent = totalQty;

    const listZone = document.getElementById('cartItemsList'); 
    const totalZone = document.getElementById('cartTotalAmount');
    
    if (!listZone) return;
    
    if (cart.length === 0) {
        listZone.innerHTML = '<p style="color:#b9bbbe; text-align:center; padding:20px; font-size:0.9rem;">السلة فارغة حالياً 🛒</p>';
        if (totalZone) totalZone.textContent = '0.00$';
        return;
    }

    listZone.innerHTML = '';
    let totalCost = 0;

    cart.forEach((item, index) => {
        totalCost += (item.price * item.qty);
        
        const row = document.createElement('div');
        row.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:12px; border-radius:8px; margin-bottom:8px; border:1px solid rgba(0,240,255,0.05); direction: rtl;";
        
        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <i data-index="${index}" class="fas fa-trash-alt remove-cart-btn" style="color:#ff0055; cursor:pointer; font-size:1.2rem; padding: 5px;" title="حذف المنتج"></i>
                <span style="color:#00f0ff; font-weight:bold;">${(item.price * item.qty).toFixed(2)}$</span>
            </div>
            
            <div style="display: flex; align-items: center; gap: 10px;">
                <button class="qty-btn" data-action="decrease" data-index="${index}" style="background: #333; color: #fff; border: none; border-radius: 4px; width: 25px; height: 25px; cursor: pointer; font-size: 1.2rem; display: flex; justify-content: center; align-items: center;">-</button>
                <span style="color:#fff; font-size:0.95rem;">${item.name} <span style="color: #00f0ff; font-size: 0.85rem;">(${item.qty}x)</span></span>
                <button class="qty-btn" data-action="increase" data-index="${index}" style="background: #333; color: #fff; border: none; border-radius: 4px; width: 25px; height: 25px; cursor: pointer; font-size: 1.2rem; display: flex; justify-content: center; align-items: center;">+</button>
            </div>
        `;
        listZone.appendChild(row);
    });

    if (totalZone) totalZone.textContent = totalCost.toFixed(2) + "$";

    listZone.querySelectorAll('.remove-cart-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.getAttribute('data-index'));
            removeFromCart(idx);
        });
    });

    listZone.querySelectorAll('.qty-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.getAttribute('data-index'));
            const action = this.getAttribute('data-action');
            if (action === 'increase') {
                increaseQuantity(idx);
            } else if (action === 'decrease') {
                decreaseQuantity(idx);
            }
        });
    });
}

/**
 * يعرض إشعاراً منبثقاً (toast).
 * @param {string} message - الرسالة المراد عرضها.
 * @param {string} type - نوع الإشعار ('success' أو 'error').
 */
export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container-main');
    if (!container) return;

    const toast = document.createElement('div');
    const isError = type === 'error';
    const icon = isError ? 'fas fa-times-circle' : 'fas fa-check-circle';
    const color = isError ? '#ff4757' : '#2ecc71';

    toast.style.cssText = `
        background-color: #1e272e;
        color: #fff;
        padding: 15px 20px;
        border-radius: 8px;
        border-left: 5px solid ${color};
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 10px;
        opacity: 0;
        transform: translateX(-100%);
        transition: all 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55);
    `;
    toast.innerHTML = `<i class="${icon}" style="color: ${color}; font-size: 1.2rem;"></i><span>${message}</span>`;
    container.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 10);

    // Animate out and remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-100%)';
        setTimeout(() => toast.remove(), 500);
    }, 4000); // إخفاء الإشعار بعد 4 ثوانٍ
}

/**
 * تهيئة الحاوية الرئيسية للإشعارات المنبثقة.
 */
export function initToastContainer() {
    if (document.getElementById('toast-container-main')) return;

    const container = document.createElement('div');
    container.id = 'toast-container-main';
    container.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;
    document.body.appendChild(container);
}