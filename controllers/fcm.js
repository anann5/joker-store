/**
 * إشعارات FCM لتطبيق الأندرويد الأصلي (عبر Firebase Admin SDK — HTTP v1).
 * - الاعتماد اختياري: firebase-admin يُحمّل lazily فقط عند التفعيل.
 * - التفعيل يتطلب FIREBASE_SERVICE_ACCOUNT (محتوى JSON لحساب الخدمة).
 * - التوكنات الميتة (not-registered/invalid) تُحذف تلقائياً.
 */
/* eslint-disable no-await-in-loop -- إرسال وتحديث تسلسلي مقصود لكل رمز (تجنّب إغراق المزوّد) */
const { FcmToken } = require('../models');

const MAX_FAILED = 10;
const BATCH_SIZE = 500;

let adminInstance = null;

function getCredential() {
    const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.client_email || !parsed.private_key) return null;
        return parsed;
    } catch (_e) {
        return null;
    }
}

function isFcmEnabled() {
    return Boolean(getCredential());
}

function getAdmin() {
    if (adminInstance) return adminInstance;
    const cred = getCredential();
    if (!cred) return null;
    let admin;
    try {
         
        admin = require('firebase-admin');
    } catch (_e) {
        return null;
    }
    try {
        // firebase-admin v14: cert() أصبحت دالة عليا بدل admin.credential.cert()
        const cert = typeof admin.cert === 'function' ? admin.cert : admin.credential.cert;
        adminInstance = admin.initializeApp({ credential: cert(cred) });
    } catch (_e) {
        try {
            [adminInstance] = admin.getApps();
        } catch (_e2) {
            return null;
        }
    }
    return adminInstance;
}

function localize(doc, messages) {
    const lang = doc && doc.lang === 'en' ? 'en' : 'ar';
    return {
        title: (messages[lang] && messages[lang].title) || (messages.ar && messages.ar.title) || '',
        body: (messages[lang] && messages[lang].body) || (messages.ar && messages.ar.body) || ''
    };
}

function isDeadTokenError(code) {
    return code === 'messaging/registration-token-not-registered'
        || code === 'messaging/invalid-registration-token'
        || code === 'messaging/invalid-argument';
}

/**
 * تسجيل/تحديث توكن FCM لجهاز.
 */
async function registerToken({ token, userId = null, lang = 'ar' }) {
    const clean = String(token || '').trim();
    if (!clean || clean.length > 500) {
        throw new Error('invalid token');
    }
    const patch = { token: clean };
    if (userId) patch.userId = userId;
    if (lang === 'en' || lang === 'ar') patch.lang = lang;
    return FcmToken.findOneAndUpdate(
        { token: clean },
        { $set: patch, $setOnInsert: { failedCount: 0 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

/**
 * إرسال لمجموعة توكنات محلولة (docs من FcmToken).
 */
async function sendToTokens(tokenDocs, messages, { url = '/', tag = 'general' } = {}) {
    if (!isFcmEnabled() || !Array.isArray(tokenDocs) || tokenDocs.length === 0) {
        return { sent: 0, deleted: 0, failed: 0 };
    }
    const app = getAdmin();
    if (!app) return { sent: 0, deleted: 0, failed: 0 };

    const docs = tokenDocs.filter((d) => d && d.token && (d.failedCount || 0) < MAX_FAILED);
    if (!docs.length) return { sent: 0, deleted: 0, failed: 0 };

    let sent = 0;
    let failed = 0;
    let deleted = 0;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        const perDoc = batch.map((doc) => {
            const { title, body } = localize(doc, messages);
            return { doc, title, body };
        }).filter((m) => m.title);
        if (!perDoc.length) continue;
        // sendEachForMulticast requires one message shape; localize per-doc via individual sends
        // grouped by identical payload to stay efficient.
        const groups = new Map();
        for (const m of perDoc) {
            const key = `${m.title}\n${m.body}`;
            if (!groups.has(key)) groups.set(key, { title: m.title, body: m.body, docs: [] });
            groups.get(key).docs.push(m.doc);
        }
        for (const group of groups.values()) {
            let resp;
            try {
                resp = await app.messaging().sendEachForMulticast({
                    tokens: group.docs.map((d) => d.token),
                    notification: { title: group.title, body: group.body },
                    data: { url: String(url || '/'), tag: String(tag || 'general') },
                    android: {
                        priority: 'high',
                        notification: { channelId: 'joker_push', sound: 'default', defaultVibrateTimings: true }
                    }
                });
            } catch (_e) {
                failed += group.docs.length;
                continue;
            }
            for (let k = 0; k < group.docs.length; k += 1) {
                const doc = group.docs[k];
                const r = resp.responses[k];
                if (r && r.success) {
                    sent += 1;
                    await FcmToken.updateOne(
                        { _id: doc._id },
                        { $set: { failedCount: 0, lastSuccessAt: new Date() } }
                    ).catch(() => {});
                } else if (r && r.error && isDeadTokenError(r.error.code)) {
                    deleted += 1;
                    await FcmToken.deleteOne({ _id: doc._id }).catch(() => {});
                } else {
                    failed += 1;
                    await FcmToken.updateOne(
                        { _id: doc._id },
                        { $set: { lastErrorAt: new Date() }, $inc: { failedCount: 1 } }
                    ).catch(() => {});
                }
            }
        }
    }
    return { sent, deleted, failed };
}

/**
 * إرسال لمستخدمين (تُحل توكناتهم من قاعدة البيانات).
 */
async function sendToUsers({ userIds, messages, url = '/', tag = 'general' }) {
    if (!isFcmEnabled() || !Array.isArray(userIds) || userIds.length === 0) {
        return { sent: 0, deleted: 0, failed: 0 };
    }
    const docs = await FcmToken.find({ userId: { $in: userIds } })
        .select('token lang failedCount')
        .lean();
    return sendToTokens(docs, messages, { url, tag });
}

/**
 * إرسال لتوكنات خام + مستخدمين (تُحل التوكنات من قاعدة البيانات).
 * يُرجع covered وهي مجموعة التوكنات التي وُجدت لها سجلات حيّة.
 */
async function sendToTokensAndUsers({ tokens = [], userIds = [], messages, url = '/', tag = 'general' }) {
    if (!isFcmEnabled() || !messages) return { sent: 0, deleted: 0, failed: 0, covered: new Set() };
    const clean = [...new Set((tokens || []).filter((tk) => typeof tk === 'string' && tk))];
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!clean.length && !ids.length) return { sent: 0, deleted: 0, failed: 0, covered: new Set() };
    const or = [];
    if (clean.length) or.push({ token: { $in: clean } });
    if (ids.length) or.push({ userId: { $in: ids } });
    const docs = await FcmToken.find({ $or: or })
        .select('token lang failedCount')
        .lean();
    const result = await sendToTokens(docs, messages, { url, tag });
    return { ...result, covered: new Set(docs.map((d) => d.token)) };
}
async function broadcastToApps(messages, url = '/', tag = 'offers') {
    if (!isFcmEnabled() || !messages) return { sent: 0, deleted: 0, failed: 0 };
    const docs = await FcmToken.find({})
        .select('token lang failedCount')
        .lean();
    return sendToTokens(docs, messages, { url, tag });
}

async function getStats() {
    const total = await FcmToken.estimatedDocumentCount().catch(() => 0);
    return { enabled: isFcmEnabled(), totalDevices: total || 0 };
}

module.exports = {
    isFcmEnabled,
    registerToken,
    sendToTokens,
    sendToTokensAndUsers,
    sendToUsers,
    broadcastToApps,
    getStats
};
