require('dotenv').config();
const mongoose = require('mongoose');
const { Category } = require('../models');

async function seedCategories() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to the database for category seeding...');

        const categories = [
            { key: 'gaming_general', order: 1, ar: 'الألعاب', en: 'Games', image: 'image/games.png', desc_ar: 'بطاقات شحن لمختلف الألعاب', desc_en: 'Gift cards for various games' },
            { key: 'steam', order: 2, ar: 'ستيم', en: 'Steam', image: 'image/steam.png', desc_ar: 'بطاقات Steam Wallet بالدولار', desc_en: 'Steam Wallet cards in USD' },
            { key: 'pubg', order: 3, ar: 'ببجي موبايل', en: 'PUBG Mobile', image: 'image/pubg.png', desc_ar: 'شدات ببجي الأصلية', desc_en: 'Official PUBG UC' },
            { key: 'fortnite', order: 4, ar: 'فورتنايت', en: 'Fortnite', image: 'image/fortnite.png', desc_ar: 'V-Bucks فورتنايت', desc_en: 'Fortnite V-Bucks' },
            { key: 'playstation', order: 5, ar: 'بلايستيشن', en: 'PlayStation', image: 'image/playstation.png', desc_ar: 'PSN Gift Cards', desc_en: 'PSN Gift Cards' },
            { key: 'xbox', order: 6, ar: 'إكس بوكس', en: 'Xbox', image: 'image/xbox.png', desc_ar: 'Xbox Gift Cards', desc_en: 'Xbox Gift Cards' },
            { key: 'microsoft_windows', order: 7, ar: 'ويندوز وأوفيس', en: 'Windows & Office', image: 'image/windows.png', desc_ar: 'مفاتيح أصلية مضمونة', desc_en: 'Guaranteed original keys' },
            { key: 'adobe', order: 8, ar: 'أدوبي', en: 'Adobe', image: 'image/adobe.png', desc_ar: 'Adobe Creative Cloud', desc_en: 'Adobe Creative Cloud' },
            { key: 'antivirus', order: 9, ar: 'الحماية الرقمية', en: 'Antivirus', image: 'image/antivirus.png', desc_ar: 'حماية شاملة لأجهزتك', desc_en: 'Total protection for your devices' },
            { key: 'vpn', order: 10, ar: 'VPN', en: 'VPN', image: 'image/vpn.png', desc_ar: 'تصفح آمن وخصوصية كاملة', desc_en: 'Secure browsing and full privacy' },
            { key: 'google', order: 11, ar: 'جوجل بلاي', en: 'Google Play', image: 'image/google_play.png', desc_ar: 'Google Play Gift Cards', desc_en: 'Google Play Gift Cards' },
            { key: 'itunes', order: 12, ar: 'آيتونز', en: 'iTunes', image: 'image/itunes.png', desc_ar: 'Apple Gift Cards', desc_en: 'Apple Gift Cards' },
            { key: 'razer_gold', order: 13, ar: 'ريزر جولد', en: 'Razer Gold', image: 'image/razer.png', desc_ar: 'Razer Gold العالمية', desc_en: 'Razer Gold Global' },
            { key: 'amazon', order: 14, ar: 'أمازون', en: 'Amazon', image: 'image/amazon.png', desc_ar: 'Amazon Gift Cards', desc_en: 'Amazon Gift Cards' }
        ];

        let updateCount = 0;
        for (const cat of categories) {
            const filter = { key: cat.key };
            const update = {
                $set: {
                    'title.ar': cat.ar,
                    'title.en': cat.en,
                    'description.ar': cat.desc_ar,
                    'description.en': cat.desc_en,
                    image: cat.image,
                    order: cat.order,
                    isActive: true
                }
            };
            const result = await Category.updateOne(filter, update, { upsert: true });
            if (result.upsertedId) {
                console.log(`   -> Added '${cat.en}' category`);
                updateCount++;
            } else if (result.modifiedCount > 0) {
                console.log(`   -> Updated '${cat.en}' category`);
                updateCount++;
            }
        }

        console.log(`✅ Category seeding complete. ${updateCount} categories were added or updated.`);
        process.exit();
    } catch (err) {
        console.error('❌ Error during category seeding:', err);
        process.exit(1);
    }
}

seedCategories();
