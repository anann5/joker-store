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
    image: { type: String, required: true },
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
        required: true,
        enum: ['gaming_general', 'pubg', 'fortnite', 'playstation', 'xbox',
            'microsoft_windows', 'adobe', 'antivirus', 'vpn', 'google',
            'itunes', 'razer_gold', 'amazon', 'steam']
    },
    region: {
        type: String,
        required: true,
        enum: ['global', 'us', 'tr', 'eu', 'sa'],
        default: 'global'
    },
    price: { type: Number, required: true, min: 0 },
    priceCurrency: { type: String, default: 'USD' },
    description: {
        ar: { type: String, default: 'لا يوجد وصف متاح حالياً لهذا المنتج.' },
        en: { type: String, default: 'No description is available for this product at the moment.' }
    },
    image: { type: String, default: '' },
    codes: { type: [codeSchema], default: [] },
    isExternal: { type: Boolean, default: false },
    externalId: { type: String, default: null },
    profitMargin: { type: Number, default: 1.10 },
    profitMarginOverride: { type: Boolean, default: false },
    basePrice: { type: Number, default: 0 },
    lastProviderPrice: { type: Number, default: 0 },
    providerCurrency: { type: String, default: null },
    lastPriceSyncAt: { type: Date, default: null },
    currentProvider: { type: String, default: 'Local' },
    isSubscription: { type: Boolean, default: false },
    subscriptionType: { type: String, enum: ['fixed', 'recurring'], default: 'fixed' },
    subscriptionDuration: { type: Number, default: null },
    codeGenerationMethod: { type: String, enum: ['static', 'dynamic'], default: 'static' },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

productSchema.virtual('availableStock').get(function() {
    return this.codes.filter(code => code.status === 'available').length;
});

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
    stripePaymentIntentId: { type: String, default: null },
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

module.exports = {
    Product: mongoose.model('Product', productSchema),
    Category: mongoose.model('Category', categorySchema),
    Order: mongoose.model('Order', orderSchema),
    Log: mongoose.model('Log', logSchema),
    User: mongoose.model('User', userSchema),
    ProviderSyncState: mongoose.model('ProviderSyncState', providerSyncStateSchema),
    AdminSession: mongoose.model('AdminSession', adminSessionSchema)
};
