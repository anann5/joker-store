const crypto = require('crypto');
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
    // source: 'manual' → أُنشئ يدوياً من لوحة التحكم (لا يتدخل السيرفر به)
    //         'auto'   → أُنشئ تلقائياً من كتالوج المزودين (يُدار آلياً)
    source: { type: String, enum: ['manual', 'auto'], default: 'manual' },
    image: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
});

// ======================================================
// Schema المستخدم
// ======================================================
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    balance: { type: Number, default: 0, min: 0 },
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    loyaltyHistory: {
        type: [{
            points: { type: Number, required: true },
            type: { type: String, enum: ['earned', 'redeemed'], required: true },
            orderId: { type: mongoose.Schema.Types.ObjectId, default: null },
            createdAt: { type: Date, default: Date.now }
        }],
        default: []
    },
    // سلة المستخدم السحابية — تُزامن بين الأجهزة بعد تسجيل الدخول
    cart: {
        type: [{
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            qty: { type: Number, min: 1, max: 99, default: 1 }
        }],
        default: []
    },
    createdAt: { type: Date, default: Date.now }
});

// ======================================================
// Schema الكود الفردي (مضمّن داخل المنتج)
// ======================================================
const codeSchema = new mongoose.Schema({
    value: { type: String, required: true, trim: true },
    status: { type: String, enum: ['available', 'sold', 'reserved'], default: 'available' },
    soldAt: { type: Date, default: null },
    soldTo: { type: String, default: null },
    orderId: { type: String, default: null },
    claimId: { type: String, default: null, select: false }
});

// ======================================================
// Schema المنتج الرئيسي
// ======================================================
const productSchema = new mongoose.Schema({
    productName: {
        ar: { type: String, required: true, trim: true, maxlength: 100 },
        en: { type: String, required: true, trim: true, maxlength: 100 }
    },
    category: {
        type: String,
        required: true
    },
    region: {
        type: String,
        required: true,
        default: 'global'
    },
    price: { type: Number, required: true, min: 0 },
    priceCurrency: { type: String, default: 'USD' },
    description: {
        ar: { type: String, default: 'لا يوجد وصف متاح حالياً لهذا المنتج.' },
        en: { type: String, default: 'No description is available for this product at the moment.' }
    },
    image: { type: String, default: '' },
    images: { type: [String], default: [] },
    codes: { type: [codeSchema], default: [] },
    isExternal: { type: Boolean, default: false },
    externalId: { type: String, default: null },
    profitMargin: { type: Number, default: 1.10 },
    profitMarginOverride: { type: Boolean, default: false },
    basePrice: { type: Number, default: 0 },
    lastProviderPrice: { type: Number, default: 0 },
    providerCurrency: { type: String, default: null },
    providerStock: { type: Number, default: null },
    lastPriceSyncAt: { type: Date, default: null },
    currentProvider: { type: String, default: 'Local' },
    groupKey: { type: String, default: null },
    providerOptions: {
        type: [{
            provider: { type: String, required: true },
            externalId: { type: String, required: true },
            basePrice: { type: Number, default: 0 }
        }],
        default: []
    },
    isSubscription: { type: Boolean, default: false },
    subscriptionType: { type: String, enum: ['fixed', 'recurring'], default: 'fixed' },
    subscriptionDuration: { type: Number, default: null },
    codeGenerationMethod: { type: String, enum: ['static', 'dynamic'], default: 'static' },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0, min: 0 },
    reviews: {
        type: [{
            rating: { type: Number, required: true, min: 1, max: 5 },
            comment: { type: String, trim: true, default: '', maxlength: 500 },
            images: { type: [String], default: [] },
            reviewerEmail: { type: String, trim: true, default: null },
            verified: { type: Boolean, default: false },
            createdAt: { type: Date, default: Date.now }
        }],
        default: []
    },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

productSchema.virtual('availableStock').get(function() {
    return this.codes.filter(code => code.status === 'available').length;
});

productSchema.index({ groupKey: 1, isExternal: 1 });

/**
 * Atomically claim a single local code for an order.
 * @returns {Promise<string>} the specific code claimed by this invocation
 */
productSchema.statics.claimCodeAtomic = async function(productId, orderId, buyerEmail, claimId = crypto.randomUUID()) {
    const updatedProduct = await this.findOneAndUpdate(
        { _id: productId, 'codes.status': 'available' },
        {
            $set: {
                'codes.$.status': 'sold',
                'codes.$.soldAt': new Date(),
                'codes.$.soldTo': buyerEmail,
                'codes.$.orderId': orderId,
                'codes.$.claimId': claimId,
                updatedAt: new Date()
            }
        },
        { new: true, select: { codes: { $elemMatch: { claimId } } } }
    );

    if (!updatedProduct?.codes?.length) {
        throw new Error('نفدت الكمية أو حدث خطأ أثناء الحجز');
    }

    return updatedProduct.codes[0].value;
};

// ======================================================
// Schema سجل الطلبات
// ======================================================
const orderItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: {
        ar: { type: String, required: true },
        en: { type: String, required: true }
    },
    qty: { type: Number, required: true, min: 1, max: 99 },
    unitPrice: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    fulfilmentType: { type: String, enum: ['local', 'external'], required: true },
    fulfilmentStatus: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    deliveredCodes: { type: [String], default: [] },
    costPrice: { type: Number, default: 0, min: 0 },
    fulfilledAt: { type: Date, default: null }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    productName: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    items: { type: [orderItemSchema], default: [], validate: value => value.length > 0 },
    price: { type: Number, required: true, min: 0 },
    buyerEmail: { type: String, required: true, lowercase: true, trim: true },
    code: { type: String, default: null },
    deliveredCodes: { type: [String], default: [] },
    costPrice: { type: Number, default: 0, min: 0 },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentGateway: { type: String, default: 'manual' },
    paymentRef: { type: String, default: null },
    paymentProofUrl: { type: String, default: null },
    stripePaymentIntentId: { type: String, default: null },
    // خصم رموز العروض (اختياري) — يُسجّل على مستوى الطلب فقط
    discount: { type: Number, default: 0, min: 0 },
    discountCode: { type: String, default: null },
    discountPercent: { type: Number, default: 0 },
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    loyaltyDiscount: { type: Number, default: 0, min: 0 },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null }
});

// ======================================================
// Schema سجل النشاطات (Logs)
// ======================================================
const logSchema = new mongoose.Schema({
    action: { type: String, required: true },
    details: { type: String },
    targetId: { type: String, default: null },
    targetName: { type: String, default: null },
    ip: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// ======================================================
// Schema العروض/الخصومات (Promotions)
// ------------------------------------------------------
// عرض قابل للضبط من لوحة التحكم مع مدة انتهاء (countdown):
// - discountPercent: خصم نسبة مئوية (1-99)
// - productId أو category: يستهدف منتجاً محدداً أو قسماً كاملاً
// - isActive + expiresAt: يظهر فقط للعروض الفعالة غير المنتهية
// ======================================================
const promotionSchema = new mongoose.Schema({
    title: {
        ar: { type: String, required: true, trim: true, maxlength: 100 },
        en: { type: String, trim: true, default: '' }
    },
    description: {
        ar: { type: String, trim: true, default: '', maxlength: 300 },
        en: { type: String, trim: true, default: '' }
    },
    discountPercent: { type: Number, required: true, min: 1, max: 99 },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    category: { type: String, default: null },
    // كود الخصم الاختياري (مثل SAVE10) — يُبحث به في الدفع عند عدم استخدام مؤشر إلى منتج أو قسم
    code: { type: String, trim: true, default: null, sparse: true, index: true },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});

promotionSchema.index({ isActive: 1, expiresAt: 1 });

// ======================================================
// Schema حالة مزامنة المزودين (Provider Sync State)
// ======================================================
const providerSyncStateSchema = new mongoose.Schema({
    provider: { type: String, required: true, unique: true },
    lastSyncAt: { type: Date, default: null },
    status: { type: String, default: 'never' },
    fetched: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    ratesSource: { type: String, default: null },
    storeCurrency: { type: String, default: 'USD' }
});

// ======================================================
// Schema جلسات الأدمن (مخزنة في MongoDB بدل الذاكرة
// حتى تبقى صالحة بعد إعادة تشغيل السيرفر، مع إمكانية
// إبطالها فوراً عبر logout).
// ======================================================
const adminSessionSchema = new mongoose.Schema({
    jti: { type: String, required: true, unique: true },
    fingerprint: { type: String, required: true },
    ip: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 3 * 60 * 60 * 1000)
    }
});

adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ======================================================
// فهارس قاعدة البيانات (أداء الاستعلامات الشائعة)
// ======================================================
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ currentProvider: 1, externalId: 1, isExternal: 1 });
productSchema.index({ groupKey: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });
// فهارس البحث بالاسم (تُستخدم مع regex مسبوق بالبادئة في /api/search)
productSchema.index({ isActive: 1, 'productName.ar': 1 });
productSchema.index({ isActive: 1, 'productName.en': 1 });
orderSchema.index({ status: 1, completedAt: -1 });
orderSchema.index({ buyerEmail: 1, createdAt: -1 });
categorySchema.index({ isActive: 1, order: 1 });
// سجل النشاطات: يُفرز بـ createdAt في لوحة التحكم ويُحذف الأقدم عبر deleteMany
logSchema.index({ createdAt: -1 });

const cartSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    email: { type: String, default: null },
    items: {
        type: [{
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            productName: { type: String, default: '' },
            qty: { type: Number, default: 1 },
            price: { type: Number, default: 0 }
        }],
        default: []
    },
    total: { type: Number, default: 0 },
    notified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
cartSessionSchema.index({ notified: 1, createdAt: -1 });

module.exports = {
    Product: mongoose.model('Product', productSchema),
    Category: mongoose.model('Category', categorySchema),
    Order: mongoose.model('Order', orderSchema),
    Log: mongoose.model('Log', logSchema),
    User: mongoose.model('User', userSchema),
    ProviderSyncState: mongoose.model('ProviderSyncState', providerSyncStateSchema),
    AdminSession: mongoose.model('AdminSession', adminSessionSchema),
    Promotion: mongoose.model('Promotion', promotionSchema),
    CartSession: mongoose.model('CartSession', cartSessionSchema)
};
