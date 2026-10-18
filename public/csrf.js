// توكن CSRF مشترك للطلبات التي تعتمد على كوكي الجلسة (نفس نمط لوحة الأدمن).
// يجلب التوكن مرّة واحدة ويخزّنه، ويعيد المحاولة عند انتهائه.
let cachedToken = null;
let inFlight = null;

export async function getCsrfToken() {
    if (cachedToken) return cachedToken;
    if (inFlight) return inFlight;
    inFlight = fetch('/api/csrf-token', { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
            cachedToken = (d && d.success && d.csrfToken) ? d.csrfToken : null;
            return cachedToken;
        })
        .catch(() => null)
        .finally(() => { inFlight = null; });
    return inFlight;
}

export function resetCsrfToken() {
    cachedToken = null;
}

/**
 * fetch مع إرفاق توكن CSRF تلقائياً — للطلبات غير الآمنة (POST/PUT/DELETE)
 * على المسارات المحمية بكوكي الجلسة.
 */
export async function csrfFetch(url, options = {}) {
    let token = await getCsrfToken();
    let res = await fetch(url, withCsrf(url, options, token));

    // توكن منتهٍ/مرفوض: أعِد الجلب مرّة واحدة ثم أعد المحاولة
    if (res.status === 403) {
        resetCsrfToken();
        token = await getCsrfToken();
        res = await fetch(url, withCsrf(url, options, token));
    }
    return res;
}

function withCsrf(url, options, token) {
    const headers = Object.assign({}, options.headers);
    if (token) headers['X-CSRF-Token'] = token;
    return Object.assign({ credentials: 'include' }, options, { headers });
}
