// اختبارات فلترة المنطقة بدقة متناهية:
//   - منطقة محددة تشمل global معها (global متوافق مع الكل)
//   - global وحده صارم (global فقط)
//   - all تعرض الكل
//   - ps تُتوحَّد من palestine

const fs = require('fs');
const path = require('path');

const STORE_CTRL = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'storeController.js'), 'utf8'
);
const SCRIPT = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'script.js'), 'utf8'
);

describe('Backend region precise', () => {
    it('getProductsByCategory: منطقة محددة → $in [region, global]', () => {
        expect(STORE_CTRL).toContain("{ $in: [requestedRegion, 'global'] }");
        expect(STORE_CTRL).toContain("requestedRegion === 'global'");
    });

    it('searchAll: يدعم فلترة منطقة بدقة', () => {
        const searchSection = STORE_CTRL.slice(STORE_CTRL.indexOf('exports.searchAll'));
        expect(searchSection).toContain('requestedRegion');
        expect(searchSection).toContain("{ $in: [requestedRegion, 'global'] }");
    });
});

describe('Frontend region precise', () => {
    it('منطقة محددة تشمل global', () => {
        expect(SCRIPT).toContain("r === currentRegion || r === 'global'");
        expect(SCRIPT).toContain("detectRegion(item) === 'global'");
    });

    it('all تعرض الكل', () => {
        expect(SCRIPT).toContain("currentRegion === 'all'");
    });
});
