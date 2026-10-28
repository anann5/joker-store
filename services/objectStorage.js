/**
 * تخزين الملفات على Cloudflare R2 عبر واجهة S3 المتوافقة.
 * - الإثباتات تُحفظ تحت payment-proofs/ وتبقى خاصة (الدلو غير عام).
 * - صور المتجر تُحفظ تحت uploads/ وتُقدَّم للعامة عبر مسار التطبيق.
 * - عند غياب إعدادات R2 يعمل التطبيق بالتخزين المحلي (تطوير/اختبارات).
 */
const path = require('path');
const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand
} = require('@aws-sdk/client-s3');

const CONTENT_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
};

let client = null;
let warnedPartial = false;

function getConfig() {
    const accountId = String(process.env.R2_ACCOUNT_ID || '').trim();
    const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
    const bucket = String(process.env.R2_BUCKET || '').trim();
    const endpoint = String(process.env.R2_ENDPOINT || '').trim()
        || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

    const complete = Boolean(accessKeyId && secretAccessKey && bucket && endpoint);
    if (!complete && (accountId || accessKeyId || secretAccessKey || bucket) && !warnedPartial) {
        warnedPartial = true;
        console.warn('⚠️ إعدادات R2 غير مكتملة — سيُستخدم التخزين المحلي المؤقت للملفات.');
    }

    return complete ? { accessKeyId, secretAccessKey, bucket, endpoint } : null;
}

function isEnabled() {
    return Boolean(getConfig());
}

function getClient() {
    const config = getConfig();
    if (!config) throw new Error('تخزين R2 غير مهيأ');
    if (!client) {
        client = new S3Client({
            region: 'auto',
            endpoint: config.endpoint,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            }
        });
    }
    return client;
}

async function putObject(key, body, contentType) {
    const config = getConfig();
    if (!config) throw new Error('تخزين R2 غير مهيأ');
    await getClient().send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType
    }));
    return key;
}

async function getObject(key) {
    const config = getConfig();
    if (!config) throw new Error('تخزين R2 غير مهيأ');
    const result = await getClient().send(new GetObjectCommand({
        Bucket: config.bucket,
        Key: key
    }));
    return {
        body: result.Body,
        contentType: result.ContentType || '',
        contentLength: Number(result.ContentLength) || 0
    };
}

async function getObjectBuffer(key, maxBytes) {
    const { body, contentLength } = await getObject(key);
    if (contentLength > maxBytes) throw new Error('حجم الملف يتجاوز الحد المسموح');

    const chunks = [];
    let total = 0;
    for await (const chunk of body) {
        total += chunk.length;
        if (total > maxBytes) throw new Error('حجم الملف يتجاوز الحد المسموح');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function contentTypeForFilename(filename) {
    return CONTENT_TYPES[path.extname(String(filename || '')).toLowerCase()] || 'application/octet-stream';
}

function isNotFoundError(error) {
    return Boolean(error) && (
        error.name === 'NoSuchKey' ||
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
    );
}

module.exports = {
    isEnabled,
    putObject,
    getObject,
    getObjectBuffer,
    contentTypeForFilename,
    isNotFoundError
};
