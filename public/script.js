import { showAllCategories, showProductDetails, updateCartUI, showToast, initToastContainer } from './ui.js';
import { cart, addToCart, clearCart } from './cart.js';
import { initAuth, getCurrentUser } from './auth.js';
import { initI18n, getCurrentLanguage } from './i18n.js';

// ======================================================
//  البيانات الأساسية للأقسام
// ======================================================
export let rawServerData = { categories: {} };

let searchIndex = []; // 🚀 فهرس البحث السريع
let _currentCategoryKey = 'all'; // متغير داخلي لمتابعة القسم الحالي
let productCache = new Map(); // ذاكرة تخزين مؤقت للمنتجات التي يتم جلبها

// ======================================================
// 🚀 تشغيل سلايدر العروض تلقائياً
// ======================================================
function initHeroSlider() {
    const slides = document.querySelectorAll('.hero-section .slide');
    if (slides.length <= 1) return;

    let currentSlide = 0;
    setInterval(() => {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    }, 5000); // تبديل كل 5 ثوانٍ
}

// ======================================================
// 🛡️ تحديث شريط الثقة ببيانات حقيقية
// ======================================================
async function updateTrustTicker() {
    const tickerZone = document.querySelector('.ticker-content');
    if (!tickerZone) return;

    try {
        const res = await fetch('/api/products/latest-orders'); // سنفترض وجود هذا المسار البسيط
        const data = await res.json();
        if (data.success && data.orders.length > 0) {
            const tickerText = data.orders.map(o => 
                `✨ تم تسليم طلب #${o.orderId.substring(0,8)} بنجاح (${o.productName}) .. `
            ).join(' ✅ ');
            tickerZone.innerHTML = tickerText + " 🛡️ جميع الأكواد أصلية ومضمونة 100%";
        }
    } catch (e) {
        // في حال الفشل نترك النص الافتراضي الجميل الذي وضعناه
    }
}

// ======================================================
//  دوالمساعدة (Helper Functions)
// ======================================================
function detectRegion(item) {
    const text = ((item.productName || item.name || "") + " " + (item._id || item.id || "")).toLowerCase();
    if (text.includes('tr') || text.includes('تركي')) return 'tr';
    if (text.includes('ae') || text.includes('امارات')) return 'ae';
    if (text.includes('sa') || text.includes('سعودي')) return 'sa';
    if (text.includes('us') || text.includes('امريكي')) return 'us';
    if (text.includes('eu') || text.includes('اوروب')) return 'eu';
    return 'global';
}

function formatItem(item, categoryKey, region) {
    return {
        id: item._id || item.id,
        name: item.name, // الخادم يرسل الاسم المترجم جاهزاً في حقل 'name'
        price: (typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0).toFixed(2),
        region: region,
        image: item.image || 'image/' + categoryKey + '.png'
    };
}

// ======================================================
//  دالة تحديد الريجن وجلب روابط الأعلام المحلية
// ======================================================
function getRegionDetails(region) {
    const reg = String(region || 'global').toLowerCase();
    
    if (reg.includes('tr')) return { cls: 'badge-tr', flagUrl: '/image/flags/tr.png', isIcon: false };
    if (reg.includes('ae')) return { cls: 'badge-ae', flagUrl: '/image/flags/ae.png', isIcon: false };
    if (reg.includes('sa')) return { cls: 'badge-sa', flagUrl: '/image/flags/sa.png', isIcon: false };
    if (reg.includes('vn') || reg.includes('viet')) return { cls: 'badge-vn', flagUrl: '/image/flags/vn.png', isIcon: false };
    if (reg.includes('cn') || reg.includes('china')) return { cls: 'badge-cn', flagUrl: '/image/flags/cn.png', isIcon: false };
    if (reg.includes('us')) return { cls: 'badge-us', flagUrl: '/image/flags/us.png', isIcon: false };
    
    return { cls: 'badge-global', flagUrl: '', isIcon: true }; 
}

// ======================================================
//  دالة لمعرفة القسم الحالي
//  عرض المنتجات داخل القسم
// ======================================================
export function selectCategory(categoryKey) {
    // حفظ القسم الذي تمت زيارته في التخزين المحلي
    localStorage.setItem('joker_lastCategory', categoryKey);

    _currentCategoryKey = categoryKey; // تحديث القسم الحالي
    const grid = document.getElementById('mainCategories');
    const backContainer = document.getElementById('back-container');
    const regionBar = document.getElementById('regionFilterBar');
    
    if (!grid) return;
    grid.className = 'products-grid'; // تطبيق كلاس الشبكة للمنتجات
    grid.removeAttribute('style');

    if (backContainer) backContainer.style.display = 'block';
    if (regionBar) {
        regionBar.style.display = 'flex';
        regionBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        const allBtn = regionBar.querySelector('[data-target="all"]');
        if (allBtn) allBtn.classList.add('active');
    }

    // استخدام مؤشر تحميل مرئي أفضل
    grid.innerHTML = `
        <div class="loader-container" style="grid-column:1/-1; text-align:center; padding:60px 0; display:flex; justify-content:center; align-items:center; flex-direction:column; gap:15px;">
            <i class="fas fa-spinner fa-spin" style="font-size: 3rem; color: var(--primary-neon);"></i>
            <p style="color:#b9bbbe; margin-top:15px;">جاري جلب البطاقات...</p>
        </div>
    `;

    fetch(`/api/products/${categoryKey}?lang=${getCurrentLanguage()}`)
        .then(function(res) { return res.json(); })
        .then(function(data) { // 🔥 تصحيح: المتغير الآن هو 'data' الذي يحتوي على success و products
            if (!data.success || !data.products) {
                throw new Error(data.error || 'فشل في جلب البيانات');
            }

            grid.innerHTML = '';
            productCache.clear(); // تفريغ الكاش قبل ملئه من جديد
            const template = document.getElementById('product-card-template');

            data.products.forEach(function(item) { // 🔥 تصحيح: استخدام data.products بدلاً من products مباشرة
                const detectedRegion = detectRegion(item);
                const regionInfo = getRegionDetails(detectedRegion);
                // الخادم يرسل الاسم المترجم جاهزاً في حقل 'name'
                const clientItem = formatItem({ ...item, name: item.name }, categoryKey, detectedRegion);

                productCache.set(clientItem.id, clientItem); // إضافة المنتج للكاش

                const card = template.content.cloneNode(true);
                const cardElement = card.querySelector('.product-item-card');
                cardElement.dataset.productId = clientItem.id;
                cardElement.dataset.region = detectedRegion;
                card.querySelector('.card-flag-badge').innerHTML = regionInfo.isIcon ? '<i class="fas fa-globe"></i>' : `<img src="${regionInfo.flagUrl}" />`;
                card.querySelector('.card-inner-img').src = clientItem.image;
                card.querySelector('.card-inner-img').alt = clientItem.name;
                card.querySelector('.card-title').textContent = clientItem.name;
                card.querySelector('.card-price').textContent = `${clientItem.price}$`;
                grid.appendChild(card);
            });
            
            if (data.products.length === 0) {
                grid.innerHTML = '<p style="color:#b9bbbe; grid-column:1/-1; text-align:center; padding:60px 0;">🚫 لا توجد بطاقات متاحة في هذا القسم حالياً.</p>';
            }
        }).catch(err => console.error("Error fetching products:", err));
}

export const currentCategoryKey = () => _currentCategoryKey;

// ======================================================
//  العودة للرئيسية
// ======================================================
function goBack() {
    // حذف القسم المحفوظ عند العودة للصفحة الرئيسية
    localStorage.removeItem('joker_lastCategory');

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    showAllCategories();
}

/**
 * جلب وعرض قسم "الأكثر مبيعاً" في الصفحة الرئيسية.
 */
async function renderBestSellingProducts() {
    const container = document.getElementById('best-selling-container');
    if (!container) return;

    try {
        const lang = getCurrentLanguage();
        const res = await fetch(`/api/products/best-selling?lang=${lang}`);
        const data = await res.json();

        if (data.success && data.products.length > 0) {
            const grid = container.querySelector('.products-grid');
            grid.innerHTML = ''; // تفريغ المحتوى
            const template = document.getElementById('product-card-template');

            data.products.forEach(item => {
                // بما أن اسم المنتج يأتي ككائن (ar, en)، نختار اللغة الصحيحة
                const localizedName = item.productName[lang] || item.productName['ar'];
                const detectedRegion = detectRegion(item);
                const regionInfo = getRegionDetails(detectedRegion);
                const clientItem = formatItem({ ...item, name: localizedName }, item.category, detectedRegion);

                productCache.set(clientItem.id, clientItem); // إضافة المنتج للكاش للوصول السريع

                const card = template.content.cloneNode(true);
                const cardElement = card.querySelector('.product-item-card');
                cardElement.dataset.productId = clientItem.id;
                cardElement.dataset.region = detectedRegion;
                card.querySelector('.card-flag-badge').innerHTML = regionInfo.isIcon ? '<i class="fas fa-globe"></i>' : `<img src="${regionInfo.flagUrl}" />`;
                card.querySelector('.card-inner-img').src = clientItem.image;
                card.querySelector('.card-inner-img').alt = clientItem.name;
                card.querySelector('.card-title').textContent = clientItem.name;
                card.querySelector('.card-price').textContent = `${clientItem.price}$`;
                grid.appendChild(card);
            });
        }
    } catch (error) {
        console.error("Failed to render best-selling products:", error);
    }
}

/**
 * جلب وعرض قسم "أضيف حديثاً" في الصفحة الرئيسية.
 */
async function renderNewlyAddedProducts() {
    const container = document.getElementById('newly-added-container');
    if (!container) return;

    try {
        const lang = getCurrentLanguage();
        const res = await fetch(`/api/products/newly-added?lang=${lang}`);
        const data = await res.json();

        if (data.success && data.products.length > 0) {
            const grid = container.querySelector('.products-grid');
            grid.innerHTML = ''; // تفريغ المحتوى
            const template = document.getElementById('product-card-template');

            data.products.forEach(item => {
                const localizedName = item.productName[lang] || item.productName['ar'];
                const detectedRegion = detectRegion(item);
                const regionInfo = getRegionDetails(detectedRegion);
                const clientItem = formatItem({ ...item, name: localizedName }, item.category, detectedRegion);

                productCache.set(clientItem.id, clientItem);

                const card = template.content.cloneNode(true);
                const cardElement = card.querySelector('.product-item-card');
                cardElement.dataset.productId = clientItem.id;
                cardElement.dataset.region = detectedRegion;
                card.querySelector('.card-flag-badge').innerHTML = regionInfo.isIcon ? '<i class="fas fa-globe"></i>' : `<img src="${regionInfo.flagUrl}" />`;
                card.querySelector('.card-inner-img').src = clientItem.image;
                card.querySelector('.card-inner-img').alt = clientItem.name;
                card.querySelector('.card-title').textContent = clientItem.name;
                card.querySelector('.card-price').textContent = `${clientItem.price}$`;
                grid.appendChild(card);
            });
        }
    } catch (error) {
        console.error("Failed to render newly added products:", error);
    }
}

/**
 * يعيد تحميل البيانات الديناميكية ويعيد عرضها بناءً على اللغة الجديدة.
 */
async function reloadDynamicData() {
    try {
        const lang = getCurrentLanguage();
        const res = await fetch(`/api/categories?lang=${lang}`);
        const data = await res.json();
        if (data.success) {
            rawServerData.categories = data.categories;
            // إعادة عرض القسم الحالي أو الأقسام الرئيسية
            const lastCategory = localStorage.getItem('joker_lastCategory');
            if (lastCategory && rawServerData.categories && rawServerData.categories[lastCategory]) {
                selectCategory(lastCategory);
            } else {
                showAllCategories();
            }
        }
    } catch (error) {
        console.error("Failed to reload dynamic categories:", error);
    }
}
/**
 * يعالج حدث تغيير اللغة، ويقوم بجلب بيانات الأقسام وعرضها.
 */
async function handleLanguageChange(event) {
    try {
        const lang = event.detail.lang || getCurrentLanguage(); // الأولوية للغة الممررة في الحدث
        const res = await fetch(`/api/categories?lang=${lang}`);
        const data = await res.json();
        if (data.success) {
            rawServerData.categories = data.categories;
            showAllCategories(); // عرض الأقسام الرئيسية بعد جلبها
        }
    } catch (error) {
        console.error("Failed to reload dynamic categories:", error);
    }
}
/**
 * تهيئة التطبيق بالكامل: جلب البيانات الأساسية وربط الأحداث.
 */
async function initializeApp() {
    // 🔝 إجبار المتصفح على بدء الصفحة من الأعلى عند التحديث
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
    
    // 0. 🔥 خطوة حاسمة: ربط المستمع أولاً لضمان التقاط الحدث الأولي
    window.addEventListener('languageChanged', handleLanguageChange);

    // 1. تهيئة نظام الترجمة أولاً. سيقوم هذا تلقائياً بتحديد اللغة الصحيحة،
    // تحميل الترجمات، وإطلاق حدث 'languageChanged'.
    initI18n(); 

    // 2. المستمع لحدث 'languageChanged' سيتكفل بجلب الأقسام وعرضها.
    // 3. باقي عمليات التهيئة التي لا تعتمد على اللغة.
    initToastContainer(); // تهيئة حاوية الإشعارات
    initHeroSlider(); // تشغيل السلايدر
    renderNewlyAddedProducts(); // 🚀 عرض المنتجات المضافة حديثاً
    renderBestSellingProducts(); // 🚀 عرض المنتجات الأكثر مبيعاً

    // 🚀 جلب فهرس البحث في الخلفية لتحسين الأداء
    (async () => {
        try {
            const res = await fetch('/api/products/search-index');
            const data = await res.json();
            if (data.success) {
                searchIndex = data.products;
                console.log(`✅ تم تحميل فهرس البحث بنجاح (${searchIndex.length} منتج).`);
            }
        } catch (error) {
            console.error("Failed to fetch search index:", error);
        }
    })();

    initAuth(); 
    updateTrustTicker(); // تحديث شريط الثقة
    
    updateCartUI(); // تحديث السلة فور فتح الصفحة

    setupEventListeners();
}

function setupEventListeners() {
    // ربط الأحداث بعد تحميل البيانات

    const logoHomeBtn = document.getElementById('logoHomeBtn');
    if (logoHomeBtn) {
        logoHomeBtn.addEventListener('click', function() { goBack(); });
    }

    const regionFilterBar = document.getElementById('regionFilterBar');
    if (regionFilterBar) {
        regionFilterBar.addEventListener('click', function(e) {
            const btn = e.target.closest('.filter-btn');
            if (!btn) return;

            regionFilterBar.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');

            const targetRegion = btn.getAttribute('data-target');
            const productCards = document.querySelectorAll('.product-item-card');

            productCards.forEach(function(card) {
                const cardRegion = card.dataset.region;
                if (targetRegion === 'all' || cardRegion === targetRegion) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
        });
    }

    const homeLink = document.getElementById('homeLink');
    if (homeLink) homeLink.addEventListener('click', function(e) { e.preventDefault(); goBack(); });

    const digitalCardsLink = document.getElementById('digitalCardsLink');
    if (digitalCardsLink) digitalCardsLink.addEventListener('click', function(e) { e.preventDefault(); goBack(); });

    const backToMainBtn = document.getElementById('backToMainBtn');
    if (backToMainBtn) backToMainBtn.addEventListener('click', goBack);

    const categoriesBtn = document.getElementById('categoriesBtn');
    if (categoriesBtn) {
        categoriesBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const dropdown = document.getElementById('categoriesDropdown');
            dropdown.classList.toggle('active');
            categoriesBtn.classList.toggle('active');
        });
    }

    document.querySelectorAll('.dropdown-item[data-category]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            selectCategory(this.dataset.category);
            document.getElementById('categoriesDropdown').classList.remove('active');
            document.getElementById('categoriesBtn').classList.remove('active');
        });
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.dropdown-wrapper')) {
            const dropdown = document.getElementById('categoriesDropdown');
            const btn = document.getElementById('categoriesBtn');
            if (dropdown) dropdown.classList.remove('active');
            if (btn) btn.classList.remove('active');
        }
    });

    // أحداث المودالات العامة لتجنب التكرار
    const purchaseModal = document.getElementById('purchaseModal');
    const closePurchaseBtn = document.getElementById('closeModal');
    if (closePurchaseBtn && purchaseModal) {
        closePurchaseBtn.addEventListener('click', function() { purchaseModal.classList.remove('active'); });
    }

    const codeModal = document.getElementById('codeModal');
    const closeCodeBtn = document.getElementById('closeCodeModal');
    if (closeCodeBtn && codeModal) {
        closeCodeBtn.addEventListener('click', function() { codeModal.classList.remove('active'); });
    }

    const copyCodeBtn = document.getElementById('copyCodeBtn');
    if (copyCodeBtn) {
        copyCodeBtn.addEventListener('click', function() {
            const codeText = document.getElementById('generatedCode').textContent;
            navigator.clipboard.writeText(codeText).then(function() {
                showToast('📋 تم نسخ كود الشحن بنجاح!', 'success');
            });
        });
    }

    // صائد ضغطات الكروت والدخول للسلة
    document.getElementById('mainCategories').addEventListener('click', function(e) {
        const enterBtn = e.target.closest('.enter-btn[data-category]');
        if (enterBtn) {
            selectCategory(enterBtn.dataset.category);
            return;
        }
        
        const buyBtn = e.target.closest('.buy-btn[data-item]');
        if (buyBtn) {
            const item = JSON.parse(buyBtn.dataset.item);
            addToCart(item);
            return;
        }

        const categoryCard = e.target.closest('.category-card[data-category]');
        if (categoryCard && !e.target.closest('button')) {
            selectCategory(categoryCard.dataset.category);
            return;
        }

        const productCard = e.target.closest('.product-item-card[data-product-id]');
        if (productCard) {
            const product = productCache.get(productCard.dataset.productId);
            if (product) showProductDetails(product);
        }
    });

    document.querySelectorAll('#filterTabs .filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#filterTabs .filter-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            const filter = btn.getAttribute('data-filter');
            const si = document.getElementById('searchInput');
            if (si) si.value = '';
            if (filter === 'all') {
                showAllCategories();
            } else if (rawServerData.categories[filter]) {
                selectCategory(filter);
            }
        });
    });

    // --- نظام البحث الذكي الجديد مع الإكمال التلقائي ---
    const setupAutocomplete = (inputId, resultsId) => {
        const searchInput = document.getElementById(inputId);
        const resultsContainer = document.getElementById(resultsId);
        if (!searchInput || !resultsContainer) return;

        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const query = e.target.value.trim();

            if (query.length < 2) {
                resultsContainer.style.display = 'none';
                return;
            }

            debounceTimer = setTimeout(async () => {
                // --- ✨ التحسين: البحث محلياً بدلاً من إرسال طلب ---
                const lang = getCurrentLanguage();
                const lowerCaseQuery = query.toLowerCase();

                const results = searchIndex.filter(product => {
                    const productName = (product.productName[lang] || product.productName['ar'] || '').toLowerCase();
                    return productName.includes(lowerCaseQuery);
                }).slice(0, 10); // عرض أول 10 نتائج فقط
                
                resultsContainer.innerHTML = '';
                if (results.length > 0) {
                    results.forEach(product => {
                        const item = document.createElement('div');
                        item.className = 'autocomplete-item';
                        item.innerHTML = `
                            <img src="${product.image || 'image/logo.png'}" alt="${product.productName}">
                            <div class="autocomplete-item-info">
                                <h4>${product.productName[lang] || product.productName['ar']}</h4>
                                <span>${rawServerData.categories[product.category]?.title || 'قسم غير معروف'}</span>
                            </div>
                            <span class="price">${product.price.toFixed(2)}$</span>
                        `;
                        item.onclick = () => {
                            const clientItem = formatItem(product, product.category, detectRegion(product));
                            showProductDetails(clientItem);
                            resultsContainer.style.display = 'none';
                            searchInput.value = '';
                        };
                        resultsContainer.appendChild(item);
                    });
                    resultsContainer.style.display = 'block';
                } else {
                    resultsContainer.style.display = 'none';
                }
            }, 300); // انتظار 300ms بعد توقف المستخدم عن الكتابة
        });

        // إخفاء النتائج عند الضغط خارج حقل البحث
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container') && !e.target.closest('.search-container-mobile')) {
                resultsContainer.style.display = 'none';
            }
        });
    };

    setupAutocomplete('searchInput', 'autocomplete-results');
    setupAutocomplete('searchInputMobile', 'autocomplete-results-mobile');

    // فتح السلة عبر زر الهيدر
    const cartHeaderBtn = document.getElementById('cartHeaderBtn');
    if (cartHeaderBtn && purchaseModal) {
        cartHeaderBtn.addEventListener('click', function() {
            // تحسين تجربة المستخدم: تعبئة الإيميل تلقائياً إذا كان مسجلاً دخوله
            const loggedInUser = getCurrentUser();
            const emailInput = document.getElementById('user-email');
            if (loggedInUser && emailInput) {
                emailInput.value = loggedInUser.email;
            }
            updateCartUI();
            purchaseModal.classList.add('active'); 
        });
    }

    // تغيير المحافظ ديناميكياً داخل المودال
    const paymentOptionsContainer = document.querySelector('.payment-options');
    const instructionsZone = document.getElementById('paymentInstructions');

    const updatePaymentInstructions = (method) => {
        if (!instructionsZone) return;
        if (method === 'jawwal_pay') {
            instructionsZone.innerHTML = `<p style="margin: 0 0 8px 0; color: #ff9f43; font-weight: bold;"><i class="fas fa-wallet"></i> حساب جوال بي (Jawwal Pay):</p><p style="margin: 5px 0;">الرجاء تحويل المبلغ إلى الرقم التالي: <span style="color: #fff; font-weight: bold; letter-spacing: 1px;">059XXXXXXX</span></p><p style="margin: 5px 0; color: #b9bbbe;">بعد التحويل، اكتب رقم العملية أو اسم المحول بالأسفل لتأكيد طلبك.</p>`;
        } else if (method === 'palpay') {
            instructionsZone.innerHTML = `<p style="margin: 0 0 8px 0; color: #0072ff; font-weight: bold;"><i class="fas fa-university"></i> حساب بال بي (PalPay):</p><p style="margin: 5px 0;">الرجاء تحويل المبلغ إلى رقم المحفظة: <span style="color: #fff; font-weight: bold; letter-spacing: 1px;">9XXXXX</span></p><p style="margin: 5px 0; color: #b9bbbe;">بعد التحويل، اكتب اسم حسابك أو رقم التحويل بالأسفل.</p>`;
        }
    };

    if (paymentOptionsContainer) {
        paymentOptionsContainer.addEventListener('change', (e) => {
            if (e.target.name === 'payment_gateway') {
                updatePaymentInstructions(e.target.value);
            }
        });
        // عرض التعليمات الافتراضية عند التحميل
        updatePaymentInstructions('jawwal_pay');
    }

    // إرسال طلب السلة الكامل بالكامل للـ Backend
    const submitOrderBtn = document.getElementById('submitOrderBtn');
    if (submitOrderBtn) {
        // Ensure paymentMethodSelect and user-email are available
        const paymentMethodSelect = document.getElementById('paymentMethodSelect');

        submitOrderBtn.addEventListener('click', async function() {
            const email = document.getElementById('user-email').value.trim();
            const paymentRef = document.getElementById('paymentRefInput').value.trim();
            const gateway = document.querySelector('input[name="payment_gateway"]:checked')?.value || 'jawwal_pay';

            if (!email) { showToast('الرجاء إدخال إيميل مستلم الكود أولاً!', 'error'); return; }
            if (!paymentRef) { showToast('الرجاء إدخال رقم العملية أو اسم المحوّل لتأكيد الدفع!', 'error'); return; }
            if (cart.length === 0) { showToast('سلتك فارغة!', 'error'); return; }

            // تجهيز مصفوفة المنتجات لكي يستلمها السيرفر دفعة واحدة
            const orderData = {
                cartItems: cart.map(item => ({ id: item.id, qty: item.qty })),
                customerEmail: email,
                customerName: "عميل المتجر", // قيمة افتراضية لأن النموذج لا يحتوي على حقل اسم
                paymentGateway: gateway,
                paymentRef: paymentRef
            };

            submitOrderBtn.disabled = true;
            submitOrderBtn.textContent = '⏳ جاري إرسال طلبك للـ الأدمن...';

            try {
                // تجهيز الترويسة وإضافة توكن المستخدم إذا كان موجوداً
                const headers = {
                    'Content-Type': 'application/json'
                };
                const token = localStorage.getItem('joker_token');
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                // إذا كان الخيار هو Stripe، نقوم بفتح نافذة الدفع الآمنة
                if (gateway === 'stripe') {
                    const res = await fetch('/api/create-payment-intent', {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ cartItems: cart.map(i => ({id: i.id, qty: i.qty})), customerEmail: email })
                    });
                    const { clientSecret } = await res.json();
                    
                    // هنا يتم استدعاء Stripe Checkout (يتطلب إضافة مكتبة Stripe.js في الـ HTML)
                    // للمثال، سنفترض إعادة التوجيه لصفحة دفع Stripe
                    window.location.href = `/checkout.html?secret=${clientSecret}`;
                    return;
                }

                // الطريقة اليدوية الحالية
                const response = await fetch('/api/checkout', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(orderData)
                });

                const result = await response.json();

                if (result.success) {
                    purchaseModal.classList.remove('active');
                    cart.length = 0; // تفريغ المصفوفة
                    localStorage.removeItem('joker_cart');
                    updateCartUI();
                    showToast('🚀 تم استلام طلبك بنجاح! سيصلك الكود فور تأكيد الأدمن.', 'success');
                } else {
                    showToast('❌ فشل إرسال الطلب: ' + (result.error || 'حدث خطأ غير متوقع'), 'error');
                }
            } catch (err) {
                showToast('❌ عذراً، السيرفر مغلق حالياً أو هناك مشكلة في الاتصال.', 'error');
            } finally {
                submitOrderBtn.disabled = false;
                submitOrderBtn.textContent = '🚀 تأكيد التحويل وإرسال الطلب';
            }
        });
    }

    const clearBtn = document.getElementById('clearCartBtn'); 
    if (clearBtn) {
        clearBtn.onclick = clearCart;
    }
}

//  تهيئة الأحداث عند تحميل الصفحة
// ======================================================
document.addEventListener('DOMContentLoaded', function() {
    // استدعاء دالة التهيئة الرئيسية التي أصبحت الآن تحتوي على كل المنطق اللازم بالترتيب الصحيح.
    initializeApp(); 
});

// ======================================================
// 🍞 نظام الإشعارات المنبثقة (Toast Notifications)
// ======================================================
// تم نقل هذا المنطق بالكامل إلى ui.js