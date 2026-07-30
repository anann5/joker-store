const { Product, Order, Log, User } = require('../models');
const { fetchProviderBalances, sendTelegramAlert } = require('./helpers');
const axios = require('axios');
const bcrypt = require('bcrypt'); // يتطلب تثبيت: npm install bcrypt
const jwt = require('jsonwebtoken'); // يتطلب تثبيت: npm install jsonwebtoken

const externalProviders = [
    { 
        name: 'SMM_Global', 
        apiUrl: 'https://api.provider-a.com/v2/items', 
        apiKey: process.env.PROVIDER_A_KEY, 
        balanceApiUrl: 'https://api.provider-a.com/v2/balance',
        purchaseUrl: 'https://api.provider-a.com/v2/buy' 
    },
    { 
        name: 'GameKeys_Pro', 
        apiUrl: 'https://api.provider-b.com/v1/products', 
        apiKey: process.env.PROVIDER_B_KEY, 
        balanceApiUrl: 'https://api.provider-b.com/v1/user/balance',
        purchaseUrl: 'https://api.provider-b.com/v1/order'
    }
];

// دالة مساعدة لتسجيل النشاطات
const createLog = async (action, details, req, targetId = null, targetName = null) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const newLog = new Log({ action, details, ip, targetId, targetName });
        await newLog.save();
    } catch (err) {
        console.error('⚠️ فشل تسجيل النشاط:', err.message);
    }
};

// Middleware للتحقق من التوكن قبل السماح بالدخول للمسارات المحمية
exports.verifyAdminToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // استخراج التوكن من "Bearer TOKEN"

    if (!token) return res.status(403).json({ success: false, message: "يجب تسجيل الدخول أولاً" });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ success: false, message: "جلسة منتهية، يرجى إعادة تسجيل الدخول" });
        req.admin = decoded;
        next();
    });
};

// دالة تسجيل دخول الأدمن
exports.login = async (req, res) => {
    try {
        const { password } = req.body;
        const adminHash = process.env.ADMIN_PASSWORD_HASH;
        const jwtSecret = process.env.JWT_SECRET;

        if (!adminHash || !jwtSecret) return res.status(500).json({ success: false, message: "إعدادات الأمان ناقصة" });

        const isMatch = await bcrypt.compare(password, adminHash);
        if (isMatch) {
            // إنشاء توكن صالح لمدة 12 ساعة
            const token = jwt.sign({ role: 'admin' }, jwtSecret, { expiresIn: '12h' });
            await createLog('تسجيل دخول', 'قام المسؤول بتسجيل الدخول بنجاح', req);
            
            // إرسال إشعار تلجرام فوراً
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const loginMsg = `🔐 *تنبيه أمني: دخول المسؤول*\n` + `━━━━━━━━━━━━━━\n` + `👤 *النشاط:* تسجيل دخول جديد\n` + `🌐 *IP:* \`${ip}\` \n` + `🕒 *الوقت:* \`${new Date().toLocaleString('ar-EG')}\` \n` + `━━━━━━━━━━━━━━`;
            await sendTelegramAlert(loginMsg);

            res.json({ success: true, token, message: "تم تسجيل الدخول بنجاح" });
        } else {
            res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة" });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getInventory = async (req, res) => {
    try {
        const products = await Product.find({ isActive: true }).select('productName category region price codes updatedAt isExternal externalId profitMargin basePrice currentProvider');
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: 'فشل جلب المخزون' });
    }
};

exports.addProductManual = async (req, res) => {
    try {
        const newProduct = new Product(req.body);
        await newProduct.save();
        await createLog('إضافة منتج', `تم إضافة منتج يدوي: ${newProduct.productName}`, req, newProduct._id, newProduct.productName);
        res.json({ success: true, message: 'تم إضافة المنتج يدوياً' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// دالة داخلية للقيام بالمزامنة يمكن استدعاؤها برمجياً أو عبر API
const syncInventoryInternal = async () => {
    try {
        let updatedCount = 0;

        if (!externalProviders || externalProviders.length === 0) {
            return { success: false, message: "لا يوجد مزودون خارجيون معرفون" };
        }

        for (const provider of externalProviders) {
            if (!provider.apiUrl || !provider.apiKey) continue;

            // جلب المنتجات من المزود
            const response = await axios.get(provider.apiUrl, {
                headers: { 'Authorization': `Bearer ${provider.apiKey}` }
            });

            const externalItems = response.data.items || []; // افترضنا أن البيانات تعود في حقل items

            for (const item of externalItems) {
                // البحث عن المنتج في قاعدة بياناتنا بناءً على معرفه الخارجي
                const localProduct = await Product.findOne({ externalId: item.id, isExternal: true });

                if (localProduct) {
                    const oldBasePrice = localProduct.basePrice;
                    // تحديث السعر بناءً على السعر الأصلي + هامش الربح
                    const newBasePrice = parseFloat(item.price);
                    localProduct.basePrice = newBasePrice;
                    localProduct.price = parseFloat((newBasePrice * localProduct.profitMargin).toFixed(2));
                    localProduct.updatedAt = new Date();
                    localProduct.currentProvider = provider.name;
                    
                    await localProduct.save();
                    updatedCount++;

                    // 🔔 تنبيه تلجرام في حال وجود قفزة سعرية كبيرة (أكثر من 20%) عند المزود
                    if (oldBasePrice > 0 && (newBasePrice > oldBasePrice * 1.2)) {
                        const priceAlert = `🚨 *تنبيه: ارتفاع سعر عند المزود!*\n` +
                                           `━━━━━━━━━━━━━━\n` +
                                           `📦 *المنتج:* ${localProduct.productName}\n` +
                                           `🏢 *المزود:* ${provider.name}\n` +
                                           `📉 *السعر القديم:* \`${oldBasePrice}$\` \n` +
                                           `📈 *السعر الجديد:* \`${newBasePrice}$\` \n` +
                                           `💰 *سعرك الجديد بالمتجر:* \`${localProduct.price}$\` \n` +
                                           `━━━━━━━━━━━━━━\n` +
                                           `⚠️ تم تحديث سعرك تلقائياً للحفاظ على هامش الربح، يرجى المراجعة.`;
                        await sendTelegramAlert(priceAlert);
                    }
                }
            }
        }

        // 💸 فحص أرصدة المزودين وإرسال تنبيه إذا انخفض الرصيد عن 10$
        const balances = await fetchProviderBalances(externalProviders);
        for (const p of balances) {
            if (p.status === 'متصل' && p.balance < 10) {
                const balanceAlert = `💸 *تنبيه: رصيد منخفض لدى المزود!*\n` +
                                     `━━━━━━━━━━━━━━\n` +
                                     `🏢 *المزود:* ${p.name}\n` +
                                     `💰 *الرصيد الحالي:* \`${p.balance} ${p.currency}\` \n` +
                                     `⚠️ *الحالة:* الرصيد أقل من الحد المسموح (10$)\n` +
                                     `━━━━━━━━━━━━━━\n` +
                                     `🚀 *يرجى شحن حسابك لضمان استمرارية تنفيذ الطلبات آلياً.*`;
                await sendTelegramAlert(balanceAlert);
            }
        }

        return { success: true, count: updatedCount };

    } catch (err) {
        console.error('Sync Error:', err.message);
        return { success: false, error: err.message };
    }
};

// دالة داخلية لتنظيف السجلات القديمة (أكثر من شهر)
const cleanupOldLogsInternal = async () => {
    try {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const result = await Log.deleteMany({ createdAt: { $lt: oneMonthAgo } });
        return { success: true, count: result.deletedCount };
    } catch (err) {
        console.error('Cleanup Logs Error:', err.message);
        return { success: false, error: err.message };
    }
};

// تصدير الدالة للاستخدام في السيرفر (المهمة المجدولة)
exports.syncInventoryInternal = syncInventoryInternal;
exports.cleanupOldLogsInternal = cleanupOldLogsInternal;

// المسار الذي يتم استدعاؤه من لوحة التحكم
exports.syncExternalProducts = async (req, res) => {
    const result = await syncInventoryInternal();
    if (result.success) {
        // تمرير req للدالة الداخلية يتطلب تعديلها، لكن سنقوم بالتسجيل هنا
        await createLog('مزامنة يدوية', `تم تحديث ${result.count} منتج عبر المزامنة`, req);
        res.json({ 
            success: true, 
            message: `✅ تمت المزامنة بنجاح. تم تحديث ${result.count} منتجاً.` 
        });
    } else {
        res.status(500).json({ success: false, error: 'فشل مزامنة المنتجات الخارجية' });
    }
};

exports.approveOrder = async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
        if (order.status !== 'pending') return res.status(400).json({ success: false, message: 'الطلب معالج مسبقاً' });

        // جلب تفاصيل المنتج (نفترض طلب منتج واحد حالياً)
        const itemData = order.items[0];
        const product = await Product.findById(itemData.id);

        let deliveredCode = '';

        if (product.isExternal) {
            const provider = externalProviders.find(p => p.name === product.currentProvider);
            let attempts = 0;
            const maxAttempts = 3; 
            let lastError = null;

            while (attempts < maxAttempts) {
                attempts++;
                try {
                    const response = await axios.post(provider.purchaseUrl, {
                        api_key: provider.apiKey,
                        product_id: product.externalId,
                        amount: 1
                    }, { timeout: 15000 }); // مهلة 15 ثانية للطلب

                    // التحقق من وجود كود فعلي في رد المزود
                    deliveredCode = response.data.code || response.data.pin;
                    
                    if (deliveredCode) {
                        break; // نجاح العملية، اخرج من الحلقة
                    } else {
                        throw new Error("نجح الاتصال ولكن المزود لم يرسل كوداً في الرد");
                    }
                } catch (err) {
                    lastError = err;
                    
                    // إذا كان الخطأ متعلقاً بالصلاحيات أو الرصيد (فئة 4xx)، توقف فوراً
                    if (err.response && err.response.status >= 400 && err.response.status < 500) {
                        break; 
                    }
                    
                    console.warn(`⚠️ محاولة فاشلة #${attempts} للطلب ${order.orderId}: ${err.message}`);
                    if (attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 3000)); // انتظر 3 ثوانٍ قبل المحاولة التالية
                    }
                }
            }

            if (!deliveredCode) {
                let errorType = 'فشل الاتصال بالمزود';
                let details = lastError?.message || 'رد غير معروف من API';

                if (lastError?.response) {
                    const status = lastError.response.status;
                    const data = lastError.response.data;
                    
                    if (status === 402 || (data && (data.low_balance || data.error === 'insufficient_balance'))) {
                        errorType = '❌ رصيد غير كافٍ فعلياً';
                        details = 'رصيدك لدى المزود لا يغطي تكلفة هذا المنتج حالياً.';
                    } else if (status === 401) {
                        errorType = '🔑 خطأ في مفتاح API';
                        details = 'مفتاح الوصول للمزود غير صالح أو انتهت صلاحيته.';
                    } else if (status === 404) {
                        errorType = '📦 المنتج غير متوفر';
                        details = 'معرف المنتج الخارجي غير موجود في قائمة المزود.';
                    }
                }

                const failureAlert = `🚨 *فشل شراء كود آلياً!*\n` +
                                     `━━━━━━━━━━━━━━\n` +
                                     `🆔 *الطلب:* \`#${order.orderId}\` \n` +
                                     `📦 *المنتج:* ${product.productName}\n` +
                                     `🏢 *المزود:* ${provider.name}\n` +
                                     `⚠️ *نوع الخطأ:* ${errorType}\n` +
                                     `📝 *التفاصيل:* ${details}\n` +
                                     `━━━━━━━━━━━━━━\n` +
                                     `🛠 *الإجراء:* يرجى التدخل اليدوي لمعالجة الطلب.`;
                
                // 💰 نظام الإرجاع التلقائي للمحفظة
                order.status = 'failed';
                await order.save();

                // البحث عن المستخدم أو إنشاؤه لإيداع الرصيد
                let user = await User.findOne({ email: order.buyerEmail.toLowerCase() });
                if (!user) {
                    user = new User({ email: order.buyerEmail.toLowerCase(), balance: 0 });
                }
                
                user.balance += order.price;
                await user.save();

                await createLog('إرجاع رصيد آلي', `فشل طلب #${order.orderId} وتم إرجاع مبلغ ${order.price}$ لحساب ${order.buyerEmail}`, req);
                
                const extendedAlert = failureAlert + `\n💰 *الإجراء الآلي:* تم تحويل \`${order.price}$\` إلى محفظة الزبون.`;
                await sendTelegramAlert(extendedAlert);

                return res.status(502).json({ 
                    success: false, 
                    message: `فشل الشراء من المزود. تم تغيير حالة الطلب للفشل وإرجاع المبلغ (${order.price}$) لرصيد الزبون في الموقع.` 
                });
            }
        } else {
            // 📦 للمنتجات المحلية: سحب كود من المخزن المتوفر في قاعدة البيانات
            // نستخدم claimCodeAtomic لضمان عدم سحب نفس الكود لزبونين في نفس الوقت
            deliveredCode = await Product.claimCodeAtomic(product._id, order.orderId, order.buyerEmail);
        }

        order.status = 'completed';
        order.costPrice = product.basePrice || 0; // تخزين سعر التكلفة الحالي للمنتج داخل الطلب
        order.code = deliveredCode;
        order.completedAt = new Date();
        await order.save();
        await createLog('تأكيد طلب', `تم إكمال الطلب #${order.orderId} وتسليم الكود`, req, product._id, product.productName);

        res.json({ success: true, message: 'تم تأكيد الطلب بنجاح وتوفير الكود' });

    } catch (err) {
        console.error('Approval Error:', err.message);
        res.status(500).json({ success: false, error: 'فشل تنفيذ الطلب آلياً: ' + err.message });
    }
};

exports.getStats = async (req, res) => {
    try {
        const completedOrders = await Order.countDocuments({ status: 'completed' });
        const pendingOrders = await Order.countDocuments({ status: 'pending' });
        
        // حساب الأرباح بناءً على الطلبات المكتملة وهامش ربح المنتجات
        const completedOrdersList = await Order.find({ status: 'completed' });
        let totalProfit = 0;

        for (const order of completedOrdersList) {
            if (order.costPrice && order.costPrice > 0) {
                // حساب الربح الحقيقي: سعر البيع - سعر التكلفة المخزن
                totalProfit += (order.price - order.costPrice);
            } else {
                //fallback للطلبات القديمة التي لا تملك costPrice (استخدام العملية الحسابية السابقة)
                totalProfit += 0; 
            }
        }

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const completedOrdersToday = await Order.countDocuments({ status: 'completed', completedAt: { $gte: startOfDay } });
        const salesToday = await Order.aggregate([
            { $match: { status: 'completed', completedAt: { $gte: startOfDay } } },
            { $group: { _id: null, total: { $sum: "$price" } } }
        ]);

        const totalSales = await Order.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: "$price" } } }
        ]);

        const providerBalances = await fetchProviderBalances(externalProviders);

        res.json({ 
            success: true, 
            stats: { 
                completedOrders,
                pendingOrders,
                completedOrdersToday,
                salesToday: salesToday[0]?.total || 0,
                revenue: totalSales[0]?.total || 0,
                totalProfit,
                providerBalances
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل جلب الإحصائيات' });
    }
};

exports.getOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: 'فشل جلب الطلبات' });
    }
};

exports.getLogs = async (req, res) => {
    try {
        // جلب آخر 50 سجل نشاط
        const logs = await Log.find().sort({ createdAt: -1 }).limit(50);
        res.json({ success: true, logs });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل جلب السجلات' });
    }
};

exports.deleteLog = async (req, res) => {
    try {
        const { logId } = req.params;
        await Log.findByIdAndDelete(logId);
        res.json({ success: true, message: 'تم حذف السجل بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل حذف السجل' });
    }
};

exports.deleteAllLogs = async (req, res) => {
    try {
        await Log.deleteMany({});
        await createLog('تفريغ السجلات', 'قام المسؤول بحذف كافة سجلات النشاط', req);
        res.json({ success: true, message: 'تم تفريغ جميع السجلات بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل في حذف السجلات' });
    }
};

exports.exportLogs = async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
        res.json({ success: true, logs });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل جلب السجلات للتصدير' });
    }
};

exports.updateProductMargin = async (req, res) => {
    try {
        let { margin } = req.body;
        const { productId } = req.params;

        margin = parseFloat(margin);
        // حماية ضد الخطأ: منع وضع هامش ربح أقل من 1 (أقل من التكلفة)
        if (isNaN(margin) || margin < 1.0) {
            return res.status(400).json({ success: false, message: 'هامش الربح يجب أن يكون 1.0 أو أكثر لضمان عدم البيع بخسارة.' });
        }

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: 'المنتج غير موجود' });

        const oldMargin = product.profitMargin;
        product.profitMargin = margin;
        
        // إعادة حساب السعر بناءً على الهامش الجديد والسعر الأصلي
        if (product.isExternal && product.basePrice > 0) {
            product.price = parseFloat((product.basePrice * product.profitMargin).toFixed(2));
        }
        
        await product.save();
        await createLog('تعديل هامش ربح', `تغيير الهامش من ${oldMargin} إلى ${margin} لمنتج: ${product.productName}`, req, product._id, product.productName);
        
        res.json({ success: true, message: 'تم تحديث هامش الربح بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getProviderBalances = async (req, res) => {
    try {
        const balances = await fetchProviderBalances(externalProviders);
        res.json({ success: true, balances });
    } catch (err) {
        res.status(500).json({ success: false, error: 'فشل جلب أرصدة المزودين' });
    }
};
