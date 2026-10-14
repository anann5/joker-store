const registry = require('../providers/registry');

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('Provider Registry', () => {
    it('لا يعيد مزودين عند غياب العدد المعرّف', () => {
        delete process.env.PROVIDERS_COUNT;
        expect(registry.getProviders()).toEqual([]);
        expect(registry.getProvidersSafe()).toEqual([]);
    });

    it('يبني مزوداً واحداً من المتغيرات ويخفي المفتاح في الصيغة الآمنة', () => {
        process.env.PROVIDERS_COUNT = '1';
        process.env.PROVIDER_1_NAME = 'TestProvider';
        process.env.PROVIDER_1_BASE_URL = 'https://api.test.com';
        process.env.PROVIDER_1_API_KEY = 'secret-abc';
        process.env.PROVIDER_1_CURRENCY = 'USD';
        process.env.PROVIDER_1_MARGIN = '1.25';

        const providers = registry.getProviders();
        expect(providers).toHaveLength(1);
        expect(providers[0].name).toBe('TestProvider');
        expect(providers[0].apiKey).toBe('secret-abc');
        expect(providers[0].currency).toBe('USD');
        expect(providers[0].margin).toBe(1.25);
        expect(providers[0].itemsUrl).toBe('https://api.test.com/items');

        const safe = registry.getProvidersSafe();
        expect(safe[0]).not.toHaveProperty('apiKey');
        expect(safe[0].hasApiKey).toBe(true);
    });

    it('يتجاهل المزودين المعطّلين أو الناقصين لمفتاح API', () => {
        process.env.PROVIDERS_COUNT = '3';
        process.env.PROVIDER_1_NAME = 'Disabled';
        process.env.PROVIDER_1_ENABLED = 'false';
        process.env.PROVIDER_1_BASE_URL = 'https://api.test.com';
        process.env.PROVIDER_1_API_KEY = 'k1';

        process.env.PROVIDER_2_NAME = 'NoKey';
        process.env.PROVIDER_2_BASE_URL = 'https://api.test.com';

        process.env.PROVIDER_3_NAME = 'Active';
        process.env.PROVIDER_3_BASE_URL = 'https://api.test.com';
        process.env.PROVIDER_3_API_KEY = 'k3';

        const providers = registry.getProviders();
        expect(providers).toHaveLength(1);
        expect(providers[0].name).toBe('Active');
    });

    it('يبني القيم الافتراضية للمزود عند غياب التفاصيل', () => {
        process.env.PROVIDERS_COUNT = '1';
        process.env.PROVIDER_1_API_KEY = 'k';
        const provider = registry.getProviders()[0];
        expect(provider.authType).toBe('none');
        expect(provider.defaultCategory).toBe('gaming_general');
        expect(provider.defaultRegion).toBe('global');
        expect(provider.balanceUrl).toBe('/balance');
        expect(provider.purchaseUrl).toBe('/buy');
    });

    it('يجد مزوداً بالاسم', () => {
        process.env.PROVIDERS_COUNT = '1';
        process.env.PROVIDER_1_NAME = 'SteamKeys';
        process.env.PROVIDER_1_API_KEY = 'k';
        expect(registry.getProvider('SteamKeys')).not.toBeNull();
        expect(registry.getProvider('Nope')).toBeNull();
    });
});
