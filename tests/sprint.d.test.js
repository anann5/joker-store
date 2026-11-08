// اختبارات سبرنت D (الأداء والهاتف — PWA):
//   - manifest صالح وقابل للتثبيت
//   - install-prompt يستخدم beforeinstallprompt (PWA) قبل fallback APK
//   - Service Worker يستخدم استراتيجية network-first للواجهة و offline للصور

const fs = require('fs');
const path = require('path');

const MANIFEST = path.join(__dirname, '..', 'public', 'manifest.json');
const SW = path.join(__dirname, '..', 'public', 'sw.js');
const INSTALL = path.join(__dirname, '..', 'public', 'install-prompt.js');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const sw = fs.readFileSync(SW, 'utf8');
const install = fs.readFileSync(INSTALL, 'utf8');

describe('PWA manifest', () => {
    it('standalone + أيقونات 192/512', () => {
        expect(manifest.display).toBe('standalone');
        expect(manifest.start_url).toBe('/');
        const sizes = manifest.icons.map(i => i.sizes);
        expect(sizes).toContain('192x192');
        expect(sizes).toContain('512x512');
    });

    it('أيقونات موجودة فعلياً على القرص', () => {
        for (const icon of manifest.icons) {
            const file = icon.src.replace(/^\//, '');
            const full = path.join(__dirname, '..', 'public', file);
            expect(fs.existsSync(full)).toBe(true);
        }
    });

    it('عربي RTL', () => {
        expect(manifest.lang).toBe('ar');
        expect(manifest.dir).toBe('rtl');
    });
});

describe('PWA install prompt', () => {
    it('يستخدم beforeinstallprompt الأصلي', () => {
        expect(install).toContain('beforeinstallprompt');
        expect(install).toContain('prompt.prompt()');
        expect(install).toContain('userChoice');
    });

    it('fallback APK فقط عند غياب الموجه', () => {
        expect(install).toContain('APK_URL');
        expect(install).toContain('deferredPrompt');
    });

    it('لا يعرض داخل تطبيق أندرويد (Capacitor)', () => {
        expect(install).toContain('isNativePlatform');
    });
});

describe('Service Worker', () => {
    it('كاش جديد (v30) مع skipWaiting و clients.claim', () => {
        expect(sw).toContain('joker-store-v30');
        expect(sw).toContain('skipWaiting');
        expect(sw).toContain('clients.claim');
    });

    it('API شبكة فقط + صور fallback', () => {
        expect(sw).toContain("/api/");
        expect(sw).toContain('Offline');
    });

    it('Web Push + deep link للاشعارات', () => {
        expect(sw).toContain("addEventListener('push'");
        expect(sw).toContain('notificationclick');
        expect(sw).toContain('showNotification');
    });
});
