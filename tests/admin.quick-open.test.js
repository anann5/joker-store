// اختبارات سهولة فتح لوحة الأدمن من الهاتف:
//   - رابط متكتم في الفوتر → /admin
//   - ضغط مطول على الشعار → /admin
//   - Manifest shortcuts للوحة والتتبع
//   - صفحة الدخول: إظهار كلمة المرور + autocomplete + عودة للمتجر

const fs = require('fs');
const path = require('path');

const INDEX = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');
const LOGIN = fs.readFileSync(path.join(__dirname, '..', 'public', 'login.html'), 'utf8');
const LOGIN_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'login-admin.js'), 'utf8');
const MANIFEST = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.json'), 'utf8')
);

describe('Admin quick open: footer', () => {
    it('رابط لوحة الإدارة في الفوتر', () => {
        expect(INDEX).toContain('href="/admin"');
        expect(INDEX).toContain('footer-admin-link');
        expect(INDEX).toContain('لوحة الإدارة');
    });
});

describe('Admin quick open: long-press logo', () => {
    it('ضغط مطول 800ms على الشعار يفتح /admin', () => {
        expect(SCRIPT).toContain("'/admin'");
        expect(SCRIPT).toContain('800');
        expect(SCRIPT).toContain('pointerdown');
    });
});

describe('Admin quick open: PWA shortcuts', () => {
    it('Manifest يحتوي shortcuts للإدارة والتتبع', () => {
        expect(Array.isArray(MANIFEST.shortcuts)).toBe(true);
        const urls = MANIFEST.shortcuts.map(s => s.url);
        expect(urls).toContain('/admin');
        expect(urls).toContain('/track');
    });
});

describe('Admin login mobile', () => {
    it('إظهار كلمة المرور بزر عين', () => {
        expect(LOGIN).toContain('togglePasswordBtn');
        expect(LOGIN_JS).toContain('type = show');
        expect(LOGIN_JS).toContain("fa-eye");
    });

    it('autocomplete لـ current-password', () => {
        expect(LOGIN).toContain('autocomplete="current-password"');
    });

    it('رابط عودة للمتجر', () => {
        expect(LOGIN).toContain('href="/"');
        expect(LOGIN).toContain('العودة للمتجر');
    });
});
