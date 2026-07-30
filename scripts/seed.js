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
                productName: "بطاقة ستيم 10 دولار - محلي",
                category: "steam",
                region: "global",
                price: 11.50,
                isExternal: false,
                codes: [
                    { value: "STEAM-1234-5678", status: 'available' },
                    { value: "STEAM-8765-4321", status: 'available' }
                ]
            },
            {
                productName: "لعبة ببجي موبايل - خارجي",
                category: "pubg",
                region: "global",
                price: 15.00,
                isExternal: true,
                externalId: "pubg_100uc",
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
