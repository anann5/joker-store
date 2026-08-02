const Joi = require('joi');

/**
 * Middleware لتوليد دالة تحقق من صحة البيانات باستخدام Joi.
 * @param {Object} schema - مخطط Joi للتحقق منه
 */
exports.validate = (schema) => {
    return (req, res, next) => {
        const options = {
            abortEarly: false, // إرجاع جميع الأخطاء، وليس الأولى فقط
            allowUnknown: true, // تجاهل الحقول غير المتوقعة
            stripUnknown: true, // إزالة الحقول غير المتوقعة
        };

        const { error, value } = schema.validate(req.body, options);
        
        if (error) {
            const message = error.details.map(el => el.message).join(', ');
            return res.status(400).json({
                success: false,
                message: 'بيانات غير صالحة: ' + message
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
            id: Joi.string().required(),
            qty: Joi.number().integer().min(1).required()
        }))
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
    paymentGateway: Joi.string()
        .valid('jawwal_pay', 'palpay')
        .required()
        .messages({
            'any.only': 'بوابة الدفع غير صالحة',
            'any.required': 'بوابة الدفع مطلوبة'
        }),
    paymentRef: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required()
        .messages({
            'string.empty': 'رقم العملية/الاسم مطلوب',
            'string.min': 'رقم العملية/الاسم قصير جداً',
            'any.required': 'رقم العملية/الاسم مطلوب'
        })
});

/**
 * مخطط التحقق من رفع صورة المنتج (للأدمن)
 */
exports.productImageSchema = Joi.object({
    productId: Joi.string().required(),
    image: Joi.string().required()
});
