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
//  دالة تحديد الريجن
// ======================================================
function getRegionDetails(region) {
    var reg = String(region || 'global').toLowerCase();
    if (reg.includes('us')) return { cls: 'badge-us', flag: '🇺🇸', text: 'أمريكي US' };
    if (reg.includes('eu')) return { cls: 'badge-eu', flag: '🇪🇺', text: 'أوروبي EU' };
    if (reg.includes('tr')) return { cls: 'badge-tr', flag: '🇹🇷', text: 'تركي TR' };
    return { cls: 'badge-global', flag: '🌐', text: 'عالمي Global' };
}

// ======================================================
//  عرض الأقسام الرئيسية
// ======================================================
function showAllCategories() {
    var grid = document.getElementById('mainCategories');
    grid.className = '';
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:25px;';
    grid.innerHTML = '';

    // إخفاء زر الرجوع
    var backContainer = document.getElementById('back-container');
    if (backContainer) backContainer.style.display = 'none';

    // تفعيل زر "الكل"
    document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
    var allBtn = document.querySelector('.filter-btn[data-filter="all"]');
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
//  عرض المنتجات
// ======================================================
function selectCategory(categoryKey) {
    var cat = rawServerData.categories[categoryKey];
    if (!cat) return;

    var grid = document.getElementById('mainCategories');
    var backContainer = document.getElementById('back-container');

    if (backContainer) backContainer.style.display = 'block';

    document.querySelectorAll('.filter-btn').forEach(function(b) {
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
                if (item.id && (item.id.includes('US') || item.name.toLowerCase().includes('us'))) detectedRegion = 'us';
                else if (item.id && (item.id.includes('TR') || item.name.toLowerCase().includes('tr'))) detectedRegion = 'tr';
                else if (item.id && (item.id.includes('EU') || item.name.toLowerCase().includes('eu'))) detectedRegion = 'eu';

                var regionInfo = getRegionDetails(detectedRegion);
                var clientItem = {
                    id: item.id,
                    name: item.name,
                    price: typeof item.price === 'number' ? item.price + '$' : item.price,
                    region: detectedRegion,
                    image: 'image/' + categoryKey + '.png'
                };

                var card = document.createElement('div');
                card.className = 'product-item-card';

                var badge = document.createElement('div');
                badge.className = 'region-badge ' + regionInfo.cls;
                badge.innerHTML = '<span>' + regionInfo.flag + '</span><span>' + regionInfo.text + '</span>';

                var imgContainer = document.createElement('div');
                imgContainer.className = 'card-img-container';
                var img = document.createElement('img');
                img.src = clientItem.image;
                img.alt = clientItem.name;
                img.onerror = function() { this.src = 'image/logo.png'; };
                imgContainer.appendChild(img);

                var content = document.createElement('div');
                content.className = 'card-content';
                content.style.padding = '15px';

                var title = document.createElement('h3');
                title.textContent = clientItem.name;

                var price = document.createElement('p');
                price.className = 'price-tag';
                price.textContent = clientItem.price;

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

    // زر الرئيسية
    var homeLink = document.getElementById('homeLink');
    if (homeLink) homeLink.addEventListener('click', function(e) { e.preventDefault(); goBack(); });

    var digitalCardsLink = document.getElementById('digitalCardsLink');
    if (digitalCardsLink) digitalCardsLink.addEventListener('click', function(e) { e.preventDefault(); goBack(); });

    // زر الرجوع
    var backToMainBtn = document.getElementById('backToMainBtn');
    if (backToMainBtn) backToMainBtn.addEventListener('click', goBack);

    // أزرار الـ Dropdown
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

    // أزرار الأقسام في الـ Dropdown
    document.querySelectorAll('.dropdown-item[data-category]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            selectCategory(this.dataset.category);
            document.getElementById('categoriesDropdown').classList.remove('active');
            document.getElementById('categoriesBtn').classList.remove('active');
        });
    });

    // إغلاق الـ Dropdown عند النقر خارجه
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.dropdown-wrapper')) {
            var dropdown = document.getElementById('categoriesDropdown');
            var btn = document.getElementById('categoriesBtn');
            if (dropdown) dropdown.classList.remove('active');
            if (btn) btn.classList.remove('active');
        }
    });

    // إغلاق مودال الشراء
    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('purchaseModal').classList.remove('active');
    });
    document.getElementById('purchaseModal').addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('active');
    });

    // إغلاق مودال الكود
    document.getElementById('closeCodeModal').addEventListener('click', function() {
        document.getElementById('codeModal').classList.remove('active');
    });
    document.getElementById('codeModal').addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('active');
    });

    // نسخ الكود
    document.getElementById('copyCodeBtn').addEventListener('click', function() {
        var codeText = document.getElementById('generatedCode').textContent;
        navigator.clipboard.writeText(codeText).then(function() {
            alert('📋 تم نسخ كود الشحن بنجاح!');
        });
    });

    // أزرار الشراء (event delegation)
    document.getElementById('mainCategories').addEventListener('click', function(e) {
        // زر دخول القسم
        var enterBtn = e.target.closest('.enter-btn[data-category]');
        if (enterBtn) {
            selectCategory(enterBtn.dataset.category);
            return;
        }
        // زر الشراء
        var buyBtn = e.target.closest('.buy-btn[data-item]');
        if (buyBtn) {
            var item = JSON.parse(buyBtn.dataset.item);
            orderProduct(item);
            return;
        }
        // الضغط على كرت القسم كله
        var categoryCard = e.target.closest('.category-card[data-category]');
        if (categoryCard && !e.target.closest('button')) {
            selectCategory(categoryCard.dataset.category);
        }
    });

    // أزرار الفلتر
    document.querySelectorAll('.filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
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

    // البحث
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