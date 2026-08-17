import { updateCartUI, showToast } from './ui.js';
import { t } from './i18n.js';

// ======================================================
// 🛒 سيستم السلة المحلية المستقلة النظيفة
// ======================================================

export let cart = JSON.parse(localStorage.getItem('joker_cart')) || [];

/**
 * يضيف منتجاً إلى السلة أو يزيد كميته.
 * @param {object} product - المنتج المراد إضافته.
 */
export function addToCart(product) {
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
        existingItem.qty += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            qty: 1
        });
    }
    
    localStorage.setItem('joker_cart', JSON.stringify(cart));
    updateCartUI(); // استدعاء دالة الواجهة من الملف الآخر
    showToast(t('cart_added').replace('{name}', product.name));
}

/**
 * يحذف منتجاً من السلة بناءً على فهرسه.
 * @param {number} index - فهرس المنتج في مصفوفة السلة.
 */
export function removeFromCart(index) {
    if (index > -1 && index < cart.length) {
        cart.splice(index, 1);
        localStorage.setItem('joker_cart', JSON.stringify(cart));
        updateCartUI();
    }
}

/**
 * يفرغ السلة بالكامل بعد تأكيد المستخدم.
 */
export function clearCart() {
    if (cart.length === 0) return;
    if (confirm(t('cart_clear_confirm'))) {
        cart = [];
        localStorage.setItem('joker_cart', JSON.stringify(cart));
        updateCartUI();
    }
}

/**
 * يزيد كمية منتج معين في السلة.
 * @param {number} index - فهرس المنتج.
 */
export function increaseQuantity(index) {
    if (index > -1 && index < cart.length) {
        cart[index].qty += 1;
        localStorage.setItem('joker_cart', JSON.stringify(cart));
        updateCartUI();
    }
}

/**
 * ينقص كمية منتج معين، أو يحذفه إذا كانت الكمية 1.
 * @param {number} index - فهرس المنتج.
 */
export function decreaseQuantity(index) {
    if (index > -1 && index < cart.length) {
        if (cart[index].qty > 1) {
            cart[index].qty -= 1;
        } else {
            removeFromCart(index);
            return;
        }
        localStorage.setItem('joker_cart', JSON.stringify(cart));
        updateCartUI();
    }
}
