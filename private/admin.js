// ======================================================
//  منطق لوحة تحكم جوكر ستور (private - مقفل بالتوكين)
//  يعتمد على cookies (admin_token) + sessionStorage fallback
// ======================================================

function getAdminToken() {
    // Admin auth relies on the HttpOnly cookie set by the server.
    // The browser sends it automatically on requests, so the client does not need to read it.
    return null;
}

let isSoundEnabled = true;
let adminCsrfToken = null;

async function ensureAdminCsrfToken() {
    if (adminCsrfToken) return adminCsrfToken;

    try {
        const res = await fetch('/api/csrf-token', { credentials: 'include' });
        const data = await res.json();
        if (data.success && data.csrfToken) {
            adminCsrfToken = data.csrfToken;
            return adminCsrfToken;
        }
    } catch (_err) {
        // Ignore and rely on server rejection if token is missing
    }

    return null;
}

function buildJsonHeaders(extraHeaders = {}) {
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': adminCsrfToken || '',
        ...extraHeaders
    };
}

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

    // === إضافة منتج يدوي مع كودات ===
    const addManualBtn = document.getElementById('addManualBtn');
    if (addManualBtn) {
        addManualBtn.addEventListener('click', openAddManualModal);
    }

    const closeModalBtn = document.getElementById('closeAddManualModalBtn');
    const cancelBtn = document.getElementById('cancelAddManualBtn');
    const saveBtn = document.getElementById('saveAddManualBtn');

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeAddManualModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeAddManualModal);
    if (saveBtn) saveBtn.addEventListener('click', saveManualProduct);

    const textarea = document.getElementById('manualCodesTextarea');
    if (textarea) {
        textarea.addEventListener('input', function() {
            const lines = this.value.trim().split('\n').filter(l => l.trim());
            document.getElementById('codeCountValue').textContent = lines.length;
            document.getElementById('codeCountInfo').style.display = lines.length > 0 ? 'block' : 'none';
        });
    }

    const fileInput = document.getElementById('manualCodesFile');
    if (fileInput) {
        fileInput.addEventListener('change', loadManualCodes);
    }

    const modal = document.getElementById('addManualModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAddManualModal();
        });
    }
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
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
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

    } catch (_err) {
        tbody.innerHTML = `<tr><td colspan="6" class="error-cell">❌ فشل الاتصال بالسيرفر.</td></tr>`;
    }
}

// eslint-disable-next-line no-unused-vars
async function editProduct(productId) {
    // جلب بيانات المنتج من API
    try {
        const res = await fetch(`/api/admin/inventory/${productId}`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (!data.success && !data._id) {
            // API لا تدعم جلب واحد — جرّب التحميل المنتجات وابحث
            const allProducts = await fetch('/api/admin/inventory', {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
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

    } catch (_err) {
        alert('❌ فشل تحميل بيانات المنتج');
    }
}

// eslint-disable-next-line no-unused-vars
async function deleteProduct(productId, productName) {
    if (!confirm(`هل أنت متأكد من حذف المنتج: ${productName}؟`)) return;

    try {
        const csrfToken = await ensureAdminCsrfToken();
        const res = await fetch(`/api/admin/inventory/${productId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' })
        });
        const data = await res.json();
        if (data.success) {
            alert('🗑️ تم حذف المنتج بنجاح');
            loadInventory();
        } else {
            alert(`❌ ${  data.message || 'فشل الحذف'}`);
        }
    } catch (_err) {
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
    const price = parseFloat(document.getElementById('editPrice').value);
    const margin = parseFloat(document.getElementById('editMargin').value);

    try {
        const csrfToken = await ensureAdminCsrfToken();
        const res = await fetch(`/api/admin/inventory/${productId}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' }),
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
    } catch (_err) {
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
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
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

    } catch (_err) {
        tbody.innerHTML = `<tr><td colspan="5" class="error-cell">❌ فشل الاتصال بالسيرفر.</td></tr>`;
    }
}

// ======================================================
//  منطق إضافي — يدعمه المتحكم الرئيسي admin.js
// ======================================================

// هذه الدوال يتم استدعاؤها من admin.js الرئيسي إذا كان محملًا
// لكن بما أننا نستخدم private/admin.js، جميع الوظائف هنا
// eslint-disable-next-line no-unused-vars
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
        alertSound.play().catch(() => {
            // User interaction required for audio to play
        });
    }

    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 8000);
}

// ======================================================
//  إضافة منتج يدوي مع كودات (UI + API)
// ======================================================

function openAddManualModal() {
    const modal = document.getElementById('addManualModal');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('manualProductNameAr').value = '';
        document.getElementById('manualProductNameEn').value = '';
        document.getElementById('manualCategory').value = '';
        document.getElementById('manualPrice').value = '';
        document.getElementById('manualCodesTextarea').value = '';
        document.getElementById('manualCodesFile').value = '';
        document.getElementById('codeCountInfo').style.display = 'none';
        document.getElementById('codeCountValue').textContent = '0';
        document.getElementById('saveBtnText').classList.remove('hidden');
        document.getElementById('saveBtnLoading').classList.add('hidden');
        document.getElementById('saveAddManualBtn').disabled = false;
    }
}

function closeAddManualModal() {
    const modal = document.getElementById('addManualModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function parseCodesFromText(text) {
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

function parseCodesFromCSV(text) {
    const lines = text.trim().split('\n');
    const codes = [];
    for (const line of lines) {
        // eslint-disable-next-line prefer-destructuring
        const firstCell = line.split(',')[0]?.trim();
        const firstTab = line.split('\t')[0]?.trim();
        const code = firstCell || firstTab;
        if (code && code.toUpperCase() !== 'CODE') {
            codes.push(code);
        }
    }
    return codes;
}

async function loadManualCodes() {
    const fileInput = document.getElementById('manualCodesFile');
    const textarea = document.getElementById('manualCodesTextarea');
    const file = fileInput.files[0];

    let codes = [];

    if (file) {
        const text = await file.text();
        if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
            codes = parseCodesFromCSV(text);
        } else if (file.name.endsWith('.json')) {
            const json = JSON.parse(text);
            codes = Array.isArray(json) ? json : (json.codes || []);
        }
        textarea.value = codes.join('\n');
    } else {
        codes = parseCodesFromText(textarea.value);
    }

    document.getElementById('codeCountValue').textContent = codes.length;
    document.getElementById('codeCountInfo').style.display = codes.length > 0 ? 'block' : 'none';
    return codes;
}

async function saveManualProduct() {
    const productNameAr = document.getElementById('manualProductNameAr').value.trim();
    const productNameEn = document.getElementById('manualProductNameEn').value.trim();
    const category = document.getElementById('manualCategory').value.trim();
    const price = parseFloat(document.getElementById('manualPrice').value) || 0;
    const profitMargin = parseFloat(document.getElementById('manualProfitMargin').value) || 1.15;

    if (!productNameAr || !productNameEn || !category) {
        alert('❌ يرجى ملء جميع الحقول المطلوبة.');
        return;
    }

    const codes = await loadManualCodes();
    if (codes.length === 0) {
        alert('❌ لا يوجد كودات لإضافتها. يرجى إدخال كودات يدوي أو رفع ملف.');
        return;
    }

    document.getElementById('saveBtnText').classList.add('hidden');
    document.getElementById('saveBtnLoading').classList.remove('hidden');
    document.getElementById('saveAddManualBtn').disabled = true;

    try {
        const csrfToken = await ensureAdminCsrfToken();
        const res = await fetch('/api/admin/inventory/add-manual', {
            method: 'POST',
            credentials: 'include',
            headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' }),
            body: JSON.stringify({
                productName: { ar: productNameAr, en: productNameEn },
                category,
                price,
                profitMargin,
                manualCodes: codes
            })
        });

        const data = await res.json();

        if (data.success) {
            const btn = document.getElementById('saveAddManualBtn');
            btn.innerHTML = '<i class="fas fa-check"></i> تم الحفظ!';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-save"></i> حفظ المنتج';
                closeAddManualModal();
                loadInventory();
            }, 1200);
        } else {
            throw new Error(data.message || 'فشل إنشاء المنتج');
        }
    } catch (err) {
        document.getElementById('saveBtnText').classList.remove('hidden');
        document.getElementById('saveBtnLoading').classList.add('hidden');
        document.getElementById('saveAddManualBtn').disabled = false;
        alert(`❌ ${  err.message || 'حدث خطأ غير متوقع'}`);
    }
}
