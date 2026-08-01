const mongoose = require('mongoose');

// ======================================================
// Schema الأقسام (Categories)
// ======================================================
const categorySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, trim: true },
    title: {
        ar: { type: String, required: true, trim: true },
        en: { type: String, required: true, trim: true }
    },
    description: {
        ar: { type: String, trim: true, default: '' },
        en: { type: String, trim: true, default: '' }
    },
    image: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 } // للتحكم في ترتيب الظهور
});

// ======================================================
// Schema المستخدم (لإدارة المحفظة والرصيد)
// ======================================================
const userSchema = new mongoose.Schema({
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    balance:  { type: Number, default: 0 }, // الرصيد الحالي بالدولار
    createdAt:{ type: Date, default: Date.now }
});

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
    productName: {
        ar: { type: String, required: true, trim: true, maxlength: 100 },
        en: { type: String, required: true, trim: true, maxlength: 100 }
    },
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
    description: {
        ar: { type: String, default: 'لا يوجد وصف متاح حالياً لهذا المنتج.' },
        en: { type: String, default: 'No description is available for this product at the moment.' }
    },
    image:       { type: String, default: '' },
    codes:       { type: [codeSchema], default: [] },
    isExternal:  { type: Boolean, default: false }, // هل المنتج يسحب من API خارجي؟
    externalId:  { type: String, default: null },  // المعرف في موقع المزود
    profitMargin:{ type: Number, default: 1.10 }, // هامش الربح (1.10 تعني 10%)
    basePrice:   { type: Number, default: 0 },    // السعر الأصلي من المزود
    currentProvider: { type: String, default: 'Local' }, // اسم المزود الحالي للأفضل سعر
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
productSchema.statics.claimCodeAtomic = async function(productId, orderId, buyerEmail) {
    const updatedProduct = await this.findOneAndUpdate(
        { 
            _id: productId, 
            'codes.status': 'available' 
        },
        { 
            $set: { 
                'codes.$.status': 'sold',
                'codes.$.soldAt': new Date(),
                'codes.$.soldTo': buyerEmail,
                'codes.$.orderId': orderId,
                'updatedAt': new Date()
            }
        },
        { new: true, select: { codes: { $elemMatch: { orderId: orderId } } } }
    );

    if (!updatedProduct || !updatedProduct.codes || updatedProduct.codes.length === 0) {
        throw new Error('نفذت الكمية أو حدث خطأ أثناء الحجز');
    }

    return updatedProduct.codes[0].value;
};

// ======================================================
// Schema سجل الطلبات
// ======================================================
const orderSchema = new mongoose.Schema({
    orderId:     { type: String, required: true, unique: true },
    productName: { type: String, required: true }, // ملخص للمنتجات المطلوبة
    items:       { type: Array, default: [] },    // تفاصيل كل منتج (ID, الاسم, الكمية)
    price:       { type: Number, required: true },
    buyerEmail:  { type: String, required: true },
    code:        { type: String, default: null }, // الكود المسلّم
    costPrice:   { type: Number, default: 0 },    // سعر التكلفة لحظة الشراء
    status:      { 
        type: String, 
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentGateway: { type: String, default: 'manual' },
    paymentRef:     { type: String, default: null },
    stripePaymentIntentId: { type: String, default: null }, // لتتبع الدفع الآلي
    createdAt:      { type: Date, default: Date.now },
    completedAt:    { type: Date, default: null }
});

// ======================================================
// Schema سجل النشاطات (Logs)
// ======================================================
const logSchema = new mongoose.Schema({
    action:    { type: String, required: true }, // نوع الحركة (تسجيل دخول، تعديل، حذف)
    details:   { type: String },                 // تفاصيل الحركة
    targetId:  { type: String, default: null },  // معرف المنتج أو الطلب المرتبط
    targetName:{ type: String, default: null },  // اسم المنتج المرتبط (للعرض السريع)
    ip:        { type: String },                 // عنوان الجهاز
    createdAt: { type: Date, default: Date.now }
});

module.exports = {
    Product: mongoose.model('Product', productSchema),
    Category: mongoose.model('Category', categorySchema),
    Order:   mongoose.model('Order',   orderSchema),
        Log:     mongoose.model('Log',     logSchema),
        User:    mongoose.model('User',    userSchema)
};