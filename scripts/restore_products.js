require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('../models');

/**
 * A non-destructive seed script to add or update products.
 * This script uses updateOne with upsert:true, so it won't delete existing data.
 * It's designed to restore products based on file names from previous 404 errors.
 */
async function restoreProducts() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to the database for product restoration...');

        const productsToRestore = [
            {
                filter: { externalId: 'pubg_600uc' },
                doc: {
                    productName: { ar: 'ببجي 600 شده', en: 'PUBG 600 UC' },
                    category: 'pubg',
                    region: 'global',
                    price: 10.00,
                    isActive: true,
                    image: 'pubg.png', // Use generic pubg image
                    isExternal: true,
                    externalId: 'pubg_600uc'
                }
            },
            {
                filter: { externalId: 'pubg_1800uc' },
                doc: {
                    productName: { ar: 'ببجي 1800 شده', en: 'PUBG 1800 UC' },
                    category: 'pubg',
                    region: 'global',
                    price: 28.00,
                    isActive: true,
                    image: 'pubg.png', // Use generic pubg image
                    isExternal: true,
                    externalId: 'pubg_1800uc'
                }
            },
            {
                filter: { externalId: 'gaming_5usd' },
                doc: {
                    productName: { ar: 'بطاقة ألعاب 5 دولار', en: 'Gaming Card $5' },
                    category: 'gaming_general',
                    region: 'global',
                    price: 5.00,
                    isActive: true,
                    image: 'games.png',
                    isExternal: false,
                    externalId: 'gaming_5usd',
                    codes: [{ value: 'GAME-5-USD-XXXX', status: 'available' }]
                }
            },
            {
                filter: { externalId: 'psn_50usd' },
                doc: {
                    productName: { ar: 'بطاقة بلايستيشن 50 دولار أمريكي', en: 'PlayStation Network $50 US' },
                    category: 'playstation',
                    region: 'us',
                    price: 52.00,
                    isActive: true,
                    image: 'playstation.png',
                    isExternal: false,
                    externalId: 'psn_50usd',
                    codes: [{ value: 'PSN-50-USD-XXXX', status: 'available' }]
                }
            },
            {
                filter: { externalId: 'google_10usd' },
                doc: {
                    productName: { ar: 'بطاقة جوجل بلاي 10 دولار أمريكي', en: 'Google Play $10 US' },
                    category: 'google',
                    region: 'us',
                    price: 11.00,
                    isActive: true,
                    image: 'google.png',
                    isExternal: false,
                    externalId: 'google_10usd',
                    codes: [{ value: 'GOOG-10-USD-XXXX', status: 'available' }]
                }
            },
            {
                filter: { 'codes.value': 'STEAM-1234-5678' },
                doc: {
                    productName: { ar: 'بطاقة ستيم 10 دولار', en: 'Steam Card $10' },
                    category: 'steam',
                    region: 'global',
                    price: 11.50,
                    isActive: true,
                    image: 'steam.png',
                    isExternal: false,
                    codes: [{ value: 'STEAM-1234-5678', status: 'available' }, { value: 'STEAM-8765-4321', status: 'available' }]
                }
            }
        ];

        let updateCount = 0;
        for (const p of productsToRestore) {
            // eslint-disable-next-line no-await-in-loop
            const result = await Product.updateOne(p.filter, { $set: p.doc }, { upsert: true });
            if (result.upsertedId) {
                console.log(`   -> Added '${p.doc.productName.en}'`);
                updateCount++;
            } else if (result.modifiedCount > 0) {
                console.log(`   -> Updated '${p.doc.productName.en}'`);
                updateCount++;
            }
        }

        console.log(`✅ Product restoration complete. ${updateCount} products were added or updated.`);
        process.exit();
    } catch (err) {
        console.error('❌ Error during product restoration:', err);
        process.exit(1);
    }
}

restoreProducts();
