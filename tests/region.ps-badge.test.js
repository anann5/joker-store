// اختبارات شارة التوافق مع فلسطين على بطاقة المنتج العالمي:
//   - القالب يحتوي [data-ps-badge] مع 🇵🇸
//   - تظهر فقط للمناطق global/ps
//   - تنسيق زاوية علوية يمين لا يتداخل مع علم المنطقة يساراً

const fs = require('fs');
const path = require('path');

const INDEX = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'index.html'), 'utf8'
);
const SCRIPT = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'script.js'), 'utf8'
);
const CSS = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'style.css'), 'utf8'
);

describe('Palestine compatibility badge', () => {
    it('القالب يحتوي شارة فلسطين مع نص التلميح', () => {
        expect(INDEX).toContain('data-ps-badge');
        expect(INDEX).toContain('🇵🇸');
        expect(INDEX).toContain('يعمل في فلسطين');
    });

    it('تظهر فقط للعالمي والفلسطيني', () => {
        expect(SCRIPT).toContain("detectedRegion === 'global' || detectedRegion === 'ps'");
        expect(SCRIPT).toContain('psBadge.hidden');
    });

    it('موقعها يميناً لا يتداخل مع شارة العلم (يساراً)', () => {
        const start = CSS.indexOf('.card-ps-badge');
        expect(start).toBeGreaterThan(-1);
        expect(CSS.slice(start, start + 600)).toContain('inset-inline-end: 12px');
    });
});
