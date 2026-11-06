/**
 * مركز الإشعارات — يحفظ نص كل بث ليقرأه العميل داخل المتجر بعد الضغط على الإشعار.
 * الرابط المُدخل من الأدمن يبقى "رابطاً ذا صلة" داخل الصفحة، لا وجهة الضغط.
 */
const { Notice } = require('../models');

const LIST_LIMIT = 50;

function safeLink(value) {
    const url = String(value || '').trim();
    // رابط نسبي فقط: يمنع javascript: وإعادة الخروج إلى نطاق خارجي.
    if (!url.startsWith('/') || url.startsWith('//') || url.length > 200) return '';
    return url;
}

function pick(field, lang) {
    const value = field && (field[lang] || field.ar);
    return value ? String(value) : '';
}

async function record({ messages, url = '', tag = 'general' }) {
    const ar = (messages && messages.ar) || {};
    if (!ar.title) return null;
    const en = (messages && messages.en) || {};
    return Notice.create({
        title: {
            ar: String(ar.title).slice(0, 120),
            en: String(en.title || ar.title).slice(0, 120)
        },
        body: {
            ar: String(ar.body || '').slice(0, 600),
            en: String(en.body || ar.body || '').slice(0, 600)
        },
        url: safeLink(url),
        tag: String(tag || 'general').slice(0, 40)
    });
}

async function list(lang = 'ar') {
    const language = lang === 'en' ? 'en' : 'ar';
    const docs = await Notice.find({}).sort({ createdAt: -1 }).limit(LIST_LIMIT).lean();
    return docs.map((doc) => ({
        id: String(doc._id),
        title: pick(doc.title, language),
        body: pick(doc.body, language),
        url: safeLink(doc.url),
        createdAt: doc.createdAt
    }));
}

module.exports = { record, list, safeLink };