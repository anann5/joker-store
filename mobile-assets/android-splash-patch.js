/**
 * Applies the dark brand splash background to the generated Capacitor Android
 * project (pre-Android 12 drawable + Android 12+ system splash).
 * - Idempotent: safe to run multiple times.
 * - Run AFTER `npx cap add android` / `npx cap sync android`.
 *
 * Usage: node mobile-assets/android-splash-patch.js
 */
const fs = require('fs');
const path = require('path');

const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const stylesXml = path.join(resDir, 'values', 'styles.xml');
const colorsXml = path.join(resDir, 'values', 'colors.xml');
const COLOR_NAME = 'joker_splash_background';
const COLOR_VALUE = '#0B0F1C';

function ensureColorResource() {
    if (!fs.existsSync(colorsXml)) {
        fs.writeFileSync(
            colorsXml,
            `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="${COLOR_NAME}">${COLOR_VALUE}</color>\n</resources>\n`
        );
        console.log('[splash-patch] colors.xml created');
        return true;
    }
    let text = fs.readFileSync(colorsXml, 'utf8');
    if (text.includes(`name="${COLOR_NAME}"`)) {
        console.log('[splash-patch] splash color: already present');
        return true;
    }
    if (!text.includes('</resources>')) {
        console.log('[splash-patch] colors.xml has no </resources> — skipping color');
        return false;
    }
    text = text.replace('</resources>', `    <color name="${COLOR_NAME}">${COLOR_VALUE}</color>\n</resources>`);
    fs.writeFileSync(colorsXml, text);
    console.log('[splash-patch] splash color: added');
    return true;
}

function patchLaunchTheme() {
    let text = fs.readFileSync(stylesXml, 'utf8');
    const block = text.match(/(<style\s+name="AppTheme\.NoActionBarLaunch"[^>]*>)([\s\S]*?)(<\/style>)/);
    if (!block) {
        console.log('[splash-patch] AppTheme.NoActionBarLaunch not found — skipping');
        return;
    }

    let body = block[2];
    if (/<item\s+name="android:background">[\s\S]*?<\/item>/.test(body)) {
        body = body.replace(
            /<item\s+name="android:background">[\s\S]*?<\/item>/,
            `<item name="android:background">@color/${COLOR_NAME}</item>`
        );
    } else {
        body += `\n        <item name="android:background">@color/${COLOR_NAME}</item>`;
    }

    const items = [
        ['windowSplashScreenBackground', `@color/${COLOR_NAME}`],
        ['android:statusBarColor', `@color/${COLOR_NAME}`],
        ['android:navigationBarColor', `@color/${COLOR_NAME}`]
    ];
    for (const [name, value] of items) {
        if (new RegExp(`<item\\s+name="${name.replace(':', '\\:')}"`).test(body)) continue;
        body += `\n        <item name="${name}">${value}</item>`;
    }

    if (body !== block[2]) {
        body = body.replace(/\s+$/, '') + '\n    ';
        text = text.replace(block[0], `${block[1]}${body}${block[3]}`);
        fs.writeFileSync(stylesXml, text);
        console.log('[splash-patch] launch theme: applied dark splash');
    } else {
        console.log('[splash-patch] launch theme: already applied');
    }
}

function main() {
    if (!fs.existsSync(stylesXml)) {
        console.log('[splash-patch] android/ styles.xml not found — run `npx cap add android` first');
        return;
    }
    ensureColorResource();
    patchLaunchTheme();
}

main();
