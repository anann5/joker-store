// تشغيل المتجر عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', initStore);

async function initStore() {
    try {
        const response = await fetch('/api/cards');
        const data = await response.json();
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
        // المسار الجديد للصور في مجلد image
        icon.innerHTML = `
            <img src="image/${category}.png" onerror="this.src='image/logo.png'">
            <h3>${category.toUpperCase()}</h3>
        `;
        icon.onclick = () => showProducts(category, data);
        menu.appendChild(icon);
    });
}

// عرض بطاقات المنتج للقسم المختار
function showProducts(category, data) {
    document.getElementById('category-menu').style.display = 'none';
    const container = document.getElementById('products-container');
    container.style.display = 'block';
    
    const grid = document.getElementById('mainCategories');
    grid.innerHTML = `<h2>${category.toUpperCase()}</h2>`;
    
    data[category].forEach(item => {
        const card = document.createElement('div');
        card.className = 'product-card';
        // إضافة الصورة للبطاقة مع مسار صحيح
        card.innerHTML = `
            <img src="image/${category}.png" alt="${item.name}" onerror="this.src='image/logo.png'">
            <h3>${item.name}</h3>
            <p>السعر: ${item.price}$</p>
            <button>شراء الآن</button>
        `;
        grid.appendChild(card);
    });
}

// العودة للقائمة الرئيسية
function backToCategories() {
    document.getElementById('category-menu').style.display = 'flex';
    document.getElementById('products-container').style.display = 'none';
}