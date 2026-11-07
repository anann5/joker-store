// اختبارات تحسينات الجوال في لوحة الأدمن:
//   - viewport-fit=cover
//   - شريط تنقّل سفلي مرتبط بأزرار التبويبات
//   - جداول responsive-table تتحول لبطاقات
//   - أهداف لمس 44px في CSS

const fs = require('fs');
const path = require('path');

const ADMIN_HTML = path.join(__dirname, '..', 'private', 'admin.html');
const ADMIN_CSS = path.join(__dirname, '..', 'private', 'admin-style.css');
const ADMIN_JS = path.join(__dirname, '..', 'private', 'admin.js');

const html = fs.readFileSync(ADMIN_HTML, 'utf8');
const css = fs.readFileSync(ADMIN_CSS, 'utf8');
const js = fs.readFileSync(ADMIN_JS, 'utf8');

describe('Admin mobile: viewport', () => {
    it('يستخدم viewport-fit=cover للنوتش', () => {
        expect(html).toContain('viewport-fit=cover');
    });
});

describe('Admin mobile: bottom navigation', () => {
    it('يعرض شريطاً سفلياً فقط على الجوال', () => {
        expect(html).toContain('mobile-bottom-nav');
        expect(html).toContain('mobile-nav-item');
        expect(css).toContain('.mobile-bottom-nav');
        expect(css).toContain('max-width: 900px');
        // safe-area للنوتش
        expect(css).toContain('env(safe-area-inset-bottom)');
    });

    it('يربط كل زر سفلي بزر تبويب علوي موجود', () => {
        const targets = [...html.matchAll(/data-target="([a-zA-Z]+TabBtn)"/g)].map(m => m[1]);
        expect(targets.length).toBeGreaterThanOrEqual(5);
        for (const target of targets) {
            expect(html).toContain(`id="${target}"`);
            expect(js).toContain('mobile-nav-item');
        }
    });

    it('يُزامن الحالة النشطة بين الشريطين', () => {
        expect(js).toContain('navItem.dataset.target');
        expect(js).toContain("navItem.classList.toggle('active'");
    });
});

describe('Admin mobile: touch targets', () => {
    it('يرفع الأزرار إلى 44px على الشاشات الصغيرة', () => {
        expect(css).toContain('max-width: 768px');
        expect(css).toContain('min-height: 44px');
    });
});

describe('Admin mobile: responsive tables', () => {
    it('يحوّل الجداول الرئيسية إلى بطاقات على الجوال', () => {
        expect(html).toContain('responsive-table');
        expect(css).toContain('.responsive-table tbody tr');
        expect(css).toContain('attr(data-label)');
    });

    it('يحقن data-label تلقائياً للصفوف الديناميكية', () => {
        expect(js).toContain('applyResponsiveLabels');
        expect(js).toContain('cell.dataset.label');
        expect(js).toContain('MutationObserver');
    });
});
