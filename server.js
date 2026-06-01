require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5850; // البورت الخاص بك 5850

// الاتصال بقاعدة البيانات
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ تم الاتصال بمونجو بنجاح!'))
  .catch((err) => console.log('⚠️ لم يتم الاتصال بمونجو محلياً، لكن السيرفر مستمر في العمل لإتاحة فحص التصميم:', err.message));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// ====================================================
// الكود الجديد: لوحة التحكم بهامش الربح والمنتجات الوهمية
// ====================================================

const PROFIT_PERCENTAGE = 0.08; // نسبة ربحك (8%)
const FIXED_PROFIT = 0.50;      // مبلغ ربح ثابت إضافي (نصف دولار) لضمان الفائدة في البطاقات الصغيرة

// قاعدة بيانات مؤقتة تحاكي البيانات التي سيرسلها المورد (Turgame) بسعر التكلفة الأصلي لشحن الرصيد
const mockSupplierData = {
    steam: [
        { id: "ST-10", name: "Steam Gift Card 10$ Global", costPrice: 9.20 },
        { id: "ST-20", name: "Steam Gift Card 20$ Global", costPrice: 18.40 },
        { id: "ST-50", name: "Steam Gift Card 50$ Global", costPrice: 46.00 }
    ],
    pubg: [
        { id: "PB-60", name: "PUBG Mobile 60 UC", costPrice: 0.80 },
        { id: "PB-325", name: "PUBG Mobile 325 UC", costPrice: 3.90 },
        { id: "PB-660", name: "PUBG Mobile 660 UC", costPrice: 7.75 }
    ],
    fortnite: [
        { id: "FT-1000", name: "Fortnite 1000 V-Bucks", costPrice: 7.90 },
        { id: "FT-2800", name: "Fortnite 2800 V-Bucks", costPrice: 19.90 }
    ],
    playstation: [
        { id: "PS-10", name: "PlayStation Store 10$ US", costPrice: 9.60 },
        { id: "PS-20", name: "PlayStation Store 20$ US", costPrice: 19.30 }
    ]
    // ملاحظة: يمكنك إضافة باقي الأقسام (أدوبي، ويندوز، vpn...) بنفس الطريقة هنا لاحقاً
};

// دالة حساب السعر النهائي للزبون شامل الربح تلقائياً
function calculateSellingPrice(costPrice) {
    let finalPrice = costPrice + (costPrice * PROFIT_PERCENTAGE) + FIXED_PROFIT;
    return parseFloat(finalPrice.toFixed(2)); // تقريب لكسر عشري من خانتين
}

// الـ API الجديد الذي ستطلبه واجهة المتصفح (Frontend)
app.get('/api/products/:category', (req, res) => {
    const category = req.params.category.toLowerCase();
    
    // إذا لم يجد القسم عند المورد، يرسل مصفوفة فارغة كي لا ينهار الموقع
    if (!mockSupplierData[category]) {
        return res.json([]);
    }

    // تعديل الأسعار فوراً وضخ هامش الربح قبل إرسال المنتجات للزبون
    const clientProducts = mockSupplierData[category].map(product => {
        return {
            id: product.id,
            name: product.name,
            price: calculateSellingPrice(product.costPrice) // السعر الذكي الجديد
        };
    });

    res.json(clientProducts);
});

// ====================================================


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على بورت ${PORT}`);
});