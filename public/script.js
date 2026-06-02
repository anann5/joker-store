let storeData = {}; // متغير لحفظ البيانات حتى نتمكن من استخدامها في القائمة

// تشغيل المتجر عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', initStore);

async function initStore() {
    try {
        console.log("📡 جاري جلب الأقسام من ملف cards.json...");
        const response = await fetch('/cards.json'); // يقرأ ملف الكروت المحلي داخل public
        const data = await response.json();
        storeData = data; // حفظ البيانات هنا
        displayCategories(data);
    } catch (error) {
        console.error("❌ خطأ في جلب البيانات الأولية:", error);
    }
}

// عرض الأقسام كأيقونات في القائمة الرئيسية
function displayCategories(data) {
    const menu = document.getElementById('category-menu') || document.getElementById('mainCategories');
    if (!menu) {
        console.warn("⚠️ لم يتم العثور على حاوية الأقسام الرئيسية في الـ HTML.");
        return;
    }
    menu.innerHTML = '';

    Object.keys(data).forEach(category => {
        const icon = document.createElement('div');
        icon.className = 'category-icon';
        icon.innerHTML = `
            <img src="image/${category}.png" onerror="this.src='image/logo.png'">
            <h3>${category.toUpperCase()}</h3>
        `;
        // عند الضغط على الأيقونة يفتح المنتجات الخاصة بالقسم من السيرفر
        icon.onclick = () => showProducts(category);
        menu.appendChild(icon);
    });
}

/* ===================================================
   الدالة المعدلة: جلب وعرض المنتجات داخل الحاوية الصحيحة
   =================================================== */
function showProducts(category) {
    console.log(`🔄 جاري محاولة فتح قسم: ${category}`);
    if (typeof closeDropdown === 'function') closeDropdown();

    // تحديد مكان طباعة الكروت (بناءً على حاويتك المعتمدة)
    const grid = document.getElementById('mainCategories') || document.getElementById('innerProductsGrid');
    
    if (!grid) {
        console.error("❌ خطأ حرج: لم نجد حاوية mainCategories في ملف index.html لعرض الكروت بداخلها!");
        return;
    }

    // إظهار زر الرجوع وحاوية المنتجات الفرعية إذا كانت موجودة
    const productsContainer = document.getElementById('products-container');
    if (productsContainer) productsContainer.style.display = 'block';

    const backBtnContainer = document.getElementById('back-container');
    if (backBtnContainer) backBtnContainer.style.display = 'block';
    
    // تنظيف الحاوية وطباعة عنوان القسم الحالي قبل جلب الكروت
    grid.innerHTML = `<h2 style="color: #00f0ff; text-align: center; width: 100%; margin-bottom: 25px; grid-column: 1 / -1;">قسم: ${category.toUpperCase()}</h2>`;
    
    // جلب المنتجات الحقيقية من قاعدة البيانات عبر السيرفر
    console.log(`📡 جاري الاتصال بالسيرفر لقراءة كروت: /api/products/${category}`);
    fetch(`/api/products/${category}`)
        .then(response => {
            console.log(`📥 استجابة السيرفر للقسم ${category}:`, response.status);
            return response.json();
        })
        .then(products => {
            console.log("📦 المنتجات المستلمة من قاعدة البيانات:", products);
            
            if (!products || products.length === 0) {
                grid.innerHTML += `<p style="text-align:center; width:100%; color:#fff; grid-column: 1/-1; font-size: 18px; margin-top: 20px;">لا توجد منتجات حالياً في هذا القسم داخل قاعدة البيانات.</p>`;
                return;
            }

            // طباعة كروت المنتجات بالأسعار الجديدة شاملة الأرباح
            products.forEach(item => {
                const card = document.createElement('div');
                card.className = 'product-card';
                // تنسيق نيون سريع لضمان الرص الأنيق للكروت بالداخل
                card.style.background = '#161b22';
                card.style.border = '1px solid #00f0ff';
                card.style.boxShadow = '0 0 10px rgba(0, 240, 255, 0.1)';
                card.style.padding = '20px';
                card.style.borderRadius = '8px';
                card.style.textAlign = 'center';
                card.style.color = 'white';
                card.style.minWidth = '220px';

                card.innerHTML = `
                    <img src="image/${category}.png" alt="${item.name}" onerror="this.src='image/logo.png'" style="max-width: 90px; margin-bottom: 15px;">
                    <h3 style="font-size: 16px; margin: 10px 0;">${item.name}</h3>
                    <p style="color: #00ff66; font-weight: bold; font-size: 18px; margin-bottom: 15px;">السعر: ${item.price}$</p>
                    <button class="buy-now-btn" onclick="openCheckoutPopup('${item.id}', '${item.name}', ${item.price})" style="background: #00f0ff; color: #000; border: none; padding: 10px 20px; border-radius: 5px; font-weight: bold; cursor: pointer; width: 100%;">شراء الآن 🚀</button>
                `;
                grid.appendChild(card);
            });
        })
        .catch(error => {
            console.error('❌ حدث خطأ أثناء جلب الكروت من السيرفر:', error);
            grid.innerHTML += `<p style="text-align:center; width:100%; color:red; grid-column: 1/-1;">حدث خطأ غير متوقع أثناء تحميل المنتجات.</p>`;
        });
}

// دالة العودة للقائمة الرئيسية وإعادة بناء الأقسام
function backToCategories() {
    console.log("🔄 العودة إلى قائمة الأقسام الرئيسية...");
    const backBtn = document.getElementById('back-container');
    if (backBtn) backBtn.style.display = 'none';

    const allBtn = document.querySelector('[data-filter="all"]');
    if (allBtn) {
        allBtn.click(); // تصفير الفلتر العلوي
    } else {
        initStore(); // إعادة بناء الواجهة بالأقسام الأصلية
    }
}

// مراقبة شريط الفلترة العلوي لربطه ديناميكياً مع السيرفر
document.addEventListener('DOMContentLoaded', () => {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const backBtnContainer = document.getElementById('back-container');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const filterValue = btn.getAttribute('data-filter');
            console.log(`🔍 تم الضغط على زر الفلتر: ${filterValue}`);
            
            if (filterValue === 'all') {
                if (backBtnContainer) backBtnContainer.style.display = 'none';
                initStore(); // إعادة إظهار الأقسام بالكامل
            } else {
                if (backBtnContainer) backBtnContainer.style.display = 'block';
                showProducts(filterValue); // جلب منتجات الفلتر المختار فوراً
            }
        });
    });
});

/* ===================================================
   التحكم بالقوائم والـ Dropdowns للـ Header
   =================================================== */
function getRegionDetails() { return null; }

function selectCategory(category) {
    closeDropdown(); 
    showProducts(category);
}

function closeDropdown() {
    const dropdownMenu = document.getElementById('categoriesDropdown');
    if (dropdownMenu) { dropdownMenu.classList.remove('active'); }
}

// إغلاق القوائم عند النقر خارجها
document.addEventListener('click', function(event) {
    const dropdowns = document.querySelectorAll('.dropdown-menu');
    const buttons = document.querySelectorAll('.dropdown-btn');
    
    let isClickInsideButton = false;
    buttons.forEach(btn => { if (btn.contains(event.target)) isClickInsideButton = true; });

    let isClickInsideMenu = false;
    dropdowns.forEach(menu => { if(menu.contains(event.target)) isClickInsideMenu = true; });

    if (!isClickInsideButton && !isClickInsideMenu) {
        dropdowns.forEach(menu => { menu.classList.remove('active'); });
    }
});

// تفعيل زر الأقسام في الهيدر
document.addEventListener('DOMContentLoaded', () => {
    const categoriesBtn = document.getElementById('categoriesBtn');
    const categoriesDropdown = document.getElementById('categoriesDropdown');

    if (categoriesBtn && categoriesDropdown) {
        categoriesBtn.onclick = function(e) {
            e.preventDefault();
            categoriesDropdown.classList.toggle('active');
        };
    }
});

/* ===================================================
   نظام نافذة الشراء المحدث (Checkout Popup) - شامل اختيار الدولة تلقائياً
   =================================================== */
function openCheckoutPopup(id, name, price) {
    const existingPopup = document.getElementById('checkout-modal');
    if (existingPopup) existingPopup.remove();

    const modal = document.createElement('div');
    modal.id = 'checkout-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '10000';

    modal.innerHTML = `
        <div class="popup-content" style="
            background: #0d1117; 
            border: 2px solid #00f0ff; 
            box-shadow: 0 0 20px #00f0ff; 
            padding: 30px; 
            border-radius: 12px; 
            width: 90%; 
            max-width: 450px; 
            text-align: right; 
            direction: rtl; 
            color: #fff;
            position: relative;
        ">
            <span class="close-popup-btn" onclick="document.getElementById('checkout-modal').remove()" style="
                position: absolute; 
                top: 15px; 
                left: 15px; 
                font-size: 24px; 
                cursor: pointer; 
                color: #ff007f;
            ">&times;</span>
            
            <h3 style="color: #00f0ff; margin-bottom: 20px; border-bottom: 1px solid #1f2937; padding-bottom: 10px; font-size: 22px;">تأكيد طلب الشراء</h3>
            
            <p style="margin-bottom: 8px;"><strong>المنتج:</strong> <span style="color: #ff007f;">${name}</span></p>
            <p style="margin-bottom: 20px;"><strong>السعر النهائي:</strong> <span style="color: #00ff66; font-size: 18px; font-weight: bold;">${price}$</span></p>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #aaa;">اسم المشتري كاملاً:</label>
                <input type="text" id="customer-name" placeholder="أدخل اسمك هنا" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #1f2937; background: #161b22; color: #fff; outline: none; box-sizing: border-box;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #aaa;">البريد الإلكتروني (لتسليم الكود):</label>
                <input type="email" id="customer-email" placeholder="example@mail.com" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #1f2937; background: #161b22; color: #fff; text-align: left; direction: ltr; outline: none; box-sizing: border-box;">
            </div>

            <div style="margin-bottom: 25px;">
                <label style="display: block; margin-bottom: 5px; color: #aaa;">اختر الدولة:</label>
                <select id="customer-country" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #1f2937; background: #161b22; color: #fff; outline: none; box-sizing: border-box; cursor: pointer;">
                    <option value="فلسطين 🇵🇸" selected>فلسطين 🇵🇸</option>
                    <option value="الأردن 🇯🇴">الأردن 🇯🇴</option>
                    <option value="السعودية 🇸🇦">المملكة العربية السعودية 🇸🇦</option>
                    <option value="الإمارات 🇦🇪">الإمارات العربية المتحدة 🇦🇪</option>
                    <option value="مصر 🇪🇬">جمهورية مصر العربية 🇪🇬</option>
                    <option value="العراق 🇮🇶">العراق 🇮🇶</option>
                    <option value="الكويت 🇰🇼">الكويت 🇰🇼</option>
                    <option value="قطر 🇶🇦">قطر 🇶🇦</option>
                </select>
            </div>
            
            <button onclick="sendOrderToWhatsApp('${id}', '${name}', '${price}')" style="
                width: 100%; 
                padding: 12px; 
                background: #25d366; 
                color: #fff; 
                border: none; 
                border-radius: 6px; 
                font-size: 16px; 
                font-weight: bold; 
                cursor: pointer; 
                box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3);
                transition: 0.3s;
            ">
                تأكيد الدفع وإرسال عبر الواتساب 🚀
            </button>
        </div>
    `;

    document.body.appendChild(modal);
}

/* ===================================================
   دالة صياغة الرسالة المعدلة - لتصلك شاملة الدولة المختارة
   =================================================== */
function sendOrderToWhatsApp(productId, productName, productPrice) {
    const name = document.getElementById('customer-name').value.trim();
    const email = document.getElementById('customer-email').value.trim();
    const country = document.getElementById('customer-country').value; 

    if (!name || !email) {
        alert('الرجاء تعبئة الاسم والبريد الإلكتروني لإتمام الطلب!');
        return;
    }

    const messageText = `مرحباً جوكر ستور، أرغب في شراء بطاقة رقمية:\n\n` +
                        `📦 المنتج: ${productName}\n` +
                        `🆔 كود المنتج: ${productId}\n` +
                        `💰 السعر: ${productPrice}$\n` +
                        `📍 الدولة: ${country}\n` + 
                        `---------------------------\n` +
                        `👤 اسم العميل: ${name}\n` +
                        `📧 البريد الإلكتروني: ${email}\n\n` +
                        `يرجى تزويدي بطريقة تحويل الأموال وتفعيل الطلب.`;

    const encodedMessage = encodeURIComponent(messageText);
    const whatsappUrl = `https://wa.me/97259919789?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    
    const checkoutModal = document.getElementById('checkout-modal');
    if (checkoutModal) checkoutModal.remove();
}