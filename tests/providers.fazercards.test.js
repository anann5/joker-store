const fazercards = require('../providers/fazercards');

const fakeProvider = {
    name: 'FZR',
    adapterType: 'fazercards',
    baseUrl: 'https://api.fzr.cards/api/v2',
    apiKey: 'fc_test',
    apiKeyHeader: 'X-API-Key',
    currency: 'USD',
    defaultCategory: 'gaming_general',
    defaultRegion: 'global',
    categoryMapping: {},
    regionMapping: {},
    margin: 1.2
};

describe('FazerCards Adapter', () => {
    it('يحلّل المعرّف الخارجي بأنواعه', () => {
        expect(fazercards.parseExternalId('gift_card:gc_steam_1:card_10usd'))
            .toEqual({ kind: 'gift_card', categoryId: 'gc_steam_1', offerId: 'card_10usd' });
        expect(fazercards.parseExternalId('game_key:gk_x:key_1'))
            .toEqual({ kind: 'game_key', categoryId: 'gk_x', offerId: 'key_1' });
    });

    it('يرفض المعرّفات غير الصالحة', () => {
        expect(() => fazercards.parseExternalId('nope')).toThrow('معرّف خارجي غير صالح');
        expect(() => fazercards.parseExternalId('other:g:c')).toThrow('نوع غير مدعوم');
    });

    it('يستخرج الأكواد من استجابات الطلب المكتمل بصيغ متعددة', () => {
        expect(fazercards.extractOrderCodes({ payload: { codes: ['a', 'b'] } })).toEqual(['a', 'b']);
        expect(fazercards.extractOrderCodes({ payload: { code: 'x' } })).toEqual(['x']);
        expect(fazercards.extractOrderCodes({ payload: { pin: 'y' } })).toEqual(['y']);
        expect(fazercards.extractOrderCodes({ payload: { items: [{ code: 'c' }, 'raw'] } })).toEqual(['c', 'raw']);
        expect(fazercards.extractOrderCodes({ payload: { codes: ['a', ''] } })).toEqual(['a']);
        expect(fazercards.extractOrderCodes({ payload: { codes: [''] } })).toEqual([]);
        expect(fazercards.extractOrderCodes({ payload: {} })).toEqual([]);
    });

    it('يطبّع عنصر بطاقة هدية مع تمييز القسم من الاسم', () => {
        const item = {
            id: 'gift_card:gc_steam_1:card_10usd',
            name: { ar: '', en: 'Steam — $10' },
            price: 10.5,
            currency: 'USD',
            stock: 100
        };
        const normalized = fazercards.normalizeItem(fakeProvider, item);
        expect(normalized.category).toBe('steam');
        expect(normalized.region).toBe('global');
        expect(normalized.groupKey).toContain('steam');
        expect(normalized.groupKey).toContain('global');
        expect(normalized.groupKey).toContain('steam 10');
    });

    it('يطبّع عنصر مفتاح لعبة مع احترام المنطقة', () => {
        const item = {
            id: 'game_key:gk_pubg_1:key_1',
            name: { ar: '', en: 'PUBG Standard' },
            price: 19.99,
            currency: 'USD',
            stock: 5,
            region: 'SA'
        };
        const normalized = fazercards.normalizeItem(fakeProvider, item);
        expect(normalized.category).toBe('pubg');
        expect(normalized.region).toBe('sa');
    });

    it('يدفع المنطقة خارج القائمة المسموحة إلى الافتراضية', () => {
        const normalized = fazercards.normalizeItem(fakeProvider, {
            id: 'game_key:gk_x:key_1',
            name: { en: 'Roblox Robux' },
            price: 5,
            currency: 'USD',
            region: 'PL'
        });
        expect(normalized.region).toBe('global');
    });
});