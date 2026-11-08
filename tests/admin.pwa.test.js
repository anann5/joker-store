// اختبارات: لوحة الأدمن كتطبيق مثبّت (PWA منفصل)
//   - manifest-admin.json يفتح /admin مباشرة
//   - admin.html مرتبط به + meta آبل + SW
//   - شريط تثبيت خاص بالإدارة (beforeinstallprompt)

const fs = require('fs');
const path = require('path');

const MANIFEST_ADMIN = path.join(__dirname, '..', 'public', 'manifest-admin.json');
const ADMIN_HTML = fs.readFileSync(
    path.join(__dirname, '..', 'private', 'admin.html'), 'utf8'
);
const ADMIN_INSTALL = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin-install.js'), 'utf8'
);
const ADMIN_CSS = fs.readFileSync(
    path.join(__dirname, '..', 'private', 'admin-style.css'), 'utf8'
);

const manifest = JSON.parse(fs.readFileSync(MANIFEST_ADMIN, 'utf8'));

describe('Admin PWA manifest', () => {
    it('يفتح /admin مباشرة standalone', () => {
        expect(manifest.start_url).toBe('/admin');
        expect(manifest.display).toBe('standalone');
        expect(manifest.short_name).toContain('Admin');
    });

    it('أيقونات موجودة + shortcuts', () => {
        for (const icon of manifest.icons) {
            const file = icon.src.replace(/^\//, '');
            expect(fs.existsSync(path.join(__dirname, '..', 'public', file))).toBe(true);
        }
        expect(Array.isArray(manifest.shortcuts)).toBe(true);
        expect(manifest.shortcuts.map(s => s.url)).toContain('/');
    });

    it('عربي RTL', () => {
        expect(manifest.lang).toBe('ar');
        expect(manifest.dir).toBe('rtl');
    });
});

describe('Admin PWA page', () => {
    it('مرتبط بـ manifest-admin + meta آبل', () => {
        expect(ADMIN_HTML).toContain('/manifest-admin.json');
        expect(ADMIN_HTML).toContain('apple-mobile-web-app-capable');
        expect(ADMIN_HTML).toContain('apple-mobile-web-app-title');
    });

    it('يسجّل Service Worker + شريط التثبيت', () => {
        expect(ADMIN_HTML).toContain('/sw-register.js');
        expect(ADMIN_HTML).toContain('/admin-install.js');
    });

    it('تنسيق الشريط موجود في CSS اللوحة', () => {
        expect(ADMIN_CSS).toContain('.pwa-install-bar');
        expect(ADMIN_CSS).toContain('.pwa-install-btn');
    });
});

describe('Admin install banner', () => {
    it('لا يظهر إن مثبتة كتطبيق (standalone)', () => {
        expect(ADMIN_INSTALL).toContain('display-mode: standalone');
        expect(ADMIN_INSTALL).toContain('navigator.standalone');
    });

    it('يستخدم beforeinstallprompt الأصلي', () => {
        expect(ADMIN_INSTALL).toContain('beforeinstallprompt');
        expect(ADMIN_INSTALL).toContain('prompt.prompt()');
    });

    it('iOS يعرض تعليمات المشاركة', () => {
        expect(ADMIN_INSTALL).toContain('إضافة إلى الشاشة الرئيسية');
        expect(ADMIN_INSTALL).toContain('isIOS');
    });

    it('تأخير 3 ثوانٍ حتى لا يزعج أول فتح', () => {
        expect(ADMIN_INSTALL).toContain('setTimeout(build, 3000)');
    });
});
