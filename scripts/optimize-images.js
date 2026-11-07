// يولّد نسخ WebP للصور PNG التي لا تملك نسخة WebP.
// الخادم (app.js) يقدّم .webp تلقائياً للمتصفحات الداعمة عند وجود الملف،
// لذا لا نحتاج لتغيير أي وسم <img> في الواجهة.
// - التشغيل: npm run optimize:images
// - يستخدم sharp إن توفّر، وإلا يرجع إلى ffmpeg (libwebp).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const QUALITY = Number.parseInt(process.env.WEBP_QUALITY, 10) || 82;

let sharp = null;
try {
    // حزمة أصلية (native) — قد لا تعمل على كل المنصات
    require.resolve('sharp');
    sharp = require('sharp');
} catch (_error) {
    sharp = null;
}

/**
 * يمشي على المجلد بشكل متكرر ويجمع ملفات PNG.
 * @param {string} dir - المجلد.
 * @returns {string[]}
 */
function collectPng(dir) {
    const output = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) output.push(...collectPng(full));
        else if (/\.png$/i.test(entry.name)) output.push(full);
    }
    return output;
}

/**
 * تحويل ملف واحد إلى WebP.
 * @param {string} source - مسار PNG.
 * @param {string} target - مسار WebP.
 * @returns {Promise<void>}
 */
async function convert(source, target) {
    if (sharp) {
        await sharp(source).webp({ quality: QUALITY, effort: 5 }).toFile(target);
        return;
    }
    execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error',
        '-i', source,
        '-c:v', 'libwebp',
        '-quality', String(QUALITY),
        target
    ], { stdio: 'pipe' });
}

async function main() {
    if (!sharp) {
        try {
            execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' });
        } catch (_error) {
            console.error('❌ لا يوجد sharp ولا ffmpeg — ثبّت أحدهما لتوليد WebP.');
            process.exit(1);
        }
    }

    const files = collectPng(PUBLIC_DIR);
    let converted = 0;
    let skipped = 0;
    let savedBytes = 0;

    for (const file of files) {
        const webp = file.replace(/\.png$/i, '.webp');
        if (fs.existsSync(webp)) {
            skipped += 1;
            continue;
        }
        const sourceSize = fs.statSync(file).size;
        try {
            await convert(file, webp);
        } catch (error) {
            console.warn(`⚠️ skipped ${path.relative(PUBLIC_DIR, file)}: ${error.message}`);
            skipped += 1;
            continue;
        }
        const targetSize = fs.statSync(webp).size;
        // إذا كانت النسخة أكبر من الأصل (صور صغيرة جداً) نحذفها ونبقي PNG
        if (targetSize >= sourceSize) {
            fs.unlinkSync(webp);
            skipped += 1;
            continue;
        }
        converted += 1;
        savedBytes += sourceSize - targetSize;
        console.log(`${path.relative(PUBLIC_DIR, file).padEnd(40)} ${Math.round(sourceSize / 1024)}KB → ${Math.round(targetSize / 1024)}KB`);
    }

    console.log(`\nconverted ${converted}, skipped ${skipped}, saved ${(savedBytes / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((error) => {
    console.error('❌ optimize:images failed:', error.message);
    process.exit(1);
});
