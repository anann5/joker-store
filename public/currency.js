// ======================================================
//  ⚙️ عملة المتجر (تُضبط من /api/site-config)
// ======================================================

let code = 'ILS';
let symbol = '₪';

/**
 * ضبط عملة المتجر من إعدادات الموقع.
 * @param {string} currencyCode رمز العملة (ILS/USD/...)
 * @param {string} currencySymbol رمز العرض أمام السعر (₪/$/...)
 */
export function setCurrency(currencyCode, currencySymbol) {
    if (typeof currencyCode === 'string' && currencyCode.trim()) code = currencyCode.trim();
    if (typeof currencySymbol === 'string' && currencySymbol.trim()) symbol = currencySymbol.trim();
}

export function getCurrency() {
    return { code, symbol };
}

/**
 * تنسيق سعر مالي مع رمز العملة.
 * @param {number|string} value المبلغ
 * @returns {string} مثال: 12.50 ₪
 */
export function formatPrice(value) {
    const numeric = Number(value);
    const amount = Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
    return `${amount} ${symbol}`;
}

