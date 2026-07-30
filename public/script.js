// ======================================================
//  البيانات الأساسية للأقسام
// ======================================================
const rawServerData = {
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

let currentCategoryKey = 'all'; // متغير عالمي لمتابعة القسم الحالي
let currentSelectedProduct = null;
let cart = JSON.parse(localStorage.getItem('joker_cart')) || [];

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
//  عرض الأقسام الرئيسية
// ======================================================
function showAllCategories() {
    const grid = document.getElementById('mainCategories');
    if (!grid) return;
    
    grid.className = ''; 
    grid.removeAttribute('style'); // مسح كافة الستايلات البرمجية لضمان العودة لـ CSS الأصلي

    const backContainer = document.getElementById('back-container');
    if (backContainer) backContainer.style.display = 'none';
    
    const regionBar = document.getElementById('regionFilterBar');
    if (regionBar) regionBar.style.display = 'none';

    document.querySelectorAll('#filterTabs .filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('#filterTabs .filter-btn[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');

    grid.innerHTML = Object.entries(rawServerData.categories).map(([key, cat]) => `
        <div class="category-card" data-category="${key}">
            <img src="${cat.image}" alt="${cat.title}" onerror="this.src='image/logo.png'">
            <h3>${cat.title}</h3>
            <p>${cat.desc}</p>
            <button class="enter-btn" data-category="${key}">دخول القسم 📂</button>
        </div>
    `).join('');
}

// ======================================================
//  عرض المنتجات داخل القسم
// ======================================================
function selectCategory(categoryKey) {
    currentCategoryKey = categoryKey; // تحديث القسم الحالي
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

    grid.innerHTML = '<p style="color:#b9bbbe; grid-column:1/-1; text-align:center; padding:60px 0;">⏳ جاري جلب البطاقات...</p>';

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
//  عرض تفاصيل المنتج (New View)
// ======================================================
function showProductDetails(item) {
    const grid = document.getElementById('mainCategories');
    const regionBar = document.getElementById('regionFilterBar');
    if (regionBar) regionBar.style.display = 'none';

    // تنظيف الكلاسات القديمة وإضافة كلاس وضع التفاصيل
    grid.className = 'product-details-wrapper'; // تطبيق كلاس التفاصيل
    grid.removeAttribute('style');

    // تحويل البيانات لنص آمن لمنع مشاكل الـ HTML
    const safeItem = encodeURIComponent(JSON.stringify(item));

    grid.innerHTML = `
        <div class="product-detail-container">
            <div class="detail-media">
                <img src="${item.image}" class="detail-img" onerror="this.src='image/logo.png'">
            </div>
            <div class="detail-info">
                <h2>${item.name}</h2>
                <div class="detail-desc">
                    <p>✨ <b>وصف المنتج:</b> استلم كود شحن أصلي ومضمون 100%.</p>
                    <p>🌍 <b>المنطقة:</b> ${item.region.toUpperCase()}</p>
                    <p>🛡️ <b>الضمان:</b> ضمان Joker Store لعمل الكود بشكل فوري.</p>
                    <p style="margin-top:20px; color:var(--primary-neon);">💡 ملاحظة: الكود سيصلك فور تأكيد التحويل من قبل الأدمن.</p>
                </div>
                <div class="price-tag" style="font-size: 2.5rem; margin-bottom:30px;">${item.price}$</div>
                <button class="buy-btn" style="padding: 20px; font-size: 1.2rem;" onclick='handleAddToCart("${safeItem}")'>
                    <i class="fas fa-shopping-cart"></i> إضافة للسلة وإتمام الشراء
                </button>
                <button class="back-to-main-btn" onclick="selectCategory('${currentCategoryKey}')" style="margin-top:20px; background:transparent; border:1px solid #333;">
                    ⬅️ العودة لقائمة البطاقات
                </button>
            </div>
        </div>
    `;
    window.scrollTo(0, 0);
}

// دالة وسيطة لفك تشفير البيانات وإضافتها للسلة
function handleAddToCart(encodedItem) {
    const item = JSON.parse(decodeURIComponent(encodedItem));
    addToCart(item);
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

            if (!email) { alert('الرجاء إدخال إيميل مستلم الكود أولاً!'); return; }
            if (!paymentRef) { alert('الرجاء إدخال رقم العملية أو اسم المحوّل لتأكيد الدفع!'); return; }
            if (cart.length === 0) { alert('سلتك فارغة!'); return; }

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
                    cart = [];
                    localStorage.removeItem('joker_cart');
                    updateCartUI();
                    alert('🚀 تم استلام طلبك بنجاح! بمجرد تحقق الأدمن من التحويل، سيصلك كود الشحن فوراً على إيميلك.');
                } else {
                    alert('❌ فشل إرسال الطلب: ' + (result.error || 'حدث خطأ غير متوقع'));
                }
            } catch (err) {
                alert('❌ عذراً، السيرفر مغلق حالياً أو هناك مشكلة في الاتصال.');
            } finally {
                submitOrderBtn.disabled = false;
                submitOrderBtn.textContent = '🚀 تأكيد التحويل وإرسال الطلب';
            }
        });
    }

    const clearBtn = document.getElementById('clearCartBtn'); 
    if (clearBtn) {
        clearBtn.onclick = window.clearCart;
    }

});

// ======================================================
// 🛒 سيستم السلة المحلية المستقلة النظيفة
// ======================================================
function addToCart(product) {
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
        existingItem.qty += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            qty: 1
        });
    }
    
    localStorage.setItem('joker_cart', JSON.stringify(cart));
    updateCartUI();
    alert(`📥 تم إضافة [${product.name}] إلى السلة بنجاح!`);
}

// ======================================================
// 🛒 الدالة الأصلية لتحديث السلة وإصلاح الأيقونة الحمراء
// ======================================================
function updateCartUI() {
    // تحديث العداد العلوي إن وجد
    const badge = document.getElementById('cartCountBadge');
    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    if (badge) badge.textContent = totalQty;

    // جلب منطقة السلة والمجموع
    const listZone = document.getElementById('cartItemsList'); 
    const totalZone = document.getElementById('cartTotalAmount');
    
    if (!listZone) return;
    
    // إذا كانت السلة فارغة
    if (cart.length === 0) {
        listZone.innerHTML = '<p style="color:#b9bbbe; text-align:center; padding:20px; font-size:0.9rem;">السلة فارغة حالياً 🛒</p>';
        if (totalZone) totalZone.textContent = '0.00$';
        return;
    }

    // تفريغ زون المنتجات قبل إعادة البناء لمنع التكرار
    listZone.innerHTML = '';
    let totalCost = 0;

    cart.forEach((item, index) => {
        totalCost += (item.price * item.qty);
        
        const row = document.createElement('div');
        row.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:12px; border-radius:8px; margin-bottom:8px; border:1px solid rgba(0,240,255,0.05); direction: rtl;";
        
        // ربط الدالة بـ window.removeFromCart صراحة لحل مشكلة عدم الاستجابة نهائياً
        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <i data-index="${index}" class="fas fa-trash-alt remove-cart-btn" style="color:#ff0055; cursor:pointer; font-size:1.2rem; padding: 5px;" title="حذف المنتج"></i>
                <span style="color:#00f0ff; font-weight:bold;">${(item.price * item.qty).toFixed(2)}$</span>
            </div>
            
            <div style="display: flex; align-items: center;">
                <span style="color:#fff; font-size:0.95rem;">${item.name} <span style="color: #00f0ff; font-size: 0.85rem;">(${item.qty}x)</span></span>
            </div>
        `;
        listZone.appendChild(row);
    });

    if (totalZone) totalZone.textContent = totalCost.toFixed(2) + "$";

    // ربط أزرار الحذف ✅
    listZone.querySelectorAll('.remove-cart-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.getAttribute('data-index'));
            removeFromCart(idx);
        });
    });
}

// ======================================================
// 🗑️ دالة الحذف الفردي المستقرة
// ======================================================
function removeFromCart(index) {
    if (index > -1 && index < cart.length) {
        cart.splice(index, 1); // حذف العنصر من المصفوفة بناءً على ترتيبه
        localStorage.setItem('joker_cart', JSON.stringify(cart)); // حفظ التعديل في الكاش
        updateCartUI(); // إعادة تحديث شكل السلة فوراً
    }
}

// ======================================================
// 🧼 دالة تفريغ السلة بالكامل (التي كانت ناقصة وتعطل الزر بسببها)
// ======================================================
function clearCart() {
    if (cart.length === 0) return;
    if (confirm('هل أنت متأكد من رغبتك في تفريغ السلة بالكامل؟')) {
        cart = []; // مسح المصفوفة
        localStorage.setItem('joker_cart', JSON.stringify(cart)); // تحديث الكاش
        updateCartUI(); // إعادة تحديث الواجهة
    }
}

// تصدير الدوال بالكامل لتكون معرّفة على مستوى المتصفح
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.updateCartUI = updateCartUI;