const { Promotion } = require('../models');
const { clearStorefrontCache } = require('./storeController');

/**
 * التحقق من صحة مدخلات عرض جديد/معدّل.
 * @returns {string|null} رسالة خطأ أو null عند الصحة
 */
function validatePromotionInput(body) {
    if (!body || typeof body !== 'object') return 'البيانات غير صالحة';

    const titleAr = String(body.title?.ar || '').trim();
    if (!titleAr || titleAr.length > 100) {
        return 'العنوان بالعربية مطلوب (حتى 100 حرف)';
    }

    const discountPercent = Number.parseInt(body.discountPercent, 10);
    if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 99) {
        return 'نسبة الخصم يجب أن تكون بين 1 و 99';
    }

    const expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
        return 'تاريخ انتهاء العرض غير صالح';
    }

    const hasProductTarget = typeof body.productId === 'string' && body.productId.trim();
    const hasCategoryTarget = typeof body.category === 'string' && body.category.trim();
    if (!hasProductTarget && !hasCategoryTarget) {
        return 'يجب استهداف منتج محدد أو قسم كامل';
    }
    if (hasProductTarget && !/^[a-fA-F0-9]{24}$/.test(body.productId.trim())) {
        return 'معرف المنتج المستهدف غير صالح';
    }

    // كود الخصم اختياري — يُكتب بحروف كبيرة وبدون مسافات (حتى 20 حرفاً)
    if (typeof body.code === 'string' && body.code.trim()) {
        const code = body.code.trim().toUpperCase();
        if (!/^[A-Za-z0-9-]{3,20}$/.test(code)) {
            return 'كود الخصم يجب أن يكون 3-20 حرفاً (أحرف، أرقام، شرطات فقط)';
        }
    }

    return null;
}

function pickPromotionFields(body) {
    const fields = {
        'title.ar': String(body.title?.ar || '').trim()
    };
    if (typeof body.title?.en === 'string') fields['title.en'] = body.title.en.trim().slice(0, 100);
    fields.discountPercent = Number.parseInt(body.discountPercent, 10);
    fields.expiresAt = new Date(body.expiresAt);
    fields.productId = typeof body.productId === 'string' && body.productId.trim() ? body.productId.trim() : null;
    fields.category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null;
    if (typeof body.code === 'string' && body.code.trim()) {
        fields.code = body.code.trim().toUpperCase();
    }
    if (typeof body.description?.ar === 'string') fields['description.ar'] = body.description.ar.trim().slice(0, 300);
    if (typeof body.description?.en === 'string') fields['description.en'] = body.description.en.trim().slice(0, 300);
    if (typeof body.isActive === 'boolean') fields.isActive = body.isActive;
    return fields;
}

exports.getPromotions = async (_req, res) => {
    try {
        const promotions = await Promotion.find({}).sort({ createdAt: -1 });
        res.json({ success: true, promotions });
    } catch (_err) {
        res.status(500).json({ success: false, message: 'فشل جلب العروض' });
    }
};

exports.createPromotion = async (req, res) => {
    try {
        const validationError = validatePromotionInput(req.body);
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
        }

        const promo = new Promotion(pickPromotionFields(req.body));
        await promo.save();
        clearStorefrontCache();

        res.status(201).json({ success: true, promotion: promo });
    } catch (_err) {
        res.status(500).json({ success: false, message: 'فشل إنشاء العرض' });
    }
};

exports.updatePromotion = async (req, res) => {
    try {
        const validationError = validatePromotionInput(req.body);
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
        }

        const promo = await Promotion.findByIdAndUpdate(
            { _id: req.params.promotionId },
            { $set: pickPromotionFields(req.body) },
            { new: true, runValidators: true }
        );
        if (!promo) {
            return res.status(404).json({ success: false, message: 'العرض غير موجود' });
        }
        clearStorefrontCache();

        res.json({ success: true, promotion: promo });
    } catch (_err) {
        res.status(500).json({ success: false, message: 'فشل تعديل العرض' });
    }
};

exports.deletePromotion = async (req, res) => {
    try {
        const promo = await Promotion.findByIdAndDelete({ _id: req.params.promotionId });
        if (!promo) {
            return res.status(404).json({ success: false, message: 'العرض غير موجود' });
        }
        clearStorefrontCache();

        res.json({ success: true, message: 'تم حذف العرض' });
    } catch (_err) {
        res.status(500).json({ success: false, message: 'فشل حذف العرض' });
    }
};