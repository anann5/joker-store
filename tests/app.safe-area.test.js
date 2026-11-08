// اختبارات إصلاح تداخل منطقة الأمان (نوتش) في التطبيق:
//   - skip-link مخفي تماماً فوق الشاشة (لا حافة زر)
//   - الهيدر يغطي Safe Area بنفسه (top:0 + padding-top)
//   - شريط التحديث مخفي بـ visibility حتى لا يظهر حافة

const fs = require('fs');
const path = require('path');

const CSS = path.join(__dirname, '..', 'public', 'style.css');
const css = fs.readFileSync(CSS, 'utf8');

function block(selector) {
    const start = css.indexOf(selector);
    if (start === -1) return '';
    // 600 حرف كافية للكتلة الأولى
    return css.slice(start, start + 800);
}

describe('Safe-area fix: skip-link مخفي تماماً', () => {
    it('يبدأ فوق الشاشة (-80px) لا بإزاحة جزئية', () => {
        const b = block('.skip-link {');
        expect(b).toContain('top: -80px');
        expect(b).not.toContain('translateY(-160%)');
    });

    it('يظهر عند التركيز فقط عند safe-top', () => {
        expect(css).toContain('.skip-link:focus');
        expect(css).toContain('top: calc(10px + var(--safe-top))');
    });
});

describe('Safe-area fix: الهيدر يغطي المنطقة', () => {
    it('top:0 مع padding-top safe بدل إزاحة sticky', () => {
        const anchor = css.indexOf('Android edge-to-edge');
        expect(anchor).toBeGreaterThan(-1);
        const segment = css.slice(anchor, anchor + 600);
        expect(segment).toContain('top: 0');
        expect(segment).toContain('padding-top: var(--safe-top');
        // body لا يضيف padding-top مزدوجاً فوق الهيدر
        expect(css).not.toMatch(/body\s*\{\s*padding-top:\s*var\(--safe-top/);
    });
});

describe('Safe-area fix: شريط التحديث مخفي', () => {
    it('المخفي visibility:hidden وليس opacity فقط', () => {
        const b = block('.app-update-bar {');
        expect(b).toContain('visibility: hidden');
        expect(b).toContain('opacity: 0');
        expect(b).not.toContain('-140%');
    });

    it('الظهور يعيد visibility', () => {
        const show = css.indexOf('.app-update-bar.show');
        expect(css.slice(show, show + 300)).toContain('visibility: visible');
    });
});
