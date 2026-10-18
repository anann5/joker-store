/**
 * Re-assert launcher icon wiring in the generated Android manifest.
 * Idempotent. Run after `npx cap add android` and after copying branded res.
 *
 * Usage: node mobile-assets/android-icon-patch.js
 */
const fs = require('fs');
const path = require('path');

const manifest = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const bgColorXml = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'values', 'ic_launcher_background.xml');

function syncMipmapForeground() {
    const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
    const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
    const copied = [];
    for (const d of densities) {
        const src = path.join(resDir, 'drawable-' + d, 'ic_launcher_foreground.png');
        const dst = path.join(resDir, 'mipmap-' + d, 'ic_launcher_foreground.png');
        if (fs.existsSync(src) && fs.existsSync(path.dirname(dst))) {
            fs.copyFileSync(src, dst);
            copied.push(d);
        }
    }
    console.log('[icon-patch] joker foreground -> mipmap:', copied.length ? copied.join(', ') : 'none');
}

function patchAdaptiveBackground() {
    if (!fs.existsSync(bgColorXml)) {
        console.log('[icon-patch] ic_launcher_background.xml not found — skipping background color');
        return;
    }
    const original = fs.readFileSync(bgColorXml, 'utf8');
    const updated = original.replace(/(<color\s+name="ic_launcher_background"\s*>)#[0-9a-fA-F]{6,8}(<\/color>)/, '$1#0F172A$2');
    fs.writeFileSync(bgColorXml, updated);
    console.log('[icon-patch] adaptive background color -> #0F172A');
}

function main() {
    if (!fs.existsSync(manifest)) {
        throw new Error('[icon-patch] AndroidManifest.xml not found — run `npx cap add android` first');
    }
    syncMipmapForeground();
    patchAdaptiveBackground();
    let text = fs.readFileSync(manifest, 'utf8');
    const m = text.match(/<application\b[^>]*>/);
    if (!m) {
        console.log('[icon-patch] <application> tag not found — skipping');
        return;
    }
    let tag = m[0]
        .replace(/\sandroid:icon="[^"]*"/g, '')
        .replace(/\sandroid:roundIcon="[^"]*"/g, '');
    tag = tag.replace(
        '<application',
        '<application android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round"'
    );
    text = text.replace(m[0], tag);
    fs.writeFileSync(manifest, text);
    console.log('[icon-patch] applied ->', tag);
}

main();
