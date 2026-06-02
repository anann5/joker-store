const mongoose = require('mongoose');

// تعريف هيكل البطاقة (Schema)
const cardSchema = new mongoose.Schema({
    category: { type: String, required: true },
    title: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String }, // رابط الصورة
    stock: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// تصدير الموديل لاستخدامه في server.js
module.exports = mongoose.model('Card', cardSchema);