// ======================================================
//  منطق لوحة تحكم جوكر ستور (private - مقفل بالتوكين)
//  يعتمد على cookies (admin_token)
// ======================================================

function getAdminToken() {
    const match = document.cookie.match(/(^|;) ?admin_token=([^;]*)(;|$)/);
    return match ? match[2] : null;
}

let isSoundEnabled = true;

document.addEventListener('DOMContentLoaded', () => {
    // 🔒 التحقق من التوكين — إذا غير موجود، العودة لصفحة الدخول
    const token = getAdminToken();
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // تعيين التاريخ اللّحظي
    const now = new Date();
    document.getElementById('currentDate').textContent = now.toLocaleString('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // إعداد تبديل الصوت
    const soundToggle = document.getElementById('soundToggle');
    const soundIcon = document.getElementById('soundIcon');
    if (soundToggle) {
        soundToggle.checked = isSoundEnabled;

        soundToggle.onchange = () => {
            isSoundEnabled = soundToggle.checked;
            updateSoundIcon();
        };
    }

    // إعداد أزرار التحكم
    const refreshBtn = document.getElementById('refreshBtn');
    const refreshOrdersBtn = document.getElementById('refreshOrdersBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const inventoryTabBtn = document.getElementById('inventoryTabBtn');
    const ordersTabBtn = document.getElementById('ordersTabBtn');

    if (refreshBtn) refreshBtn.addEventListener('click', loadInventory);
    if (refreshOrdersBtn) refreshOrdersBtn.addEventListener('click', loadRecentOrders);
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            document.cookie = 'admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
            window.location.href = '/login.html';
        };
    }

    if (inventoryTabBtn) {
        inventoryTabBtn.onclick = () => switchTab('inventory');
    }
    if (ordersTabBtn) {
        ordersTabBtn.onclick = () => switchTab('orders');
    }

    // تحميل البيانات الأولية
    loadInventory();

    // التحديث التلقائي كل 30 ثانية
    setInterval(loadInventory, 30000);
});

// ======================================================
//  دوال التوحيد
// ======================================================

function updateSoundIcon() {
    const icon = document.getElementById('soundIcon');
    if (!icon) return;
    icon.className = isSoundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
}

function switchTab(target) {
    const inventorySection = document.getElementById('inventorySection');
    const ordersSection = document.getElementById('ordersSection');
    const inventoryTabBtn = document.getElementById('inventoryTabBtn');
    const ordersTabBtn = document.getElementById('ordersTabBtn');

    if (target === 'inventory') {
        inventorySection.classList.remove('hidden');
        ordersSection.classList.add('hidden');
        inventoryTabBtn.classList.add('active');
        ordersTabBtn.classList.remove('active');
        loadInventory();
    } else {
        inventorySection.classList.add('hidden');
        ordersSection.classList.remove('hidden');
        inventoryTabBtn.classList.remove('active');
        ordersTabBtn.classList.add('active');
        loadRecentOrders();
    }
}

function openModal(modal) {
    if (!modal) return;
    modal.classList.add('active');
    modal.classList.remove('hidden');
}

function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    modal.classList.add('hidden');
}

// ======================================================
//  إدارة المخزون
// ======================================================

async function loadInventory() {
    const tbody = document.getElementById('inventoryList');
    if (!tbody) return;

    // إظهار المؤشّر أثناء التحميل
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell"><span class="spinner"></span> جاري تحميل المنتجات...</td></tr>`;

    try {
        const res = await fetch('/api/admin/inventory', {
            headers: { 'Authorization': `Bearer ${getAdminToken()}` }
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            tbody.innerHTML = `<tr><td colspan="6" class="error-cell">❌ فشل تحميل المنتجات: ${data.message || 'خطأ غير معروف'}</td></tr>`;
            return;
        }

        const products = Array.isArray(data) ? data : (data.products || []);
        tbody.innerHTML = '';

        if (products.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">لا توجد منتجات متاحة حالياً.</td></tr>`;
            return;
        }

        tbody.innerHTML = products.map(item => {
            const nameAr = item.productName?.ar || item.productName || '';
            const nameEn = item.productName?.en || '';
            const availableCodes = item.codes ? item.codes.filter(c => c.status === 'available').length : 0;
            const totalCodes = item.codes ? item.codes.length : item.totalCodes || 0;
            const stockClass = item.isExternal ? 'stock-external' : (availableCodes > 0 ? 'stock-available' : 'stock-empty');
            const stockText = item.isExternal ? '🔄 API' : `${availableCodes} / ${totalCodes}`;
            const stockBadgeClass = item.isExternal ? 'badge-accent' : (availableCodes > 0 ? 'badge-success' : 'badge-danger');
            const priceClass = item.price ? 'price-cell' : 'price-normal';

            return `
                <tr>
                    <td class="product-name-cell">${nameAr}
                        ${nameEn ? `<div class="product-name-secondary">${nameEn}</div>` : ''}
                    </td>
                    <td><span class="badge badge-accent">${item.category || '—'}</span></td>
                    <td>🌍 ${item.region || 'global'}</td>
                    <td class="${priceClass}">$${item.price ? item.price.toFixed(2) : '0.00'}</td>
                    <td><span class="badge ${stockBadgeClass}">${stockText}</span></td>
                    <td>
                        <div class="action-btns-group">
                            <button class="action-icon btn-edit" onclick="editProduct('${item._id}')" title="تعديل"><i class="fas fa-edit"></i></button>
                            <button class="action-icon btn-delete" onclick="deleteProduct('${item._id}', '${nameAr}')" title="حذف"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('خطأ في تحميل المخزون:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="error-cell">❌ فشل الاتصال بالسيرفر.</td></tr>`;
    }
}

async function editProduct(productId) {
    // جلب بيانات المنتج من API
    try {
        const res = await fetch(`/api/admin/inventory/${productId}`, {
            headers: { 'Authorization': `Bearer ${getAdminToken()}` }
        });
        const data = await res.json();

        if (!data.success && !data._id) {
            // API لا تدعم جلب واحد — جرّب التحميل المنتجات وابحث
            const allProducts = await fetch('/api/admin/inventory', {
                headers: { 'Authorization': `Bearer ${getAdminToken()}` }
            }).then(r => r.json());
            const product = allProducts.find(p => p._id === productId);
            if (!product) return alert('❌ لم يتم العثور على المنتج');

            document.getElementById('editId').value = productId;
            document.getElementById('editName').value = product.productName?.en || product.productName;
            document.getElementById('editPrice').value = product.price || '';
            document.getElementById('editMargin').value = product.profitMargin || 1.15;
            openModal(document.getElementById('editModal'));
            return;
        }

        const product = data;
        document.getElementById('editId').value = productId;
        document.getElementById('editName').value = product.productName?.en || product.productName;
        document.getElementById('editPrice').value = product.price || '';
        document.getElementById('editMargin').value = product.profitMargin || 1.15;
        openModal(document.getElementById('editModal'));

    } catch (err) {
        console.error('خطأ في تحميل المنتج:', err);
        alert('❌ فشل تحميل بيانات المنتج');
    }
}

async function deleteProduct(productId, productName) {
    if (!confirm(`هل أنت متأكد من حذف المنتج: ${productName}؟`)) return;

    try {
        const res = await fetch(`/api/admin/inventory/${productId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAdminToken()}` }
        });
        const data = await res.json();
        if (data.success) {
            alert('🗑️ تم حذف المنتج بنجاح');
            loadInventory();
        } else {
            alert(`❌ ${  data.message || 'فشل الحذف'}`);
        }
    } catch (err) {
        alert('❌ فشل الاتصال بالسيرفر');
    }
}

// ======================================================
//  حفظ التعديل
// ======================================================

document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('saveEditBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    const closeBtn = document.getElementById('closeModalBtn');

    if (saveBtn) {
        saveBtn.onclick = saveProductEdit;
    }
    if (cancelBtn) {
        cancelBtn.onclick = () => closeModal(document.getElementById('editModal'));
    }
    if (closeBtn) {
        closeBtn.onclick = () => closeModal(document.getElementById('editModal'));
    }
});

async function saveProductEdit() {
    const productId = document.getElementById('editId').value;
    const productNameEn = document.getElementById('editName').value;
    const price = parseFloat(document.getElementById('editPrice').value);
    const margin = parseFloat(document.getElementById('editMargin').value);

    try {
        const res = await fetch(`/api/admin/inventory/${productId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAdminToken()}`
            },
            body: JSON.stringify({
                price: price,
                profitMargin: margin
            })
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ تم تحديث المنتج بنجاح');
            closeModal(document.getElementById('editModal'));
            loadInventory();
        } else {
            alert(`❌ ${  data.message || 'فشل التحديث'}`);
        }
    } catch (err) {
        alert('❌ فشل الاتصال بالسيرفر');
    }
}

// ======================================================
//  إدارة الطلبات
// ======================================================

async function loadRecentOrders() {
    const tbody = document.getElementById('ordersList');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" class="loading-cell"><span class="spinner"></span> جاري جلب الفواتير...</td></tr>`;

    try {
        const res = await fetch('/api/admin/orders', {
            headers: { 'Authorization': `Bearer ${getAdminToken()}` }
        });
        const data = await res.json();

        if (!data.success) {
            tbody.innerHTML = `<tr><td colspan="5" class="error-cell">❌ فشل تحميل الطلبات.</td></tr>`;
            return;
        }

        const orders = data.orders || [];
        if (orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">لا توجد طلبات حالياً.</td></tr>`;
            return;
        }

        tbody.innerHTML = orders.map(order => {
            const customerName = order.customerName || order.buyerEmail?.split('@')[0] || 'زبون';
            const email = order.buyerEmail || order.email || '—';
            const items = order.items ? order.items.map(i => `${i.name || i.id} (${i.quantity || 1})`).join('، ') : (order.productName || '—');
            const total = order.totalAmount || order.price || 0;
            const status = order.status || 'pending';
            const statusBadge = status === 'completed' ? 'badge-success' : (status === 'pending' ? 'badge-warning' : 'badge-danger');
            const statusText = status === 'completed' ? 'مكتمل' : (status === 'pending' ? 'معلّق' : 'رفض');

            return `
                <tr>
                    <td class="customer-name-cell">${customerName}</td>
                    <td class="customer-email-cell">${email}</td>
                    <td>${items}</td>
                    <td class="price-cell">$${total.toFixed(2)}</td>
                    <td><span class="badge ${statusBadge}">${statusText}</span></td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('خطأ في تحميل الطلبات:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="error-cell">❌ فشل الاتصال بالسيرفر.</td></tr>`;
    }
}

// ======================================================
//  منطق إضافي — يدعمه المتحكم الرئيسي admin.js
// ======================================================

// هذه الدوال يتم استدعاؤها من admin.js الرئيسي إذا كان محملًا
// لكن بما أننا نستخدم private/admin.js، جميع الوظائف هنا

function showOrderNotification(order) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'neon-toast';
    toast.innerHTML = `
        <div class="toast-header">
            <span><i class="fas fa-shopping-bag"></i> طلب جديد وصل!</span>
        </div>
        <div class="toast-order-id">الطلب: <span class="toast-highlight">#${order.orderId || order._id || 'N/A'}</span></div>
        <div class="toast-customer">المشتري: ${order.buyerEmail || order.email || '—'}</div>
        <div class="toast-value">🎯 القيمة: $${order.price || order.totalAmount || 0}</div>
    `;

    container.appendChild(toast);

    if (isSoundEnabled) {
        const alertSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        alertSound.volume = 0.5;
        alertSound.play().catch(e => console.log("الصوت يتطلب تفاعل المستخدم أولاً"));
    }

    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 8000);
}
