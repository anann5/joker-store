const dotenv = require('dotenv');
dotenv.config(); // تحميل المتغيرات البيئية من ملف .env

const mongoose = require('mongoose');
const { Product, Category } = require('./models'); // استيراد الموديلات

// دالة الاتصال بقاعدة البيانات
const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) { // 🔥 تم التعديل هنا ليصبح MONGODB_URI
            console.error('❌ خطأ: متغير البيئة MONGODB_URI غير محدد في ملف .env');
            process.exit(1);
        }

        await mongoose.connect(process.env.MONGODB_URI);
        
        console.log('✅ MongoDB Connected for seeding...');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        process.exit(1);
    }
};

// بيانات الأقسام التجريبية
const sampleCategories = [
    {
        key: 'gaming_general',
        title: { ar: 'الألعاب العامة', en: 'General Gaming' },
        description: { ar: 'بطاقات شحن لألعاب متنوعة', en: 'Recharge cards for various games' },
        image: 'image/games.png',
        isActive: true,
        order: 1
    },
    {
        key: 'pubg',
        title: { ar: 'ببجي', en: 'PUBG' },
        description: { ar: 'شدات ببجي موبايل', en: 'PUBG Mobile UC' },
        image: 'image/pubg.png',
        isActive: true,
        order: 2
    },
    {
        key: 'steam',
        title: { ar: 'ستيم', en: 'Steam' },
        description: { ar: 'بطاقات ستيم لشراء الألعاب', en: 'Steam Wallet Cards' },
        image: 'image/steam.png',
        isActive: true,
        order: 3
    },
    {
        key: 'playstation',
        title: { ar: 'بلايستيشن', en: 'PlayStation' },
        description: { ar: 'بطاقات بلايستيشن ستور', en: 'PlayStation Store Cards' },
        image: 'image/playstation.png',
        isActive: true,
        order: 4
    },
    {
        key: 'xbox',
        title: { ar: 'إكس بوكس', en: 'Xbox' },
        description: { ar: 'بطاقات إكس بوكس لايف', en: 'Xbox Live Cards' },
        image: 'image/xbox.png',
        isActive: true,
        order: 5
    },
    {
        key: 'google',
        title: { ar: 'جوجل بلاي', en: 'Google Play' },
        description: { ar: 'بطاقات جوجل بلاي', en: 'Google Play Cards' }, // Changed description to match image
        image: 'image/google_play.png', // 🔥 Changed from google.png to google_play.png
        isActive: true,
        order: 6
    },
    {
        key: 'itunes',
        title: { ar: 'آيتونز', en: 'iTunes' },
        description: { ar: 'بطاقات آيتونز', en: 'iTunes Cards' },
        image: 'image/itunes.png',
        isActive: true,
        order: 7
    }
];

// بيانات المنتجات التجريبية
const sampleProducts = [
    {
        productName: { ar: 'شدات ببجي 600 UC', en: 'PUBG 600 UC' },
        category: 'pubg',
        region: 'global',
        price: 10.00,
        description: { ar: 'شدات ببجي موبايل 600 UC صالحة لجميع المناطق.', en: 'PUBG Mobile 600 UC valid for all regions.' },
        image: 'image/pubg_600uc.png',
        codes: [{ value: 'PUBG600-CODE1', status: 'available' }, { value: 'PUBG600-CODE2', status: 'available' }],
        isActive: true,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 أيام مضت
    },
    {
        productName: { ar: 'شدات ببجي 1800 UC', en: 'PUBG 1800 UC' },
        category: 'pubg',
        region: 'global',
        price: 25.00,
        description: { ar: 'شدات ببجي موبايل 1800 UC صالحة لجميع المناطق.', en: 'PUBG Mobile 1800 UC valid for all regions.' },
        image: 'image/pubg_1800uc.png',
        codes: [{ value: 'PUBG1800-CODE1', status: 'available' }],
        isActive: true,
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 أيام مضت
    },
    {
        productName: { ar: 'بطاقة ستيم 10$', en: 'Steam Card 10$' },
        category: 'steam',
        region: 'us',
        price: 10.50,
        description: { ar: 'بطاقة ستيم بقيمة 10 دولار أمريكي.', en: 'Steam Wallet Card worth 10 USD.' },
        image: 'image/steam_10usd.png',
        codes: [{ value: 'STEAM10-CODE1', status: 'available' }],
        isActive: true,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 أيام مضت
    },
    {
        productName: { ar: 'بطاقة بلايستيشن 50$', en: 'PlayStation Card 50$' },
        category: 'playstation',
        region: 'us',
        price: 52.00,
        description: { ar: 'بطاقة بلايستيشن ستور بقيمة 50 دولار أمريكي.', en: 'PlayStation Store Card worth 50 USD.' },
        image: 'image/psn_50usd.png',
        codes: [{ value: 'PSN50-CODE1', status: 'available' }],
        isActive: true,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // يومين مضت
    },
    {
        productName: { ar: 'بطاقة جوجل بلاي 10$', en: 'Google Play Card 10$' },
        category: 'google',
        region: 'us',
        price: 10.50,
        description: { ar: 'بطاقة جوجل بلاي بقيمة 10 دولار أمريكي.', en: 'Google Play Card worth 10 USD.' },
        image: 'image/google_10usd.png',
        codes: [{ value: 'GPLAY10-CODE1', status: 'available' }],
        isActive: true,
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // 4 أيام مضت
    },
    {
        productName: { ar: 'بطاقة ألعاب عامة 5$', en: 'General Gaming Card 5$' },
        category: 'gaming_general',
        region: 'global',
        price: 5.25,
        description: { ar: 'بطاقة ألعاب عامة بقيمة 5 دولار.', en: 'General Gaming Card worth 5 USD.' },
        image: 'image/gaming_5usd.png',
        codes: [{ value: 'GAMING5-CODE1', status: 'available' }],
        isActive: true,
        createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000) // 9 أيام مضت
    }
];

// دالة استيراد البيانات
const importData = async () => {
    try {
        await connectDB();

        console.log('🗑️ Clearing existing data...');
        await Category.deleteMany();
        await Product.deleteMany();

        console.log('📦 Importing sample categories...');
        await Category.insertMany(sampleCategories);
        console.log('✅ Categories imported!');

        console.log('📦 Importing sample products...');
        await Product.insertMany(sampleProducts);
        console.log('✅ Products imported!');

        console.log('🎉 Data Imported Successfully!');
        process.exit(); // إنهاء العملية بنجاح
    } catch (error) {
        console.error('❌ Error importing data:', error);
        process.exit(1); // إنهاء العملية مع خطأ
    }
};

importData();