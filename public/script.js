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

// ======================================================
//  دالة تحديد الريجن وجلب روابط الأعلام المحلية بالترتيب الجديد
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
//  عرض المنتجات داخل القسم مع التجميل الزجاجي للأعلام
// ======================================================
function selectCategory(categoryKey) {
    var cat = rawServerData.categories[categoryKey];
    if (!cat) return;

    var grid = document.getElementById('mainCategories');
    var backContainer = document.getElementById('back-container');

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
                var nameLower = item.name.toLowerCase();
                var idUpper = (item.id || '').toUpperCase();

                if (idUpper.includes('US') || nameLower.includes('us') || nameLower.includes('امريكي') || nameLower.includes('أمريكي')) detectedRegion = 'us';
                else if (idUpper.includes('TR') || nameLower.includes('tr') || nameLower.includes('تركي')) detectedRegion = 'tr';
                else if (idUpper.includes('SA') || nameLower.includes('sa') || nameLower.includes('سعودي')) detectedRegion = 'sa';
                else if (idUpper.includes('AE') || nameLower.includes('ae') || nameLower.includes('امارات') || nameLower.includes('إمارات')) detectedRegion = 'ae';
                else if (idUpper.includes('KW') || nameLower.includes('kw') || nameLower.includes('كويت') || nameLower.includes('كويتي')) detectedRegion = 'kw';
                else if (idUpper.includes('EU') || nameLower.includes('eu') || nameLower.includes('اوروب') || nameLower.includes('أوروب')) detectedRegion = 'eu';

                var regionInfo = getRegionDetails(detectedRegion);
                var clientItem = {
                    id: item.id,
                    name: item.name,
                    price: typeof item.price === 'number' ? item.price + '$' : item.price,
                    region: detectedRegion,
                    image: 'image/' + categoryKey + '.png'
                };

                var card = document.createElement('div');
                card.className = 'product-item-card card'; 
                card.dataset.region = detectedRegion;
                card.style.position = 'relative'; 

                // 🌟 تصميم كبسولة العلم الزجاجية الفخمة (مجمل الكرت 100%)
                var badge = document.createElement('div');
                badge.className = 'card-flag-badge ' + regionInfo.cls;
                badge.style.cssText = 'position: absolute; top: 12px; left: 12px; background: rgba(15, 18, 27, 0.65); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); padding: 5px 7px; border-radius: 8px; display: flex; align-items: center; justify-content: center; z-index: 10; border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 4px 10px rgba(0,0,0,0.4);';
                
                // حقن العلم كصورة أو كأيقونة الفونتوأسوم بدقة خارقة
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
                price.textContent = clientItem.price;

                var buyBtn = document.createElement('button');
                buyBtn.className = 'buy-btn';
                buyBtn.innerHTML = '<i class="fas fa-shopping-cart"></i> شراء واستلام الكود';
                buyBtn.dataset.item = JSON.stringify(clientItem);

                content.appendChild(title);
                content.appendChild(price);
                content.appendChild(buyBtn);

                card.appendChild(badge); // إضافة كبسولة العلم الفخمة المحدثة
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
//  فتح مودال الشراء
// ======================================================
function orderProduct(item) {
    currentSelectedProduct = item;
    document.getElementById('modalTitle').textContent = 'استلام كود الشحن لـ ' + item.name;
    document.getElementById('modalProductPrice').textContent = item.price;
    document.getElementById('purchaseModal').classList.add('active');
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

    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('purchaseModal').classList.remove('active');
    });
    document.getElementById('purchaseModal').addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('active');
    });

    document.getElementById('closeCodeModal').addEventListener('click', function() {
        document.getElementById('codeModal').classList.remove('active');
    });
    document.getElementById('codeModal').addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('active');
    });

    document.getElementById('copyCodeBtn').addEventListener('click', function() {
        var codeText = document.getElementById('generatedCode').textContent;
        navigator.clipboard.writeText(codeText).then(function() {
            alert('📋 تم نسخ كود الشحن بنجاح!');
        });
    });

    document.getElementById('mainCategories').addEventListener('click', function(e) {
        var enterBtn = e.target.closest('.enter-btn[data-category]');
        if (enterBtn) {
            selectCategory(enterBtn.dataset.category);
            return;
        }
        var buyBtn = e.target.closest('.buy-btn[data-item]');
        if (buyBtn) {
            var item = JSON.parse(buyBtn.dataset.item);
            orderProduct(item);
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

});