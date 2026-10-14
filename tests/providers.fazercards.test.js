jest.mock('axios');
jest.mock('../providers/bestPrice', () => ({
    buildGroupKey: jest.fn(({ category, region, name }) => `${category}:${region}:${name}`)
}));

const axios = require('axios');
const {
    fetchCatalog,
    normalizeItem,
    fetchBalance,
    purchaseItem,
    parseExternalId,
    extractOrderCodes,
    inferCategory,
    _internal
} = require('../providers/fazercards');

const mockProvider = {
    name: 'FazerCards',
    baseUrl: 'https://api.fazercards.com',
    apiKey: 'test-key-123',
    apiKeyHeader: 'X-API-Key',
    currency: 'USD',
    defaultCategory: 'gaming_general',
    defaultRegion: 'global'
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('FazerCards Adapter', () => {
    describe('parseExternalId', () => {
        test('parses gift card ID correctly', () => {
            const result = parseExternalId('gift_card:cat123:card456');
            expect(result).toEqual({
                kind: 'gift_card',
                categoryId: 'cat123',
                offerId: 'card456'
            });
        });

        test('parses game key ID correctly', () => {
            const result = parseExternalId('game_key:game789:key012');
            expect(result).toEqual({
                kind: 'game_key',
                categoryId: 'game789',
                offerId: 'key012'
            });
        });

        test('throws on invalid ID format', () => {
            expect(() => parseExternalId('invalid')).toThrow('معرّف خارجي غير صالح');
        });

        test('throws on unsupported kind', () => {
            expect(() => parseExternalId('crypto:cat:offer')).toThrow('نوع غير مدعوم');
        });
    });

    describe('extractOrderCodes', () => {
        test('extracts codes from payload.codes', () => {
            const order = { payload: { codes: ['ABC123', 'DEF456'] } };
            expect(extractOrderCodes(order)).toEqual(['ABC123', 'DEF456']);
        });

        test('extracts single code from payload.code', () => {
            const order = { payload: { code: 'SINGLE123' } };
            expect(extractOrderCodes(order)).toEqual(['SINGLE123']);
        });

        test('extracts from payload.pin', () => {
            const order = { payload: { pin: 'PIN123' } };
            expect(extractOrderCodes(order)).toEqual(['PIN123']);
        });

        test('extracts from nested items array', () => {
            const order = {
                payload: {
                    items: [{ code: 'ITEM1' }, { pin: 'ITEM2' }, 'ITEM3']
                }
            };
            expect(extractOrderCodes(order)).toEqual(['ITEM1', 'ITEM2', 'ITEM3']);
        });

        test('returns empty array for no codes', () => {
            expect(extractOrderCodes({ payload: {} })).toEqual([]);
            expect(extractOrderCodes({})).toEqual([]);
        });
    });

    describe('inferCategory', () => {
        test('maps steam', () => {
            expect(inferCategory('Steam Gift Card', mockProvider)).toBe('steam');
        });

        test('maps playstation', () => {
            expect(inferCategory('PSN Card', mockProvider)).toBe('playstation');
            expect(inferCategory('PlayStation Gift Card', mockProvider)).toBe('playstation');
        });

        test('maps xbox', () => {
            expect(inferCategory('Xbox Live Gold', mockProvider)).toBe('xbox');
        });

        test('maps pubg', () => {
            expect(inferCategory('PUBG Unknown Cash', mockProvider)).toBe('pubg');
        });

        test('maps fortnite', () => {
            expect(inferCategory('Fortnite V-Bucks', mockProvider)).toBe('fortnite');
        });

        test('maps google', () => {
            expect(inferCategory('Google Play Gift Card', mockProvider)).toBe('google');
        });

        test('maps itunes', () => {
            expect(inferCategory('Apple App Store', mockProvider)).toBe('itunes');
            expect(inferCategory('iTunes Gift Card', mockProvider)).toBe('itunes');
        });

        test('maps razer', () => {
            expect(inferCategory('Razer Gold', mockProvider)).toBe('razer_gold');
        });

        test('maps amazon', () => {
            expect(inferCategory('Amazon Gift Card', mockProvider)).toBe('amazon');
        });

        test('uses provider categoryMapping', () => {
            const providerWithMapping = {
                ...mockProvider,
                categoryMapping: { 'custom card': 'vpn' }
            };
            expect(inferCategory('custom card', providerWithMapping)).toBe('vpn');
        });

        test('returns default for unknown', () => {
            expect(inferCategory('Unknown Product', mockProvider)).toBe('gaming_general');
        });

        test('handles empty/null name', () => {
            expect(inferCategory(null, mockProvider)).toBe('gaming_general');
            expect(inferCategory('', mockProvider)).toBe('gaming_general');
        });
    });

    describe('fetchBalance', () => {
        test('returns balance on success', async () => {
            axios.get.mockResolvedValue({ data: { ok: true, balance: 150.50, currency: 'USD' } });
            const result = await fetchBalance(mockProvider);
            expect(result.status).toBe('متصل');
            expect(result.balance).toBe(150.50);
            expect(result.currency).toBe('USD');
        });

        test('returns error on failure', async () => {
            axios.get.mockRejectedValue(new Error('Network error'));
            const result = await fetchBalance(mockProvider);
            expect(result.status).toBe('غير متصل');
            expect(result.balance).toBe(0);
            expect(result.error).toBe('Network error');
        });

        test('returns error for invalid balance', async () => {
            axios.get.mockResolvedValue({ data: { balance: 'invalid' } });
            const result = await fetchBalance(mockProvider);
            expect(result.status).toBe('غير متصل');
        });
    });

    describe('normalizeItem', () => {
        test('normalizes gift card item', () => {
            const item = {
                id: 'gift_card:cat1:card1',
                name: { ar: '', en: 'Steam Card $10' },
                price: 10,
                currency: 'USD',
                stock: 5
            };
            const result = normalizeItem(mockProvider, item);
            expect(result.category).toBe('steam');
            expect(result.region).toBe('global');
            expect(result.groupKey).toBeDefined();
        });

        test('normalizes game key item with region', () => {
            const item = {
                id: 'game_key:game1:key1',
                name: { ar: '', en: 'Fortnite V-Bucks' },
                price: 5,
                currency: 'USD',
                stock: 10,
                region: 'us'
            };
            const result = normalizeItem(mockProvider, item);
            expect(result.category).toBe('fortnite');
            expect(result.region).toBe('us');
        });

        test('uses default category for unknown', () => {
            const item = {
                id: 'gift_card:cat1:card1',
                name: { ar: '', en: 'Random Unknown Item' },
                price: 5,
                currency: 'USD'
            };
            const result = normalizeItem(mockProvider, item);
            expect(result.category).toBe('gaming_general');
        });
    });

    describe('fetchCatalog', () => {
        test('fetches gift cards and game keys', async () => {
            const mockGiftCategories = {
                items: [{ category_id: 'cat1', name: 'Steam' }],
                meta: { has_more: false }
            };
            const mockGiftCards = {
                offers: [{ card_id: 'card1', price_usd: 10, stock: 5, name: 'Steam $10' }],
                meta: { has_more: false }
            };
            const mockGameCategories = {
                items: [{ game_id: 'game1', name: 'Fortnite', region: 'global' }],
                meta: { has_more: false }
            };
            const mockGameKeys = {
                keys: [{ key_id: 'key1', price_usd: 5, stock: 10, name: 'V-Bucks' }],
                meta: { has_more: false }
            };

            axios.get
                .mockResolvedValueOnce({ data: mockGiftCategories })
                .mockResolvedValueOnce({ data: mockGiftCards })
                .mockResolvedValueOnce({ data: mockGameCategories })
                .mockResolvedValueOnce({ data: mockGameKeys });

            const items = await fetchCatalog(mockProvider);
            expect(items).toHaveLength(2);
            expect(items[0].id).toBe('gift_card:cat1:card1');
            expect(items[1].id).toBe('game_key:game1:key1');
        });

        test('handles empty catalog', async () => {
            axios.get
                .mockResolvedValueOnce({ data: { items: [], meta: { has_more: false } } })
                .mockResolvedValueOnce({ data: { items: [], meta: { has_more: false } } });

            const items = await fetchCatalog(mockProvider);
            expect(items).toHaveLength(0);
        });
    });
});
