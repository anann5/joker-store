/**
 * captcha.js — كابتشا رياضية بسيطة (جمع/طرح) موقّعة بـ JWT.
 * كل تحدي أحادي الاستخدام عبر nonce يحفظ في الذاكرة مع انتهاء صلاحية.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const TTL_MS = 5 * 60 * 1000;
const usedNonces = new Map();

// تنظيف دوري للـ nonces المنتهية
setInterval(() => {
    const now = Date.now();
    usedNonces.forEach((exp, nonce) => {
        if (exp < now) usedNonces.delete(nonce);
    });
}, 60 * 1000).unref();

/**
 * إنشاء تحدي كابتشا.
 * @returns {{ token: string, prompt: string }}
 */
function createCaptcha() {
    let numA = crypto.randomInt(2, 10);
    let numB = crypto.randomInt(2, 10);
    const isSubtract = numB > numA; // نضمن ناتجاً موجباً
    const operator = isSubtract ? '-' : '+';
    if (isSubtract) [numA, numB] = [numA, numB].sort((x, y) => y - x);
    const answer = operator === '+' ? numA + numB : numA - numB;

    const nonce = crypto.randomBytes(16).toString('hex');
    if (!process.env.JWT_SECRET) return { token: '', prompt: `${numA} ${operator} ${numB}` };
    const token = jwt.sign(
        { type: 'captcha', nonce, answer },
        process.env.JWT_SECRET,
        { expiresIn: TTL_MS / 1000 }
    );
    usedNonces.set(nonce, Date.now() + TTL_MS);
    return { token, prompt: `${numA} ${operator} ${numB}` };
}

/**
 * التحقق من إجابة كابتشا (استخدام واحد فقط لكل تحدٍ).
 * @param {string} token
 * @param {string|number} answer
 * @returns {boolean}
 */
function verifyCaptcha(token, answer) {
    if (!token || answer === null || answer === undefined) return false;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded || decoded.type !== 'captcha' || !decoded.nonce) return false;
        // أحادية الاستخدام
        if (!usedNonces.has(decoded.nonce)) return false;
        usedNonces.delete(decoded.nonce);
        return Number(decoded.answer) === Number(answer);
    } catch (_err) {
        return false;
    }
}

module.exports = { createCaptcha, verifyCaptcha, TTL_MS };