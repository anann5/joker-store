import { showAllCategories, showProductDetails, updateCartUI, showToast, initToastContainer } from './ui.js';
import { cart, clearCart } from './cart.js';

// ======================================================
//  البيانات الأساسية للأقسام
// ======================================================
export const rawServerData = {
    categories: {
        gaming_general: { title: "الالعاب", image: "image/games.png", desc: "بطاقات شحن لمختلف الألعاب" },
        steam:          { title: "ستيم", image: "image/steam.png", desc: "بطاقات Steam Wallet بالدولار" },
        pubg:           { title: "شحن ببجي موبايل", image: "image/pubg.png", desc: "شدات ببجي الأصلية" },
        fortnite:       { title: "شحن فورتنايت", image: "image/fortnite.png", desc: "V-Bucks فورتنايت" },
        playstation:    { title: "بطاقات بلايستيشن", image: "image/playstation.png", desc: "PSN Gift Cards" },
        xbox:           { title: "بطاقات إكس بوكس", image: "image/xbox.png", desc: "Xbox Gift Cards" },
        microsoft_windows: { title: "مفاتيح ويندوز وأوفيس", image: "image/windows.png", desc: "مفاتيح أصلية مضمونة" },
        adobe:          { title: "حسابات أدوبي المفعّلة", image: "image/adobe.png", desc: "Adobe Creative Cloud" },
        antivirus:      { title: "برامج الحماية الرقمية", image: "image/antivirus.png", desc: "حماية شاملة لأجهزتك" },
        vpn:            { title: "اشتراكات VPN العالمية", image: "image/vpn.png", desc: "تصفح آمن وخصوصية كاملة" },
        google:         { title: "بطاقات جوجل بلاي", image: "image/google_play.png", desc: "Google Play Gift Cards" },
        itunes:         { title: "بطاقات آيتونز وعروض آبل", image: "image/itunes.png", desc: "Apple Gift Cards" },
        razer_gold:     { title: "بطاقات ريزر جولد", image: "image/razer.png", desc: "Razer Gold العالمية" },
        amazon:         { title: "بطاقات تسوق أمازون", image: "image/amazon.png", desc: "Amazon Gift Cards" }
    }
};

let _currentCategoryKey = 'all'; // متغير داخلي لمتابعة القسم الحالي
export const currentCategoryKey = () => _currentCategoryKey;

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
        name: item.productName || item.name,
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
//  عرض المنتجات داخل القسم
// ======================================================
export function selectCategory(categoryKey) {
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

    fetch('/api/products/' + categoryKey)
        .then(function(res) { return res.json(); })
        .then(function(products) { 
            grid.innerHTML = '';

            products.forEach(function(item) {
                const detectedRegion = detectRegion(item);
                const regionInfo = getRegionDetails(detectedRegion);
                const clientItem = formatItem(item, categoryKey, detectedRegion);

                                const cardHTML = `
                    <div class="product-item-card card" data-region="${detectedRegion}" onclick='showProductDetails(${JSON.stringify(clientItem)})'>
                        <div class="card-flag-badge ${regionInfo.cls}">
                            ${regionInfo.isIcon ? '<i class="fas fa-globe"></i>' : `<img src="${regionInfo.flagUrl}" />`}
                        </div>
                        <div class="card-img-container">
                            <img src="${clientItem.image}" alt="${clientItem.name}" class="card-inner-img">
                        </div>
                        <div class="card-content">
                            <h3 class="card-title">${clientItem.name}</h3>
                            <p class="price-tag card-price">${clientItem.price}$</p>
                            <button class="enter-btn" style="margin-top: 10px;">عرض التفاصيل 🔍</button>
                        </div>
                    </div>
                `;
                grid.insertAdjacentHTML('beforeend', cardHTML);
            });
            
            if (products.length === 0) {
                grid.innerHTML = '<p style="color:#b9bbbe; grid-column:1/-1; text-align:center; padding:60px 0;">🚫 لا توجد بطاقات متاحة في هذا القسم حالياً.</p>';
            }
        }).catch(err => console.error("Error fetching products:", err));
}

// ======================================================
//  العودة للرئيسية
// ======================================================
function goBack() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    showAllCategories();
}

//  تهيئة الأحداث عند تحميل الصفحة
// ======================================================
document.addEventListener('DOMContentLoaded', function() {
    // 🔝 إجبار المتصفح على بدء الصفحة من الأعلى عند التحديث
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    showAllCategories();
    initToastContainer(); // تهيئة حاوية الإشعارات
    initHeroSlider(); // تشغيل السلايدر
    updateTrustTicker(); // تحديث شريط الثقة
    
    updateCartUI(); // تحديث السلة فور فتح الصفحة

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
                alert('📋 تم نسخ كود الشحن بنجاح!');
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

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase().trim();
            if (query === '') { goBack(); return; }

            const grid = document.getElementById('mainCategories');
            const backContainer = document.getElementById('back-container');
            if (grid) grid.removeAttribute('style');
            grid.className = '';
            grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:25px;';
            grid.innerHTML = '';
            if (backContainer) backContainer.style.display = 'block';

            let found = false;
            grid.innerHTML = Object.entries(rawServerData.categories)
                .filter(([key, cat]) => cat.title.toLowerCase().includes(query))
                .map(([key, cat]) => {
                    found = true;
                    return `
                        <div class="category-card" data-category="${key}">
                            <img src="${cat.image}" alt="${cat.title}" onerror="this.src='image/logo.png'">
                            <h3>${cat.title}</h3>
                            <p>${cat.desc}</p>
                            <button class="enter-btn" data-category="${key}">دخول القسم 📂</button>
                        </div>
                    `;
                }).join('');

            if (!found) {
                grid.innerHTML = '<p style="color:#b9bbbe; grid-column:1/-1; text-align:center; padding:40px;">❌ لا توجد أقسام مطابقة لبحثك...</p>';
            }
        });
    }

    // فتح السلة عبر زر الهيدر
    const cartHeaderBtn = document.getElementById('cartHeaderBtn');
    if (cartHeaderBtn && purchaseModal) {
        cartHeaderBtn.addEventListener('click', function() {
            updateCartUI();
            purchaseModal.classList.add('active'); 
        });
    }

    // تغيير المحافظ ديناميكياً داخل المودال
    const paymentSelect = document.getElementById('paymentMethodSelect');
    const instructionsZone = document.getElementById('paymentInstructions');
    if (paymentSelect && instructionsZone) {
        paymentSelect.addEventListener('change', function(e) {
            const method = e.target.value;
            if (method === 'jawwal_pay') {
                instructionsZone.innerHTML = `
                    <p style="margin: 0 0 8px 0; color: #00f0ff; font-weight: bold;"><i class="fas fa-wallet"></i> حساب جوال بي (Jawwal Pay):</p>
                    <p style="margin: 5px 0;">الرجاء تحويل المبلغ إلى الرقم التالي: <span style="color: #fff; font-weight: bold; letter-spacing: 1px;">059XXXXXXX</span></p>
                    <p style="margin: 5px 0; color: #b9bbbe;">بعد التحويل، اكتب رقم العملية أو اسم المحول بالأسفل لتأكيد طلبك.</p>
                `;
            } else if (method === 'palpay') {
                instructionsZone.innerHTML = `
                    <p style="margin: 0 0 8px 0; color: #0072ff; font-weight: bold;"><i class="fas fa-university"></i> حساب بال بي (PalPay):</p>
                    <p style="margin: 5px 0;">الرجاء تحويل المبلغ إلى رقم المحفظة: <span style="color: #fff; font-weight: bold; letter-spacing: 1px;">9XXXXX</span></p>
                    <p style="margin: 5px 0; color: #b9bbbe;">بعد التحويل، اكتب اسم حسابك أو رقم التحويل بالأسفل.</p>
                `;
            }
        });
    }

    // إرسال طلب السلة الكامل بالكامل للـ Backend
    const submitOrderBtn = document.getElementById('submitOrderBtn');
    if (submitOrderBtn) {
        submitOrderBtn.addEventListener('click', async function() {
            const email = document.getElementById('user-email').value.trim();
            const paymentRef = document.getElementById('paymentRefInput').value.trim();
            const gateway = paymentSelect ? paymentSelect.value : 'jawwal_pay';

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
                // إذا كان الخيار هو Stripe، نقوم بفتح نافذة الدفع الآمنة
                if (gateway === 'stripe') {
                    const res = await fetch('/api/create-payment-intent', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
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
                    headers: { 'Content-Type': 'application/json' },
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

});

// ======================================================
// 🍞 نظام الإشعارات المنبثقة (Toast Notifications)
// ======================================================
// تم نقل هذا المنطق بالكامل إلى ui.js