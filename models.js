const mongoose = require('mongoose');

// ======================================================
// Schema الكود الفردي (مضمّن داخل المنتج)
// ======================================================
const codeSchema = new mongoose.Schema({
    value:     { type: String, required: true, trim: true },
    status:    { type: String, enum: ['available', 'sold', 'reserved'], default: 'available' },
    soldAt:    { type: Date, default: null },
    soldTo:    { type: String, default: null }, // إيميل الزبون
    orderId:   { type: String, default: null }  // رقم الطلب
});

// ======================================================
// Schema المنتج الرئيسي
// ======================================================
const productSchema = new mongoose.Schema({
    productName: { type: String, required: true, trim: true, maxlength: 100 },
    category:    { 
        type: String, 
        required: true,
        enum: ['gaming_general','pubg','fortnite','playstation','xbox',
               'microsoft_windows','adobe','antivirus','vpn','google',
               'itunes','razer_gold','amazon','steam']
    },
    region: { 
        type: String, 
        required: true,
        enum: ['global','us','tr','eu','sa'],
        default: 'global'
    },
    price:       { type: Number, required: true, min: 0 },
    image:       { type: String, default: '' },
    codes:       { type: [codeSchema], default: [] },
    isActive:    { type: Boolean, default: true }, // إخفاء المنتج بدون حذفه
    createdAt:   { type: Date, default: Date.now },
    updatedAt:   { type: Date, default: Date.now }
});

// ======================================================
// Virtual: كم كود متاح؟ (بدون حفظ في DB)
// ======================================================
productSchema.virtual('availableStock').get(function() {
    return this.codes.filter(c => c.status === 'available').length;
});

// ======================================================
// Method: سحب كود واحد بأمان (atomic)
// ======================================================
productSchema.methods.claimCode = async function(orderId, buyerEmail) {
    // دور على أول كود متاح
    const availableCode = this.codes.find(c => c.status === 'available');
    
    if (!availableCode) {
        throw new Error('لا يوجد مخزون متاح لهذا المنتج');
    }

    // حدّث حالة الكود فوراً
    availableCode.status  = 'sold';
    availableCode.soldAt  = new Date();
    availableCode.soldTo  = buyerEmail || 'unknown';
    availableCode.orderId = orderId;
    this.updatedAt        = new Date();

    await this.save();
    return availableCode.value;
};

// ======================================================
// Schema سجل الطلبات
// ======================================================
const orderSchema = new mongoose.Schema({
    orderId:     { type: String, required: true, unique: true },
    productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: { type: String, required: true },
    category:    { type: String, required: true },
    region:      { type: String, required: true },
    price:       { type: Number, required: true },
    buyerEmail:  { type: String, required: true },
    code:        { type: String, default: null }, // الكود المسلّم
    status:      { 
        type: String, 
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentGateway: { type: String, default: 'manual' },
    paymentRef:     { type: String, default: null },
    createdAt:      { type: Date, default: Date.now },
    completedAt:    { type: Date, default: null }
});

module.exports = {
    Product: mongoose.model('Product', productSchema),
    Order:   mongoose.model('Order',   orderSchema)
};