let storeData = {}; // متغير لحفظ البيانات حتى نتمكن من استخدامها في القائمة

// تشغيل المتجر عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', initStore);

async function initStore() {
    try {
        const response = await fetch('/api/cards');
        const data = await response.json();
        storeData = data; // حفظ البيانات هنا
        displayCategories(data);
    } catch (error) {
        console.error("خطأ في جلب البيانات:", error);
    }
}

// عرض الأقسام كأيقونات
function displayCategories(data) {
    const menu = document.getElementById('category-menu');
    if (!menu) return;
    menu.innerHTML = '';

    Object.keys(data).forEach(category => {
        const icon = document.createElement('div');
        icon.className = 'category-icon';
        icon.innerHTML = `
            <img src="image/${category}.png" onerror="this.src='image/logo.png'">
            <h3>${category.toUpperCase()}</h3>
        `;
        icon.onclick = () => showProducts(category, data);
        menu.appendChild(icon);
    });
}

// دالة العودة للقائمة الرئيسية (عند الضغط على زر الرجوع أو زر "الكل")
function backToCategories() {
    // 1. إخفاء زر الرجوع
    const backBtn = document.getElementById('back-container');
    if (backBtn) backBtn.style.display = 'none';

    // 2. محاكاة الضغط على زر "الكل" لإعادة إظهار كل الأقسام الأصلية للموقع
    const allBtn = document.querySelector('[data-filter="all"]');
    if (allBtn) {
        allBtn.click();
    }
}

// كود ذكي يراقب شريط الفلترة لكي يظهر زر الرجوع فوراً عند الضغط على أي قسم عدا "الكل"
document.addEventListener('DOMContentLoaded', () => {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const backBtnContainer = document.getElementById('back-container');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const filterValue = btn.getAttribute('data-filter');
            
            if (backBtnContainer) {
                if (filterValue === 'all') {
                    // إذا ضغط على "الكل" نخفي زر الرجوع
                    backBtnContainer.style.display = 'none';
                } else {
                    // إذا ضغط على أي قسم آخر (ببجي، ستيم...) نظهر زر الرجوع فوراً فوق المنتجات!
                    backBtnContainer.style.display = 'block';
                }
            }
        });
    });
});

/* ===================================================
   حل مشكلة الـ Dropdown والخطأ البرمجي المكتشف
   =================================================== */

// الدالة المفقودة التي كانت تسبب انهيار الكود الأحمر في المتصفح
function getRegionDetails() {
    // نتركها فارغة لتفادي الخطأ بسلام
    return null;
}

// الدالة التي يناديها الـ HTML عند اختيار قسم من القائمة
function selectCategory(category) {
    closeDropdown(); // إغلاق القائمة أولاً
    if (storeData && Object.keys(storeData).length > 0) {
        showProducts(category, storeData);
    }
}

// دالة إغلاق القائمة
function closeDropdown() {
    const dropdownMenu = document.getElementById('categoriesDropdown');
    if (dropdownMenu) {
        dropdownMenu.classList.remove('active');
    }
}

// إغلاق القائمة عند الضغط في أي مكان خارجها
document.addEventListener('click', function(event) {
    const dropdowns = document.querySelectorAll('.dropdown-menu');
    const buttons = document.querySelectorAll('.dropdown-btn');
    
    let isClickInsideButton = false;
    buttons.forEach(btn => {
        if (btn.contains(event.target)) isClickInsideButton = true;
    });

    let isClickInsideMenu = false;
    dropdowns.forEach(menu => {
        if(menu.contains(event.target)) isClickInsideMenu = true;
    });

    if (!isClickInsideButton && !isClickInsideMenu) {
        dropdowns.forEach(menu => {
            menu.classList.remove('active');
        });
    }
});

// تفعيل زر "الأقسام" لفتح وإغلاق القائمة بشكل سليم
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