// يُولّد www/config.js من متغيّر البيئة APP_URL (أو SITE_URL) قبل بناء تطبيق
// الأندرويد. يفشل البناء عند تمرير عنوان غير صالح بدل شحن تطبيق يشير لمكان خطأ.
const fs = require('fs');
const path = require('path');

const DEFAULT_URL = 'https://joker-store.onrender.com';
const raw = String(process.env.APP_URL || process.env.SITE_URL || DEFAULT_URL).trim();

let origin;
try {
    ({ origin } = new URL(raw));
} catch (_e) {
    console.error(`❌ APP_URL غير صالح: ${raw}`);
    process.exit(1);
}

const target = path.join(__dirname, '..', 'www', 'config.js');
const content = `// ملف مُولّد تلقائياً بواسطة scripts/generate-mobile-config.js — لا تعدّله يدوياً.\nwindow.JOKER_STORE_URL = ${JSON.stringify(origin)};\n`;

fs.writeFileSync(target, content, 'utf8');
console.log(`✅ www/config.js → ${origin}`);
