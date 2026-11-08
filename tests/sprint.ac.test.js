// اختبارات سبرنت A+C (تجربة الشراء + لوحة الأدمن):
//   A1: شريط ثقة في خطوة الدفع (تسليم فوري/ضمان/دعم) + i18n
//   C1: شارة مخزون منخفض على تبويب المخزون
//   C2: تصدير تقارير CSV من اللوحة

const fs = require('fs');
const path = require('path');

const INDEX_HTML = path.join(__dirname, '..', 'public', 'index.html');
const STYLE_CSS = path.join(__dirname, '..', 'public', 'style.css');
const AR_JSON = path.join(__dirname, '..', 'public', 'ar.json');
const EN_JSON = path.join(__dirname, '..', 'public', 'en.json');
const ADMIN_HTML = path.join(__dirname, '..', 'private', 'admin.html');
const ADMIN_CSS = path.join(__dirname, '..', 'private', 'admin-style.css');
const ADMIN_JS = path.join(__dirname, '..', 'private', 'admin.js');

const indexHtml = fs.readFileSync(INDEX_HTML, 'utf8');
const styleCss = fs.readFileSync(STYLE_CSS, 'utf8');
const ar = JSON.parse(fs.readFileSync(AR_JSON, 'utf8'));
const en = JSON.parse(fs.readFileSync(EN_JSON, 'utf8'));
const adminHtml = fs.readFileSync(ADMIN_HTML, 'utf8');
const adminCss = fs.readFileSync(ADMIN_CSS, 'utf8');
const adminJs = fs.readFileSync(ADMIN_JS, 'utf8');

describe('A1: trust strip', () => {
    it('شريط ثقة داخل خطوة الدفع', () => {
        expect(indexHtml).toContain('trust-strip');
        expect(indexHtml).toContain('trust_instant');
        expect(indexHtml).toContain('trust_guarantee');
        expect(indexHtml).toContain('trust_support');
    });

    it('له نصوص عربية وإنجليزية', () => {
        expect(ar.trust_instant).toBeTruthy();
        expect(ar.trust_guarantee).toBeTruthy();
        expect(en.trust_instant).toBeTruthy();
        expect(en.trust_guarantee).toBeTruthy();
    });

    it('له تنسيق لا يكسر التخطيط على الجوال', () => {
        expect(styleCss).toContain('.trust-strip');
        expect(styleCss).toContain('flex-wrap');
    });
});

describe('C1: low stock badge', () => {
    it('شارة على تبويب المخزون', () => {
        expect(adminHtml).toContain('id="lowStockBadge"');
        expect(adminCss).toContain('.tab-badge');
        expect(adminJs).toContain('lowStockBadge');
        expect(adminJs).toContain('badge.textContent');
    });
});

describe('C2: reports CSV export', () => {
    it('زر تصدير في قسم التقارير', () => {
        expect(adminHtml).toContain('id="exportReportsBtn"');
        expect(adminJs).toContain('exportReportsCsv');
        expect(adminJs).toContain('downloadCsv');
        expect(adminJs).toContain('joker-reports-');
    });

    it('يُصدّر المنتجات والأقسام والمزوّدين مع BOM للعربي', () => {
        expect(adminJs).toContain('byProduct');
        expect(adminJs).toContain('byCategory');
        expect(adminJs).toContain('byProvider');
        expect(adminJs).toContain('\\uFEFF');
    });
});
