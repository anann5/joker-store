const { normalizeRegion, normalizeKey, parseRegionList, isRegionAllowed } = require('../providers/regions');

describe('providers/regions — توحيد المناطق وallowlist المزودين', () => {
    describe('normalizeRegion', () => {
        it('يعيد global عند القيمة الفارغة أو المجهولة', () => {
            expect(normalizeRegion(null)).toBe('global');
            expect(normalizeRegion('')).toBe('global');
            expect(normalizeRegion('   ')).toBe('global');
            expect(normalizeRegion('Mars')).toBe('global');
        });

        it('يحترم القيمة الافتراضية الممررة', () => {
            expect(normalizeRegion('', 'tr')).toBe('tr');
            expect(normalizeRegion(null, null)).toBeNull();
        });

        it('يوحّد الأكواد والصيغ الإنجليزية', () => {
            expect(normalizeRegion('TR')).toBe('tr');
            expect(normalizeRegion('Turkey')).toBe('tr');
            expect(normalizeRegion('Türkiye')).toBe('tr');
            expect(normalizeRegion('United States')).toBe('us');
            expect(normalizeRegion('USA')).toBe('us');
            expect(normalizeRegion('United Arab Emirates')).toBe('ae');
            expect(normalizeRegion('KSA')).toBe('sa');
            expect(normalizeRegion('Vietnam')).toBe('vn');
            expect(normalizeRegion('China')).toBe('cn');
            expect(normalizeRegion('Europe')).toBe('eu');
        });

        it('يوحّد الأسماء العربية (مع الهمزات والتاء المربوطة)', () => {
            expect(normalizeRegion('تركيا')).toBe('tr');
            expect(normalizeRegion('أمريكا')).toBe('us');
            expect(normalizeRegion('الإمارات')).toBe('ae');
            expect(normalizeRegion('السعودية')).toBe('sa');
            expect(normalizeRegion('فيتنام')).toBe('vn');
            expect(normalizeRegion('الصين')).toBe('cn');
            expect(normalizeRegion('أوروبا')).toBe('eu');
        });

        it('يستخرج الكود من قيم مركّبة', () => {
            expect(normalizeRegion('us-east-1')).toBe('us');
            expect(normalizeRegion('Turkey Store')).toBe('tr');
            expect(normalizeRegion('global (worldwide)')).toBe('global');
        });
    });

    describe('parseRegionList', () => {
        it('يقرأ قائمة مفصولة بفواصل ويوحّدها', () => {
            expect(parseRegionList('tr, US , ae')).toEqual(['tr', 'us', 'ae']);
            expect(parseRegionList('Turkey,United States')).toEqual(['tr', 'us']);
        });

        it('يزيل التكرار ويُسقط القيم غير الصالحة', () => {
            expect(parseRegionList('tr,US,tr,??')).toEqual(['tr', 'us']);
        });

        it('يعيد null عند عدم ضبط القائمة (كل المناطق مسموحة)', () => {
            expect(parseRegionList(undefined)).toBeNull();
            expect(parseRegionList('')).toBeNull();
            expect(parseRegionList('   ')).toBeNull();
        });
    });

    describe('isRegionAllowed', () => {
        it('يسمح بالكل عند غياب قائمة مناطق للمزود', () => {
            expect(isRegionAllowed({}, 'us')).toBe(true);
            expect(isRegionAllowed({ regions: null }, 'tr')).toBe(true);
            expect(isRegionAllowed({ regions: [] }, 'ae')).toBe(true);
        });

        it('يطابق القيم بعد التوحيد', () => {
            const provider = { regions: ['tr', 'us'] };
            expect(isRegionAllowed(provider, 'Turkey')).toBe(true);
            expect(isRegionAllowed(provider, 'US')).toBe(true);
            expect(isRegionAllowed(provider, 'ae')).toBe(false);
        });
    });

    it('normalizeKey يوحّد الهمزات والفواصل', () => {
        expect(normalizeKey('  الإمارات ')).toBe('الامارات');
        expect(normalizeKey('us-east-1')).toBe('us east 1');
    });
});
