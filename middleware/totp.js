/**
 * totp.js — RFC 6238 Time-based One-Time Password (تطبيق خالٍ من الاعتماديات)
 * HMAC-SHA1، خطوة 30 ثانية، نافذة ±1.
 * يقبل السر كأساس 32 (نطاق Google Authenticator) أو بايتات UTF-8 مباشرة.
 */
const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_LOOKUP = {};
BASE32_ALPHABET.split('').forEach((ch, i) => { BASE32_LOOKUP[ch] = i; });

/**
 * فك تشفير نص Base32 إلى Buffer.
 * @param {string} input
 * @returns {Buffer}
 */
function base32Decode(input) {
    const cleaned = String(input).toUpperCase().replace(/=+/g, '').replace(/[^A-Z2-7]/g, '');
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const ch of cleaned) {
        if (!(ch in BASE32_LOOKUP)) continue;
        value = (value << 5) | BASE32_LOOKUP[ch];
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

/**
 * ترميز Buffer إلى Base32 (بلا حشوة).
 * @param {Buffer} buffer
 * @returns {string}
 */
function base32Encode(buffer) {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
}

/**
 * تحويل السر إلى بايتات: أساس 32 إذا طابَ النمط، وإلا بايتات نصية مباشرة.
 * @param {string} secret
 * @returns {Buffer}
 */
function secretToBuffer(secret) {
    const normalized = String(secret).replace(/\s+/g, '');
    if (/^[A-Za-z2-7]+={0,2}$/.test(normalized)) {
        try {
            return base32Decode(normalized);
        } catch (_err) {
            // نعود للنص المباشر عند أي غموض
        }
    }
    return Buffer.from(String(secret), 'utf8');
}

/**
 * توليد أكواد TOTP داخل نافذة ±window حول اللحظة المعطاة.
 * @param {string} secret
 * @param {object} [opts]
 * @param {number} [opts.step=30]
 * @param {number} [opts.digits=6]
 * @param {number} [opts.now] الطابع الزمني بالميلي ثانية
 * @param {number} [opts.window=1]
 * @returns {{ codes: string[], counter: number }}
 */
function totpCodes(secret, opts = {}) {
    const step = opts.step || 30;
    const digits = opts.digits || 6;
    const window = opts.window === null || opts.window === undefined ? 1 : opts.window;
    const now = opts.now || Date.now();
    const key = secretToBuffer(secret);

    const counter = Math.floor(now / 1000 / step);
    const codes = [];

    for (let i = -window; i <= window; i++) {
        const counterBuf = Buffer.alloc(8);
        counterBuf.writeBigUInt64BE(BigInt(counter + i), 0);
        const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
        const offset = hmac[hmac.length - 1] & 0x0f;
        const binCode =
            ((hmac[offset] & 0x7f) << 24) |
            (hmac[offset + 1] << 16) |
            (hmac[offset + 2] << 8) |
            hmac[offset + 3];
        codes.push(String(binCode % 10 ** digits).padStart(digits, '0'));
    }

    return { codes, counter };
}

/**
 * التحقق من كود TOTP داخل النافذة.
 * @param {string} secret
 * @param {string} code
 * @param {object} [opts]
 * @returns {{ valid: boolean, delta: number | null }}
 */
function verifyTotp(secret, code, opts = {}) {
    const provided = String(code || '').trim();
    if (!/^\d{6}$/.test(provided) && !/^\d{8}$/.test(provided)) {
        return { valid: false, delta: null };
    }
    const digits = provided.length;
    const { codes } = totpCodes(secret, { ...opts, digits });
    const idx = codes.indexOf(provided);
    if (idx === -1) return { valid: false, delta: null };
    const centerIdx = opts.window === null || opts.window === undefined ? 1 : opts.window;
    return { valid: true, delta: idx - centerIdx };
}

/**
 * توليد سر جديد عشوائي بصيغة Base32 (32 حرفاً ≈ 160 بت).
 * @returns {string}
 */
function generateSecret() {
    return base32Encode(crypto.randomBytes(20));
}

/**
 * رابط otpauth:// لإعداد تطبيق مصادقة (Google Authenticator وأمثاله).
 * @param {string} secret
 * @param {string} account
 * @param {string} issuer
 * @returns {string}
 */
function otpauthUri(secret, account, issuer = 'Joker Store') {
    const params =
        `secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}` +
        `&algorithm=SHA1&digits=6&period=30`;
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${params}`;
}

module.exports = {
    base32Decode,
    base32Encode,
    totpCodes,
    verifyTotp,
    generateSecret,
    otpauthUri
};