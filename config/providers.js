// config/providers.js

// قائمة المزودين الخارجيين وبيانات الوصول الخاصة بهم
// تم نقلها هنا من adminController.js لتسهيل الصيانة وفصل الإعدادات عن المنطق
const externalProviders = [
    { 
        name: 'SMM_Global', 
        apiUrl: 'https://api.provider-a.com/v2/items', 
        apiKey: process.env.PROVIDER_A_KEY, 
        balanceApiUrl: 'https://api.provider-a.com/v2/balance',
        purchaseUrl: 'https://api.provider-a.com/v2/buy' 
    },
    { 
        name: 'GameKeys_Pro', 
        apiUrl: 'https://api.provider-b.com/v1/products', 
        apiKey: process.env.PROVIDER_B_KEY, 
        balanceApiUrl: 'https://api.provider-b.com/v1/user/balance',
        purchaseUrl: 'https://api.provider-b.com/v1/order'
    }
];

module.exports = externalProviders;
