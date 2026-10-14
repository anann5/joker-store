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
 * تنسيق سعر مالي مع رمز العملة — ينتهي دائماً بـ 0 أو 5 (بدون كسور).
 * @param {number|string} value المبلغ
 * @returns {string} مثال: 65 ₪
 */
export function formatPrice(value) {
    const numeric = Number(value);
    const amount = Number.isFinite(numeric) ? (Math.ceil(numeric / 5) * 5).toString() : '0';
    return `${amount} ${symbol}`;
}

