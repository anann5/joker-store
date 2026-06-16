// ======================================================
//  البيانات الأساسية للأقسام
// ======================================================
var rawServerData = {
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

var currentSelectedProduct = null;
var cart = JSON.parse(localStorage.getItem('joker_cart')) || [];

// ======================================================
//  دالة تحديد الريجن وجلب روابط الأعلام المحلية
// ======================================================
function getRegionDetails(region) {
    var reg = String(region || 'global').toLowerCase();
    
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
    var grid = document.getElementById('mainCategories');
    if (!grid) return;
    grid.className = '';
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:25px;';
    grid.innerHTML = '';

    var backContainer = document.getElementById('back-container');
    if (backContainer) backContainer.style.display = 'none';
    
    var regionBar = document.getElementById('regionFilterBar');
    if (regionBar) regionBar.style.display = 'none';

    document.querySelectorAll('#filterTabs .filter-btn').forEach(function(b) { b.classList.remove('active'); });
    var allBtn = document.querySelector('#filterTabs .filter-btn[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');

    Object.keys(rawServerData.categories).forEach(function(key) {
        var cat = rawServerData.categories[key];
        var div = document.createElement('div');
        div.className = 'category-card';
        div.dataset.category = key;

        var img = document.createElement('img');
        img.src = cat.image;
        img.alt = cat.title;
        img.onerror = function() { this.src = 'image/logo.png'; };

        var h3 = document.createElement('h3');
        h3.textContent = cat.title;

        var p = document.createElement('p');
        p.textContent = cat.desc;

        var btn = document.createElement('button');
        btn.className = 'enter-btn';
        btn.textContent = 'دخول القسم 📂';
        btn.dataset.category = key;

        div.appendChild(img);
        div.appendChild(h3);
        div.appendChild(p);
        div.appendChild(btn);
        grid.appendChild(div);
    });
}

// ======================================================
//  عرض المنتجات داخل القسم
// ======================================================
function selectCategory(categoryKey) {
    var cat = rawServerData.categories[categoryKey];
    if (!cat) return;

    var grid = document.getElementById('mainCategories');
    var backContainer = document.getElementById('back-container');
    if (!grid) return;

    if (backContainer) backContainer.style.display = 'block';

    var regionBar = document.getElementById('regionFilterBar');
    if (regionBar) {
        regionBar.style.display = 'flex';
        regionBar.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
        var allRegionBtn = regionBar.querySelector('.filter-btn[data-target="all"]');
        if (allRegionBtn) allRegionBtn.classList.add('active');
    }

    document.querySelectorAll('#filterTabs .filter-btn').forEach(function(b) {
        b.classList.remove('active');
        if (b.getAttribute('data-filter') === categoryKey) b.classList.add('active');
    });

    grid.className = 'products-grid';
    grid.innerHTML = '<p style="color:#b9bbbe; grid-column:1/-1; text-align:center; padding:60px 0;">⏳ جاري جلب البطاقات...</p>';

    fetch('/api/products/' + categoryKey)
        .then(function(res) { return res.json(); })
        .then(function(products) {
            grid.innerHTML = '';

            if (!products || products.length === 0) {
                grid.innerHTML = '<p style="color:#b9bbbe; grid-column:1/-1; text-align:center; padding:60px 0;">⏳ هذا القسم سيتم تزويده بالبطاقات قريباً!</p>';
                return;
            }

            products.forEach(function(item) {
                var detectedRegion = 'global';
                var nameLower = (item.name || item.productName || '').toLowerCase();
                var idUpper = (item.id || item._id || '').toString().toUpperCase();

                if (idUpper.includes('US') || nameLower.includes('us') || nameLower.includes('امريكي') || nameLower.includes('أمريكي')) detectedRegion = 'us';
                else if (idUpper.includes('TR') || nameLower.includes('tr') || nameLower.includes('تركي')) detectedRegion = 'tr';
                else if (idUpper.includes('SA') || nameLower.includes('sa') || nameLower.includes('سعودي')) detectedRegion = 'sa';
                else if (idUpper.includes('AE') || nameLower.includes('ae') || nameLower.includes('امارات') || nameLower.includes('إمارات')) detectedRegion = 'ae';
                else if (idUpper.includes('KW') || nameLower.includes('kw') || nameLower.includes('كويت') || nameLower.includes('كويتي')) detectedRegion = 'kw';
                else if (idUpper.includes('EU') || nameLower.includes('eu') || nameLower.includes('اوروب') || nameLower.includes('أوروب')) detectedRegion = 'eu';

                var regionInfo = getRegionDetails(detectedRegion);
                
                // حفظ السعر النقي كعدد عشان السلة والحسابات
                var rawPrice = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;

                var clientItem = {
                    id: item.id || item._id,
                    name: item.name || item.productName,
                    price: rawPrice,
                    region: detectedRegion,
                    image: 'image/' + categoryKey + '.png'
                };

                var card = document.createElement('div');
                card.className = 'product-item-card card'; 
                card.dataset.region = detectedRegion;
                card.style.position = 'relative'; 

                var badge = document.createElement('div');
                badge.className = 'card-flag-badge ' + regionInfo.cls;
                badge.style.cssText = 'position: absolute; top: 12px; left: 12px; background: rgba(15, 18, 27, 0.65); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); padding: 5px 7px; border-radius: 8px; display: flex; align-items: center; justify-content: center; z-index: 10; border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 4px 10px rgba(0,0,0,0.4);';
                
                if (regionInfo.isIcon) {
                    badge.innerHTML = '<i class="fas fa-globe" style="color: #64ffda; font-size: 14px;"></i>';
                } else {
                    badge.innerHTML = '<img src="' + regionInfo.flagUrl + '" style="width: 20px; height: auto; border-radius: 2px; display: block;" />';
                }

                var imgContainer = document.createElement('div');
                imgContainer.className = 'card-img-container';
                var img = document.createElement('img');
                img.src = clientItem.image;
                img.alt = clientItem.name;
                img.className = 'card-inner-img';
                img.onerror = function() { this.src = 'image/logo.png'; };
                imgContainer.appendChild(img);

                var content = document.createElement('div');
                content.className = 'card-content';
                content.style.padding = '15px';

                var title = document.createElement('h3');
                title.className = 'card-title';
                title.textContent = clientItem.name;

                var price = document.createElement('p');
                price.className = 'price-tag card-price';
                price.textContent = clientItem.price + '$';

                var buyBtn = document.createElement('button');
                buyBtn.className = 'buy-btn';
                buyBtn.innerHTML = '<i class="fas fa-shopping-cart"></i> شراء واستلام الكود';
                buyBtn.dataset.item = JSON.stringify(clientItem);

                content.appendChild(title);
                content.appendChild(price);
                content.appendChild(buyBtn);

                card.appendChild(badge);
                card.appendChild(imgContainer);
                card.appendChild(content);
                grid.appendChild(card);
            });
        })
        .catch(function(err) {
            console.error('خطأ:', err);
            grid.innerHTML = '<p style="color:#e74c3c; grid-column:1/-1; text-align:center; padding:60px 0;">❌ فشل تحميل المنتجات</p>';
        });    
}

// ======================================================
//  العودة للرئيسية
// ======================================================
function goBack() {
    var searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    showAllCategories();
}

// ======================================================
//  تهيئة الأحداث عند تحميل الصفحة
// ======================================================
document.addEventListener('DOMContentLoaded', function() {

    showAllCategories();
    updateCartUI(); // تحديث السلة فور فتح الصفحة

    var logoHomeBtn = document.getElementById('logoHomeBtn');
    if (logoHomeBtn) {
        logoHomeBtn.addEventListener('click', function() { goBack(); });
    }

    var regionFilterBar = document.getElementById('regionFilterBar');
    if (regionFilterBar) {
        regionFilterBar.addEventListener('click', function(e) {
            var btn = e.target.closest('.filter-btn');
            if (!btn) return;

            regionFilterBar.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');

            var targetRegion = btn.getAttribute('data-target');
            var productCards = document.querySelectorAll('.product-item-card');

            productCards.forEach(function(card) {
                var cardRegion = card.dataset.region;
                if (targetRegion === 'all' || cardRegion === targetRegion) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
        });
    }

    var homeLink = document.getElementById('homeLink');
    if (homeLink) homeLink.addEventListener('click', function(e) { e.preventDefault(); goBack(); });

    var digitalCardsLink = document.getElementById('digitalCardsLink');
    if (digitalCardsLink) digitalCardsLink.addEventListener('click', function(e) { e.preventDefault(); goBack(); });

    var backToMainBtn = document.getElementById('backToMainBtn');
    if (backToMainBtn) backToMainBtn.addEventListener('click', goBack);

    var categoriesBtn = document.getElementById('categoriesBtn');
    if (categoriesBtn) {
        categoriesBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var dropdown = document.getElementById('categoriesDropdown');
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
            var dropdown = document.getElementById('categoriesDropdown');
            var btn = document.getElementById('categoriesBtn');
            if (dropdown) dropdown.classList.remove('active');
            if (btn) btn.classList.remove('active');
        }
    });

    // أحداث المودالات العامة لتجنب التكرار
    var purchaseModal = document.getElementById('purchaseModal');
    var closePurchaseBtn = document.getElementById('closeModal');
    if (closePurchaseBtn && purchaseModal) {
        closePurchaseBtn.addEventListener('click', function() { purchaseModal.classList.remove('active'); });
    }

    var codeModal = document.getElementById('codeModal');
    var closeCodeBtn = document.getElementById('closeCodeModal');
    if (closeCodeBtn && codeModal) {
        closeCodeBtn.addEventListener('click', function() { codeModal.classList.remove('active'); });
    }

    var copyCodeBtn = document.getElementById('copyCodeBtn');
    if (copyCodeBtn) {
        copyCodeBtn.addEventListener('click', function() {
            var codeText = document.getElementById('generatedCode').textContent;
            navigator.clipboard.writeText(codeText).then(function() {
                alert('📋 تم نسخ كود الشحن بنجاح!');
            });
        });
    }

    // صائد ضغطات الكروت والدخول للسلة
    document.getElementById('mainCategories').addEventListener('click', function(e) {
        var enterBtn = e.target.closest('.enter-btn[data-category]');
        if (enterBtn) {
            selectCategory(enterBtn.dataset.category);
            return;
        }
        
        var buyBtn = e.target.closest('.buy-btn[data-item]');
        if (buyBtn) {
            var item = JSON.parse(buyBtn.dataset.item);
            addToCart(item);
            return;
        }

        var categoryCard = e.target.closest('.category-card[data-category]');
        if (categoryCard && !e.target.closest('button')) {
            selectCategory(categoryCard.dataset.category);
        }
    });

    document.querySelectorAll('#filterTabs .filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#filterTabs .filter-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            var filter = btn.getAttribute('data-filter');
            var si = document.getElementById('searchInput');
            if (si) si.value = '';
            if (filter === 'all') {
                showAllCategories();
            } else if (rawServerData.categories[filter]) {
                selectCategory(filter);
            }
        });
    });

    var searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            var query = e.target.value.toLowerCase().trim();
            if (query === '') { goBack(); return; }

            var grid = document.getElementById('mainCategories');
            var backContainer = document.getElementById('back-container');
            if (!grid) return;
            grid.className = '';
            grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:25px;';
            grid.innerHTML = '';
            if (backContainer) backContainer.style.display = 'block';

            var found = false;
            Object.keys(rawServerData.categories).forEach(function(key) {
                var cat = rawServerData.categories[key];
                if (cat.title.toLowerCase().includes(query)) {
                    found = true;
                    var div = document.createElement('div');
                    div.className = 'category-card';
                    div.dataset.category = key;

                    var img = document.createElement('img');
                    img.src = cat.image;
                    img.alt = cat.title;
                    img.onerror = function() { this.src = 'image/logo.png'; };

                    var h3 = document.createElement('h3');
                    h3.textContent = cat.title;

                    var p = document.createElement('p');
                    p.textContent = cat.desc;

                    var btn = document.createElement('button');
                    btn.className = 'enter-btn';
                    btn.textContent = 'دخول القسم 📂';
                    btn.dataset.category = key;

                    div.appendChild(img); div.appendChild(h3);
                    div.appendChild(p); div.appendChild(btn);
                    grid.appendChild(div);
                }
            });

            if (!found) {
                grid.innerHTML = '<p style="color:#b9bbbe; grid-column:1/-1; text-align:center; padding:40px;">❌ لا توجد أقسام مطابقة لبحثك...</p>';
            }
        });
    }

    // فتح السلة عبر زر الهيدر
    var cartHeaderBtn = document.getElementById('cartHeaderBtn');
    if (cartHeaderBtn && purchaseModal) {
        cartHeaderBtn.addEventListener('click', function() {
            updateCartUI();
            purchaseModal.classList.add('active'); 
        });
    }

    // تغيير المحافظ ديناميكياً داخل المودال
    var paymentSelect = document.getElementById('paymentMethodSelect');
    var instructionsZone = document.getElementById('paymentInstructions');
    if (paymentSelect && instructionsZone) {
        paymentSelect.addEventListener('change', function(e) {
            var method = e.target.value;
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
    var submitOrderBtn = document.getElementById('submitOrderBtn');
    if (submitOrderBtn) {
        submitOrderBtn.addEventListener('click', async function() {
            var email = document.getElementById('user-email').value.trim();
            var paymentRef = document.getElementById('paymentRefInput').value.trim();
            var gateway = paymentSelect ? paymentSelect.value : 'jawwal_pay';

            if (!email) { alert('الرجاء إدخال إيميل مستلم الكود أولاً!'); return; }
            if (!paymentRef) { alert('الرجاء إدخال رقم العملية أو اسم المحوّل لتأكيد الدفع!'); return; }
            if (cart.length === 0) { alert('سلتك فارغة!'); return; }

            // تجهيز مصفوفة المنتجات لكي يستلمها السيرفر دفعة واحدة
            var orderData = {
                items: cart.map(item => ({ productId: item.id, qty: item.qty })),
                buyerEmail: email,
                paymentGateway: gateway,
                paymentRef: paymentRef
            };

            submitOrderBtn.disabled = true;
            submitOrderBtn.textContent = '⏳ جاري إرسال طلبك للـ الأدمن...';

            try {
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
});

// ======================================================
// 🛒 سيستم السلة المحلية المستقلة النظيفة
// ======================================================
function addToCart(product) {
    var existingItem = cart.find(item => item.id === product.id);
    
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
    var badge = document.getElementById('cartCountBadge');
    var totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    if (badge) badge.textContent = totalQty;

    // جلب منطقة السلة والمجموع
    var listZone = document.getElementById('cartItemsList'); 
    var totalZone = document.getElementById('cartTotalAmount');
    
    if (!listZone) return;
    
    // إذا كانت السلة فارغة
    if (cart.length === 0) {
        listZone.innerHTML = '<p style="color:#b9bbbe; text-align:center; padding:20px; font-size:0.9rem;">السلة فارغة حالياً 🛒</p>';
        if (totalZone) totalZone.textContent = '0.00$';
        return;
    }

    // تفريغ زون المنتجات قبل إعادة البناء لمنع التكرار
    listZone.innerHTML = '';
    var totalCost = 0;

    cart.forEach((item, index) => {
        totalCost += (item.price * item.qty);
        
        var row = document.createElement('div');
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
            var idx = parseInt(this.getAttribute('data-index'));
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

// ======================================================
// ⚡ تفعيل الأحداث عند تحميل الصفحة
// ======================================================
document.addEventListener('DOMContentLoaded', function() {
    var clearBtn = document.getElementById('clearCartBtn'); 
    if (clearBtn) {
        // ربط مباشر ونظيف لزر التفريغ لمنع التعارض
        clearBtn.onclick = window.clearCart;
    }
    
    // تشغيل تحديث السلة عند تحميل الصفحة لأول مرة
    updateCartUI();
});

// ======================================================\r
// 🚀 دالة إتمام الشراء المحدثة والمطابقة للسيرفر بالملي\r
// ======================================================\r
async function submitOrderToServer() {
    // 1. التحقق من وجود عناصر في السلة
    if (!cart || cart.length === 0) {
        alert('سلتك فارغة حالياً! قم بإضافة باقات أو بطاقات أولاً.');
        return;
    }

    // 2. طلب بيانات الزبون بشكل منبثق ومؤقت
    const customerName = prompt('الرجاء إدخال اسمك الكريم لإتمام الطلب:');
    if (!customerName) return;

    const customerEmail = prompt('الرجاء إدخال بريدك الإلكتروني لاستلام الفاتورة:');
    if (!customerEmail) {
        alert('البريد الإلكتروني مطلوب لإرسال الفاتورة الرقمية!');
        return;
    }

    // 3. حساب المجموع الإجمالي الفعلي بدقة
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0).toFixed(2);

    // 4. تجهيز كائن البيانات المنسق والمطابق لراوت السيرفر (/api/checkout)
    const orderData = {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        cartItems: cart.map(item => ({
            id: item.id,
            qty: item.qty || 1
        }))
    };

    try {
        // تغيير مظهر الزر أثناء المعالجة لمنع تكرار الضغط والتأمين للـ Session
        const btn = document.getElementById('checkoutSubmitBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'جاري معالجة طلبك وتأمينه...';
        }

        // إرسال الطلب إلى المسار الصحيح والمعدل بواسطة الـ Agent
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (result.success) {
            alert(`🎉 ${result.message}\nرقم طلبك في النظام هو: ${result.orderId || 'JOKR-OK'}`);
            
            // تفريغ السلة وتحديث الشاشة فوراً
            cart = [];
            if (typeof updateCartUI === 'function') updateCartUI();
            if (typeof saveCart === 'function') saveCart();
            
            // إغلاق الموديل الخاص بالسلة
            const purchaseModal = document.getElementById('purchaseModal');
            if (purchaseModal) purchaseModal.classList.remove('active');
        } else {
            alert(`⚠️ خطأ من السيرفر: ${result.error || result.message}`);
        }

    } catch (error) {
        console.error('Checkout Error:', error);
        alert('حدث خطأ أثناء الاتصال بالسيرفر، يرجى المحاولة مرة أخرى.');
    } finally {
        const btn = document.getElementById('checkoutSubmitBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerText = '🚀 إتمام الطلب واستلام الفاتورة';
        }
    }
}