/**
 * Applies Firebase Cloud Messaging wiring to the generated Capacitor Android project.
 * - Idempotent: safe to run multiple times.
 * - Run AFTER `npx cap add android` / `npx cap sync android`.
 * - Requires android/app/google-services.json to already exist (from CI secret).
 *
 * Usage: node mobile-assets/android-fcm-patch.js
 */
const fs = require('fs');
const path = require('path');

const androidDir = path.join(__dirname, '..', 'android');
const rootGradle = path.join(androidDir, 'build.gradle');
const appGradle = path.join(androidDir, 'app', 'build.gradle');
const googleServicesJson = path.join(androidDir, 'app', 'google-services.json');

function patchFile(file, anchor, addition, label) {
    let text = fs.readFileSync(file, 'utf8');
    if (text.includes(addition.trim())) {
        console.log(`[fcm-patch] ${label}: already applied`);
        return true;
    }
    if (!text.includes(anchor)) {
        console.log(`[fcm-patch] ${label}: anchor not found — skipping (build continues without FCM wiring)`);
        return false;
    }
    text = text.replace(anchor, `${anchor}\n${addition}`);
    fs.writeFileSync(file, text);
    console.log(`[fcm-patch] ${label}: applied`);
    return true;
}

function main() {
    if (!fs.existsSync(rootGradle) || !fs.existsSync(appGradle)) {
        throw new Error('[fcm-patch] android/ platform not found — run `npx cap add android` first');
    }
    if (!fs.existsSync(googleServicesJson)) {
        console.log('[fcm-patch] google-services.json missing — skipping FCM wiring (debug build without push)');
        return;
    }

    // 1. Google Services classpath (project-level)
    patchFile(
        rootGradle,
        'com.android.tools.build:gradle',
        "        classpath 'com.google.gms:google-services:4.4.2'",
        'gms-classpath'
    );

    // 2. Apply plugin (app-level, before android block ideally — append after existing applies)
    let appText = fs.readFileSync(appGradle, 'utf8');
    if (!appText.includes("com.google.gms.google-services")) {
        const lines = appText.split('\n');
        let idx = lines.findIndex((l) => l.startsWith('apply plugin:'));
        const stmt = "apply plugin: 'com.google.gms.google-services'";
        if (idx >= 0) {
            // insert after the LAST apply plugin line
            let last = idx;
            lines.forEach((l, i) => {
                if (l.startsWith('apply plugin:')) last = i;
            });
            lines.splice(last + 1, 0, stmt);
        } else {
            lines.unshift(stmt);
        }
        fs.writeFileSync(appGradle, lines.join('\n'));
        console.log('[fcm-patch] gms-plugin: applied');
    } else {
        console.log('[fcm-patch] gms-plugin: already applied');
    }
}

main();
