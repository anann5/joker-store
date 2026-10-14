require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('../models');

async function seedData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ متصل بقاعدة البيانات لعملية التعبئة (Seeding)...');

        // تنظيف البيانات الحالية (اختياري)
        await Product.deleteMany({});

        const sampleProducts = [
            {
                productName: {
                    ar: "بطاقة ستيم 10 دولار - عالمي",
                    en: "Steam Card $10 - Global"
                },
                category: "steam",
                region: "global",
                price: 11.50,
                isActive: true,
                image: "steam.png",
                codes: [
                    { value: "STEAM-1234-5678", status: 'available' },
                    { value: "STEAM-8765-4321", status: 'available' }
                ]
            },
            {
                productName: {
                    ar: "شدات ببجي - 600 شده",
                    en: "PUBG Mobile - 600 UC"
                },
                category: "pubg",
                region: "global",
                price: 15.00,
                isActive: true,
                image: "pubg.png",
                isExternal: true,
                externalId: "pubg_600uc",
                profitMargin: 1.15,
                basePrice: 13.00,
                currentProvider: "SMM_Global"
            }
        ];

        await Product.insertMany(sampleProducts);
        console.log('✅ تم إضافة المنتجات التجريبية بنجاح!');
        process.exit();
    } catch (err) {
        console.error('❌ خطأ أثناء التعبئة:', err);
        process.exit(1);
    }
}

seedData();
