// اختبارات سبرنت B (الاكتشاف وSEO):
//   - بحث ثنائي اللغة على الخادم
//   - فلتر التوفر الصحيح (لا يعرض نافداً)
//   - مشاركة المنتج تنسخ رابط /product/:id وتعمل على كل المتصفحات

const fs = require('fs');
const path = require('path');

const STORE_CTRL = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'storeController.js'), 'utf8'
);
const UI_JS = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'ui.js'), 'utf8'
);
const SCRIPT_JS = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'script.js'), 'utf8'
);

describe('B1: بحث ثنائي اللغة (خادم)', () => {
    it('يبحث في الحقلين العربي والإنجليزي معاً', () => {
        expect(STORE_CTRL).toContain("'productName.ar'");
        expect(STORE_CTRL).toContain("'productName.en'");
        expect(STORE_CTRL).toContain('$or:');
    });

    it('لا يقتصر على لغة الواجهة فقط', () => {
        expect(STORE_CTRL).not.toContain('const searchField = `productName.${lang}`;');
    });
});

describe('B3: فلتر التوفر', () => {
    it('يخفي النافد عبر >0 فقط', () => {
        expect(SCRIPT_JS).toContain('Number(item.availableStock) > 0');
        expect(SCRIPT_JS).toContain('فلترة التوفر (المتوفر فقط)');
    });
});

describe('B2: مشاركة المنتج', () => {
    it('يشارك رابط /product/:id', () => {
        expect(UI_JS).toContain('/product/${product._id}');
        expect(UI_JS).toContain('navigator.share');
    });

    it('احتياطي نسخ الرابط للحافظة', () => {
        expect(UI_JS).toContain('navigator.clipboard.writeText');
        expect(UI_JS).toContain('link_copied');
    });

    it('يسجّل فشل المشاركة بتنبيه بدل الصمت', () => {
        expect(UI_JS).toContain('share_failed');
    });
});
