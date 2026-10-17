/**
 * Re-assert launcher icon wiring in the generated Android manifest.
 * Idempotent. Run after `npx cap add android` and after copying branded res.
 *
 * Usage: node mobile-assets/android-icon-patch.js
 */
const fs = require('fs');
const path = require('path');

const manifest = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

function main() {
    if (!fs.existsSync(manifest)) {
        throw new Error('[icon-patch] AndroidManifest.xml not found — run `npx cap add android` first');
    }
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
