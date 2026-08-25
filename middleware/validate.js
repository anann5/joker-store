const Joi = require('joi');

/**
 * Middleware لتوليد دالة تحقق من صحة البيانات باستخدام Joi.
 * @param {Object} schema - مخطط Joi للتحقق منه
 */
exports.validate = (schema) => {
    return (req, res, next) => {
        const options = {
            abortEarly: false, // إرجاع جميع الأخطاء، وليس الأولى فقط
            allowUnknown: false,
            stripUnknown: false
        };

        const { error, value } = schema.validate(req.body, options);
        
        if (error) {
            const message = error.details.map(el => el.message).join(', ');
            return res.status(400).json({
                success: false,
                message: `بيانات غير صالحة: ${  message}`
            });
        }
        
        req.body = value;
        next();
    };
};

/**
 * مخطط التحقق من صحة بيانات تسجيل الدخول
 */
exports.loginSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.empty': 'البريد الإلكتروني مطلوب',
            'string.email': 'البريد الإلكتروني غير صالح',
            'any.required': 'البريد الإلكتروني مطلوب'
        }),
    password: Joi.string()
        .min(6)
        .max(128)
        .required()
        .messages({
            'string.empty': 'كلمة المرور مطلوبة',
            'string.min': 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
            'any.required': 'كلمة المرور مطلوبة'
        })
});

/**
 * مخطط التحقق من صحة بيانات التسجيل
 */
exports.registerSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.empty': 'البريد الإلكتروني مطلوب',
            'string.email': 'البريد الإلكتروني غير صالح',
            'any.required': 'البريد الإلكتروني مطلوب'
        }),
    password: Joi.string()
        .min(8)
        .max(128)
        .pattern(/(?=.*[a-z])/)
        .pattern(/(?=.*[A-Z])/)
        .pattern(/(?=.*[0-9])/)
        .required()
        .messages({
            'string.empty': 'كلمة المرور مطلوبة',
            'string.min': 'كلمة المرور يجب أن تكون 8 أحرف على الأقل',
            'string.pattern.match': 'كلمة المرور يجب أن تحتوي على أحرف كبيرة وصغيرة وأرقام',
            'any.required': 'كلمة المرور مطلوبة'
        })
});

/**
 * مخطح التحقق من صحة بيانات إكمال الشراء
 */
exports.checkoutSchema = Joi.object({
    cartItems: Joi.array()
        .items(Joi.object({
            id: Joi.string().pattern(/^[a-fA-F0-9]{24}$/).required(),
            qty: Joi.number().integer().min(1).max(99).required()
        }))
        .unique('id')
        .min(1)
        .required()
        .messages({
            'array.min': 'السلة لا يمكن أن تكون فارغة',
            'any.required': 'عناصر السلة مطلوبة'
        }),
    customerEmail: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'البريد الإلكتروني غير صالح',
            'any.required': 'البريد الإلكتروني مطلوب'
        }),
    promoCode: Joi.string()
        .trim()
        .pattern(/^[A-Za-z0-9-]{3,20}$/)
        .allow('')
        .optional()
        .messages({
            'string.pattern.base': 'كود الخصم غير صالح'
        }),
    paymentGateway: Joi.string()
        .valid('jawwal_pay', 'palpay', 'stripe')
        .required()
        .messages({
            'any.only': 'بوابة الدفع غير صالحة',
            'any.required': 'بوابة الدفع مطلوبة'
        }),
    paymentRef: Joi.when('paymentGateway', {
        is: 'stripe',
        then: Joi.string().allow('').optional(),
        otherwise: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .required()
            .messages({
                'string.empty': 'رقم العملية/الاسم مطلوب',
                'string.min': 'رقم العملية/الاسم قصير جداً',
                'any.required': 'رقم العملية/الاسم مطلوب'
            })
    })
});

exports.contactSchema = Joi.object({
    name: Joi.string().trim().min(2).max(80).required().messages({
        'string.empty': 'الاسم مطلوب',
        'string.min': 'الاسم يجب أن يكون حرفين على الأقل',
        'any.required': 'الاسم مطلوب'
    }),
    email: Joi.string().trim().email().required().messages({
        'string.empty': 'البريد الإلكتروني مطلوب',
        'string.email': 'البريد الإلكتروني غير صالح',
        'any.required': 'البريد الإلكتروني مطلوب'
    }),
    message: Joi.string().trim().min(10).max(1000).required().messages({
        'string.empty': 'الرسالة مطلوبة',
        'string.min': 'الرسالة يجب أن تكون 10 أحرف على الأقل',
        'any.required': 'الرسالة مطلوبة'
    })
});

/**
 * Middleware للتحقق المتسامح: يقبل الحقول الإضافية التي قد يرسلها
 * الواجهات الأمامية (مثل manualCodes) ولا يكسر الطلب.
 * @param {Object} schema - مخطط Joi للتحقق منه
 */
exports.validateLenient = (schema) => {
    return (req, res, next) => {
        const options = {
            abortEarly: false,
            allowUnknown: true,
            stripUnknown: false
        };

        const { error, value } = schema.validate(req.body, options);

        if (error) {
            const message = error.details.map(el => el.message).join(', ');
            return res.status(400).json({
                success: false,
                message: `بيانات غير صالحة: ${message}`
            });
        }

        req.body = value;
        next();
    };
};

// حقول المنتج ثنائي اللغة (عربية + إنجليزية)
const localNameField = Joi.object({
    ar: Joi.string().trim().min(1).max(100).required().messages({
        'string.empty': 'اسم المنتج بالعربية مطلوب',
        'any.required': 'اسم المنتج بالعربية مطلوب'
    }),
    en: Joi.string().trim().min(1).max(100).required().messages({
        'string.empty': 'اسم المنتج بالإنجليزية مطلوب',
        'any.required': 'اسم المنتج بالإنجليزية مطلوب'
    })
});

const priceField = Joi.alternatives().try(
    Joi.number().min(0).messages({ 'number.min': 'السعر لا يمكن أن يكون سالباً' }),
    Joi.string().trim().pattern(/^\d+(\.\d+)?$/).messages({
        'string.pattern.base': 'السعر يجب أن يكون رقماً صحيحاً'
    })
).optional();

const marginField = Joi.alternatives().try(
    Joi.number().min(1).messages({ 'number.min': 'هامش الربح يجب أن يكون 1.0 أو أكثر' }),
    Joi.string().trim().pattern(/^\d+(\.\d+)?%?$/).messages({
        'string.pattern.base': 'هامش الربح يجب أن يكون رقماً (أو نسبة مئوية)'
    })
).optional();

const codeListItem = Joi.alternatives().try(
    Joi.string().trim().min(1).max(500),
    Joi.object({
        value: Joi.string().trim().min(1).max(500).required(),
        status: Joi.string().valid('available', 'sold', 'reserved').optional()
    })
).optional();

/**
 * مخطط إضافة منتج يدوياً (POST /inventory/add)
 * يتحقق من الأنواع على الحقول التي كان يمكن تمرير أي قيم لها بدون تحقق.
 */
exports.manualAddProductSchema = Joi.object({
    productName: localNameField.required(),
    category: Joi.string().trim().max(50).required().messages({
        'any.required': 'التصنيف مطلوب'
    }),
    region: Joi.string().trim().max(20).optional(),
    price: priceField,
    priceCurrency: Joi.string().trim().max(10).optional(),
    description: Joi.object({
        ar: Joi.string().allow('').optional(),
        en: Joi.string().allow('').optional()
    }).optional(),
    image: Joi.string().trim().max(500).allow('').optional(),
    images: Joi.array().max(10).items(Joi.string().trim().max(500)).optional(),
    codes: Joi.array().max(500).items(codeListItem).optional(),
    isExternal: Joi.boolean().optional(),
    externalId: Joi.string().allow('', null).trim().max(100).optional(),
    profitMargin: marginField,
    profitMarginOverride: Joi.boolean().optional(),
    basePrice: priceField,
    lastProviderPrice: Joi.number().min(0).optional(),
    providerCurrency: Joi.string().allow('', null).trim().max(10).optional(),
    currentProvider: Joi.string().trim().max(60).optional(),
    isSubscription: Joi.boolean().optional(),
    subscriptionType: Joi.string().valid('fixed', 'recurring').optional(),
    subscriptionDuration: Joi.number().integer().min(1).allow(null).optional(),
    codeGenerationMethod: Joi.string().valid('static', 'dynamic').optional(),
    isActive: Joi.boolean().optional()
});

/**
 * مخطط إنشاء/إضافة منتج (inventory/create + inventory/add-manual)
 */
exports.createProductSchema = Joi.object({
    productName: localNameField.required(),
    category: Joi.string().trim().max(50).required().messages({
        'any.required': 'التصنيف مطلوب'
    }),
    region: Joi.string().trim().max(20).optional(),
    price: priceField,
    priceCurrency: Joi.string().trim().max(10).optional(),
    description: Joi.object({
        ar: Joi.string().allow('').optional(),
        en: Joi.string().allow('').optional()
    }).optional(),
    image: Joi.string().allow('', null).trim().max(500).optional(),
    images: Joi.array().max(10).items(Joi.string().trim().max(500)).optional(),
    manualCodes: Joi.array().max(500).items(codeListItem).optional(),
    codes: Joi.array().max(500).items(codeListItem).optional(),
    isExternal: Joi.boolean().optional(),
    externalId: Joi.string().allow('', null).trim().max(100).optional(),
    profitMargin: marginField,
    basePrice: priceField,
    providerCurrency: Joi.string().allow('', null).trim().max(10).optional(),
    currentProvider: Joi.string().trim().max(60).optional(),
    isSubscription: Joi.boolean().optional(),
    subscriptionType: Joi.string().valid('fixed', 'recurring').optional(),
    subscriptionDuration: Joi.number().integer().min(1).allow(null).optional(),
    isActive: Joi.boolean().optional()
});

/**
 * مخطط تعديل منتج (PATCH inventory/:productId + margin)
 */
exports.updateProductSchema = Joi.object({
    productName: Joi.object({
        ar: Joi.string().trim().min(1).max(100).optional(),
        en: Joi.string().trim().min(1).max(100).optional()
    }).optional(),
    category: Joi.string().trim().max(50).optional(),
    region: Joi.string().trim().max(20).optional(),
    price: priceField,
    priceCurrency: Joi.string().trim().max(10).optional(),
    description: Joi.object({
        ar: Joi.string().allow('').optional(),
        en: Joi.string().allow('').optional()
    }).optional(),
    image: Joi.string().allow('', null).trim().max(500).optional(),
    images: Joi.array().max(10).items(Joi.string().trim().max(500)).optional(),
    isExternal: Joi.boolean().optional(),
    externalId: Joi.string().allow('', null).trim().max(100).optional(),
    profitMargin: marginField,
    basePrice: priceField,
    currentProvider: Joi.string().trim().max(60).optional(),
    isActive: Joi.boolean().optional(),
    isSubscription: Joi.boolean().optional(),
    subscriptionType: Joi.string().valid('fixed', 'recurring').optional(),
    subscriptionDuration: Joi.number().integer().min(1).allow(null).optional(),
    rating: Joi.number().min(0).max(5).messages({
        'number.min': 'التقييم لا يمكن أن يكون أقل من 0',
        'number.max': 'التقييم لا يمكن أن يتجاوز 5'
    }).optional(),
    reviewsCount: Joi.number().integer().min(0).messages({
        'number.integer': 'عدد التقييمات يجب أن يكون رقماً صحيحاً',
        'number.min': 'عدد التقييمات لا يمكن أن يكون سالباً'
    }).optional()
});

/**
 * مخطط إنشاء تصنيف (POST /categories)
 */
exports.createCategorySchema = Joi.object({
    key: Joi.string().trim().min(1).max(50).pattern(/^[a-zA-Z0-9_-]+$/).required().messages({
        'any.required': 'المفتاح مطلوب',
        'string.pattern.base': 'المفتاح يجب أن يحتوي على أحرف لاتينية وأرقام فقط'
    }),
    titleAr: Joi.string().trim().min(1).max(100).required().messages({
        'any.required': 'العنوان بالعربية مطلوب'
    }),
    titleEn: Joi.string().trim().min(1).max(100).required().messages({
        'any.required': 'العنوان بالإنجليزية مطلوب'
    }),
    descriptionAr: Joi.string().allow('').trim().max(300).optional(),
    descriptionEn: Joi.string().allow('').trim().max(300).optional(),
    image: Joi.string().allow('', null).trim().max(500).optional(),
    order: Joi.number().integer().min(0).max(100000).messages({
        'number.integer': 'الترتيب يجب أن يكون رقماً صحيحاً',
        'number.min': 'الترتيب لا يمكن أن يكون سالباً'
    }).optional(),
    isActive: Joi.boolean().optional()
});

/**
 * مخطط تعديل تصنيف (PATCH /categories/:categoryId)
 */
exports.updateCategorySchema = Joi.object({
    key: Joi.string().trim().min(1).max(50).pattern(/^[a-zA-Z0-9_-]+$/).messages({
        'string.pattern.base': 'المفتاح يجب أن يحتوي على أحرف لاتينية وأرقام فقط'
    }).optional(),
    titleAr: Joi.string().trim().min(1).max(100).optional(),
    titleEn: Joi.string().trim().min(1).max(100).optional(),
    descriptionAr: Joi.string().allow('').trim().max(300).optional(),
    descriptionEn: Joi.string().allow('').trim().max(300).optional(),
    image: Joi.string().allow('', null).trim().max(500).optional(),
    order: Joi.number().integer().min(0).max(100000).messages({
        'number.integer': 'الترتيب يجب أن يكون رقماً صحيحاً',
        'number.min': 'الترتيب لا يمكن أن يكون سالباً'
    }).optional(),
    isActive: Joi.boolean().optional()
});

/**
 * مخطط حذف منتج (DELETE /inventory/:productId)
 * يضمن أن permanentDelete إما true أو false — لا يقبل قيماً خادعة أخرى.
 */
exports.deleteProductSchema = Joi.object({
    permanentDelete: Joi.boolean().default(false)
});

/**
 * Middleware للتحقق من صحة معلمات المسار (req.params)
 */
exports.validateParams = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.params, { abortEarly: false, allowUnknown: false });
        if (error) {
            const message = error.details.map(el => el.message).join(', ');
            return res.status(400).json({ success: false, message: `معرف غير صالح: ${message}` });
        }
        next();
    };
};

/**
 * مخططات التحقق من معلمات المسار (MongoDB ObjectId)
 */
const mongoIdPattern = /^[a-fA-F0-9]{24}$/;

exports.orderIdParamSchema = Joi.object({
    orderId: Joi.string().pattern(mongoIdPattern).required().messages({
        'string.pattern.base': 'رقم الطلب غير صالح',
        'any.required': 'رقم الطلب مطلوب'
    })
});

exports.categoryIdParamSchema = Joi.object({
    categoryId: Joi.string().pattern(mongoIdPattern).required().messages({
        'string.pattern.base': 'معرف الفئة غير صالح',
        'any.required': 'معرف الفئة مطلوب'
    })
});

exports.productIdParamSchema = Joi.object({
    productId: Joi.string().pattern(mongoIdPattern).required().messages({
        'string.pattern.base': 'معرف المنتج غير صالح',
        'any.required': 'معرف المنتج مطلوب'
    })
});

exports.promotionIdParamSchema = Joi.object({
    promotionId: Joi.string().pattern(mongoIdPattern).required().messages({
        'string.pattern.base': 'معرف العرض غير صالح',
        'any.required': 'معرف العرض مطلوب'
    })
});
