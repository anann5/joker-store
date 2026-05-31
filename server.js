require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose'); // إضافة مكتبة قاعدة البيانات
const app = express();
const PORT = 5850;
require('dotenv').config(); // تأكد من وجود هذا السطر في أول ملف server.js
const mongoose = require('mongoose');

// استخدام المتغير الذي وضعناه في ملف .env
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ تم الاتصال بقاعدة بيانات MongoDB بنجاح!'))
  .catch((err) => console.error('❌ فشل الاتصال بقاعدة البيانات:', err));

// اجعل كل شيء يقرأ ويكتب في مجلد public
const INVENTORY_FILE = path.join(__dirname, 'public', 'inventory.json');
const DATA_FILE = path.join(__dirname, 'public', 'cards.json'); // يفضل أيضاً نقله لـ public

// التأكد من وجود الملفات داخل public حصراً
if (!fs.existsSync(INVENTORY_FILE)) fs.writeFileSync(INVENTORY_FILE, JSON.stringify({}));
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. الواجهة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// اختبار سريع للتأكد من اتصال السيرفر بقاعدة البيانات عند الطلب
app.get('/api/test-db', async (req, res) => {
    try {
        const count = await Card.countDocuments(); // عد البطاقات في القاعدة
        res.send(`قاعدة البيانات تعمل! عدد البطاقات الحالية هو: ${count}`);
    } catch (err) {
        res.send("خطأ في الاتصال بقاعدة البيانات: " + err.message);
    }
});

// 3. إضافة أكواد
app.post('/api/admin/add-codes', (req, res) => {
    try {
        const { productName, codes, region, category } = req.body;
        const inventory = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8') || "{}");
        if (!inventory[category]) inventory[category] = [];
        
        codes.forEach(code => {
            inventory[category].push({ productName, code: code.trim(), status: "available", region, createdAt: new Date() });
        });

        fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2), 'utf8');
        return res.json({ success: true, message: 'تمت الإضافة بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
});

// 4. الـ Webhook الذكي
app.post('/api/v1/payments/webhook', async (req, res) => {
    const { paymentGateway, orderDetails } = req.body;
    const { category, productName } = orderDetails || {};

    if (!category || !productName) return res.status(400).json({ success: false, message: "بيانات ناقصة" });

    if (paymentGateway === 'PAYPAL') {
        const assignedCode = await pullCode(category, productName);
        if (!assignedCode) return res.status(400).json({ success: false, message: "نفدت الكمية!" });
        return res.json({ success: true, code: assignedCode });
    }
    res.status(200).json({ success: true, isPending: true });
});

// 5. الدوال المنطقية (السحب الذكي)
function pullCodeFromLocalInventory(category, productName) {
    const inventory = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8') || "{}");
    const categoryCodes = inventory[category] || [];
    const index = categoryCodes.findIndex(c => c.status === "available" && c.productName === productName);

    if (index !== -1) {
        categoryCodes[index].status = "sold";
        categoryCodes[index].soldAt = new Date();
        fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2), 'utf8');
        return categoryCodes[index].code;
    }
    return null;
}

async function getCodeFromSupplier(category, productName) {
    try {
        // تأكد أن الروابط في ملف .env صحيحة
        const response = await axios.post(`${process.env.TURGAME_API_URL}/get-code`, {
            apiKey: process.env.TURGAME_API_KEY,
            category,
            product: productName
        });
        return response.data?.code || null;
    } catch (error) {
        console.error("خطأ الاتصال بالمورد:", error.message);
        return null;
    }
}

async function pullCode(category, productName) {
    let code = pullCodeFromLocalInventory(category, productName);
    if (!code) {
        code = await getCodeFromSupplier(category, productName);
    }
    return code;
}

app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`));