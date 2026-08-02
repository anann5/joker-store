// ======================================================
//  منطق لوحة تحكم الجوكر
// ======================================================

let allLogs = []; // مخزن مؤقت للسجلات للسماح بالتصفية السريعة بدون إعادة تحميل
let allOrders = []; // مخزن مؤقت للطلبات للسماح بالتصفية
let allProducts = []; // مخزن مؤقت للمنتجات لمتابعة توفر المخزون
let lastOrderId = null; // لمراقبة الطلبات الجديدة
let isSoundEnabled = localStorage.getItem('admin_sound_enabled') !== 'false';

document.addEventListener('DOMContentLoaded', () => {
    // التحقق من وجود توكن، وإلا العودة لصفحة الدخول
    const token = sessionStorage.getItem('admin_token');
    if (!token && !window.location.pathname.includes('login.html')) {
        window.location.href = 'login.html';
        return;
    }

    fetchDashboardData();
    
    // 🛡️ المراقبة التلقائية: تحديث البيانات كل 30 ثانية للتحقق من وجود طلبات جديدة
    setInterval(fetchDashboardData, 30000);

    // منطق تبديل الصوت
    const soundToggle = document.getElementById('soundToggle');
    const soundIcon = document.getElementById('soundIcon');
    if (soundToggle) {
        soundToggle.checked = isSoundEnabled;
        updateSoundIcon(isSoundEnabled);
        
        soundToggle.onchange = (e) => {
            isSoundEnabled = e.target.checked;
            localStorage.setItem('admin_sound_enabled', isSoundEnabled);
            updateSoundIcon(isSoundEnabled);
        };
    }

    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', syncExternalProducts);
    }

    // التبديل لعرض السجلات
    const viewLogsBtn = document.getElementById('viewLogsBtn');
    if (viewLogsBtn) {
        viewLogsBtn.onclick = () => toggleAdminView('logs');
    }

    // منطق تسجيل الخروج
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            sessionStorage.removeItem('admin_token');
            window.location.href = 'login.html';
        };
    }

    // مراقبة تغيير الفلتر في السجلات
    const logFilter = document.getElementById('logFilter');
    if (logFilter) {
        logFilter.onchange = (e) => renderLogs(e.target.value);
    }

    // مراقبة تغيير الفلتر في الطلبات
    const orderFilter = document.getElementById('orderFilter');
    if (orderFilter) {
        orderFilter.onchange = (e) => filterAndRenderOrders(e.target.value);
    }

    // زر تصدير السجلات
    const exportBtn = document.getElementById('exportLogsBtn');
    if (exportBtn) {
        exportBtn.onclick = exportLogsToCSV;
    }

    // زر حذف جميع السجلات
    const deleteAllBtn = document.getElementById('deleteAllLogsBtn');
    if (deleteAllBtn) {
        deleteAllBtn.onclick = deleteAllLogs;
    }

    // منطق مودال إضافة/تعديل منتج
    const addModal = document.getElementById('addProductModal');
    const openBtn = document.getElementById('openAddProductModal');
    const closeBtn = document.getElementById('closeAddProductModal');
    const addForm = document.getElementById('addProductForm');

    // تبديل إعدادات المزوّد والاشتراكات
    const isExternalCheckbox = document.getElementById('pIsExternal');
    const externalSettings = document.getElementById('externalSettings');
    const isSubscriptionCheckbox = document.getElementById('pIsSubscription');
    const subscriptionSettings = document.getElementById('subscriptionSettings');

    if (isExternalCheckbox) {
        isExternalCheckbox.onchange = () => {
            externalSettings.style.display = isExternalCheckbox.checked ? 'block' : 'none';
        };
    }
    if (isSubscriptionCheckbox) {
        isSubscriptionCheckbox.onchange = () => {
            subscriptionSettings.style.display = isSubscriptionCheckbox.checked ? 'block' : 'none';
        };
    }

    if (openBtn) {
        openBtn.onclick = (e) => {
            e.preventDefault();
            addModal.classList.add('active');
            addModal.style.display = 'flex';
            document.getElementById('addProductModalTitle').innerHTML = '<i class="fas fa-plus"></i> إضافة منتج جديد';
            addForm.reset();
            document.getElementById('productId').value = '';
            isExternalCheckbox.checked = false;
            externalSettings.style.display = 'none';
            isSubscriptionCheckbox.checked = false;
            subscriptionSettings.style.display = 'none';
        };
    }
    if (closeBtn) {
        closeBtn.onclick = () => {
            addModal.classList.remove('active');
            addModal.style.display = 'none';
        };
    }

    if (addForm) {
        addForm.onsubmit = async (e) => {
            e.preventDefault();
            
            const isExternal = isExternalCheckbox.checked;
            const isSubscription = isSubscriptionCheckbox.checked;
            const productId = document.getElementById('productId').value;

            const productData = {
                productName: {
                    ar: document.getElementById('pNameAr').value,
                    en: document.getElementById('pNameEn').value
                },
                category: document.getElementById('pCategory').value,
                region: document.getElementById('pRegion').value,
                price: parseFloat(document.getElementById('pPrice').value) || 0,
                description: {
                    ar: document.getElementById('pDescAr').value || 'لا يوجد وصف متاح حالياً لهذا المنتج.',
                    en: document.getElementById('pDescEn').value || 'No description is available for this product at the moment.'
                },
                image: document.getElementById('pImage').value || '',
                profitMargin: parseFloat(document.getElementById('pMargin').value) || 1.10,
                isExternal: isExternal,
                provider: document.getElementById('pProvider').value,
                isSubscription: isSubscription,
                subscriptionDuration: isSubscription ? document.getElementById('pSubscriptionDuration')?.value : null,
                subscriptionType: isSubscription ? document.getElementById('pSubscriptionType')?.value : 'fixed'
            };

            if (isExternal) {
                productData.externalId = document.getElementById('pExternalId').value;
                productData.basePrice = parseFloat(document.getElementById('pBasePrice').value) || 0;
            }

            const url = productId 
                ? `/api/admin/inventory/${productId}`
                : '/api/admin/inventory/create';
            const method = productId ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
                },
                body: JSON.stringify(productData)
            });
            const result = await res.json();
            if (result.success) {
                alert(productId ? '✅ تم تحديث المنتج بنجاح!' : '✅ تم إضافة المنتج بنجاح!');
                addModal.classList.remove('active');
                addModal.style.display = 'none';
                addForm.reset();
                isExternalCheckbox.checked = false;
                externalSettings.style.display = 'none';
                isSubscriptionCheckbox.checked = false;
                subscriptionSettings.style.display = 'none';
                fetchProducts();
            } else {
                alert('❌ ' + result.message);
            }
        };
    }

    // جلب المنتجات عند تحميل الصفحة
    fetchProducts();
});

// ======================================================
//  إدارة المنتجات
// ======================================================
async function fetchProducts() {
    try {
        const res = await fetch('/api/admin/inventory', {
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` }
        });
        const products = await res.json();
        allProducts = products;
        renderProducts(products);
    } catch (err) {
        console.error('فشل جلب المنتجات:', err);
    }
}

function renderProducts(products) {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    tbody.innerHTML = products.map(product => {
        const nameAr = product.productName?.ar || '';
        const nameEn = product.productName?.en || '';
        const availableCodes = product.codes ? product.codes.filter(c => c.status === 'available').length : 0;
        const stockColor = product.isExternal ? '#9b59b6' : (availableCodes > 0 ? '#2ecc71' : '#e74c3c');
        const stockText = product.isExternal ? '🔄 API' : (availableCodes > 0 ? `${availableCodes} متاح` : '🚫 نفد');
        const productType = product.isSubscription ? 'اشتراك' : (product.isExternal ? 'خارجي' : 'محلي');
        const typeColor = product.isSubscription ? '#ff9f43' : (product.isExternal ? '#9b59b6' : '#2ecc71');

        return `
            <tr>
                <td>
                    <div style="font-weight: 600;">${nameAr}</div>
                    <div style="color: var(--text-muted); font-size: 0.8rem;">${nameEn}</div>
                </td>
                <td>${product.category}</td>
                <td>${product.region}</td>
                <td>${product.price.toFixed(2)}$</td>
                <td><span style="color: ${typeColor}; font-weight: bold;">${productType}</span></td>
                <td>${product.currentProvider || 'Local'}</td>
                <td>
                    <span style="color: ${stockColor}; font-size: 0.85rem;">${stockText}</span>
                    <br>
                    <span style="color: var(--text-muted); font-size: 0.75rem;">
                        هامش: ×${product.profitMargin}
                    </span>
                </td>
                <td>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                        <button onclick="editProduct('${product._id}')" style="padding: 4px 8px; font-size: 0.7rem;" class="btn-action" title="تعديل"><i class="fas fa-edit"></i></button>
                        <button onclick="duplicateProduct('${product._id}')" style="padding: 4px 8px; font-size: 0.7rem;" class="btn-action" title="تكرار"><i class="fas fa-copy"></i></button>
                        <button onclick="deleteProduct('${product._id}', '${nameAr}')" style="padding: 4px 8px; font-size: 0.7rem;" class="btn-action btn-reject" title="حذف"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function editProduct(productId) {
    const product = allProducts.find(p => p._id === productId);
    if (!product) return;

    // Fill the form with product data
    document.getElementById('productId').value = productId;
    document.getElementById('pNameAr').value = product.productName?.ar || '';
    document.getElementById('pNameEn').value = product.productName?.en || '';
    document.getElementById('pCategory').value = product.category || '';
    document.getElementById('pRegion').value = product.region || 'global';
    document.getElementById('pPrice').value = product.price || '';
    document.getElementById('pMargin').value = product.profitMargin || 1.10;
    document.getElementById('pImage').value = product.image || '';
    document.getElementById('pDescAr').value = product.description?.ar || '';
    document.getElementById('pDescEn').value = product.description?.en || '';
    document.getElementById('pProvider').value = product.currentProvider || 'Local';

    document.getElementById('pIsExternal').checked = product.isExternal || false;
    document.getElementById('externalSettings').style.display = product.isExternal ? 'block' : 'none';
    document.getElementById('pExternalId').value = product.externalId || '';
    document.getElementById('pBasePrice').value = product.basePrice || '';

    if (product.isSubscription) {
        document.getElementById('pIsSubscription').checked = true;
        document.getElementById('subscriptionSettings').style.display = 'block';
    }

    document.getElementById('addProductModalTitle').innerHTML = '<i class="fas fa-edit"></i> تعديل المنتج';
    document.getElementById('addProductModal').style.display = 'flex';
    document.getElementById('addProductModal').classList.add('active');
}

async function duplicateProduct(productId) {
    const newName = prompt('أدخل اسم المنتج الجديد (اتركه فارغاً للنسخ كما هو):');
    if (newName !== null) {
        try {
            const res = await fetch(`/api/admin/inventory/${productId}/duplicate`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
                },
                body: JSON.stringify({ 
                    newName: { ar: newName || undefined, en: newName || undefined } 
                })
            });
            const data = await res.json();
            alert(data.message);
            if (data.success) fetchProducts();
        } catch (err) {
            alert('❌ فشل تكرار المنتج');
        }
    }
}

async function deleteProduct(productId, productName) {
    const action = confirm(`هل أنت متأكد من حذف المنتج: ${productName}؟\n\nسيتم إلغاء تفعيله. لإلغاء حذفه نهائياً استخدم "حذف دائم" في الإعدادات المتقدمة.`);
    if (!action) return;

    try {
        const res = await fetch(`/api/admin/inventory/${productId}`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
            }
        });
        const data = await res.json();
        alert(data.message);
        if (data.success) fetchProducts();
    } catch (err) {
        alert('❌ فشل حذف المنتج');
    }
}

async function fetchDashboardData() {
    try {
        const response = await fetch('/api/admin/dashboard', {
            headers: { 
                'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` 
            }
        });
        const data = await response.json();
        
        // جلب المخزون الحالي لمطابقة توفر البطاقات في جدول الطلبات
        const invRes = await fetch('/api/admin/inventory', {
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` }
        });
        allProducts = await invRes.json();

        if (data.success) {
            // 🔥 منطق التنبيه عند وصول طلب جديد
            if (data.orders.length > 0) {
                const latestOrder = data.orders[0];
                if (lastOrderId && latestOrder.orderId !== lastOrderId) {
                    showOrderNotification(latestOrder);
                }
                lastOrderId = latestOrder.orderId;
            } else {
                lastOrderId = "no_orders";
            }

            allOrders = data.orders; // حفظ الطلبات محلياً
            renderStats(data.stats);
            const currentOrderFilter = document.getElementById('orderFilter')?.value || 'all';
            filterAndRenderOrders(currentOrderFilter);
        }
    } catch (err) {
        console.error('فشل جلب بيانات الأدمن:', err);
    }
}

function updateSoundIcon(enabled) {
    const icon = document.getElementById('soundIcon');
    if (!icon) return;
    icon.className = enabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
    icon.style.color = enabled ? 'var(--primary-neon)' : 'var(--text-muted)';
}

// دالة لإظهار التنبيه النيوني مع صوت
function showOrderNotification(order) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'neon-toast';
    toast.innerHTML = `
        <div class="toast-header">
            <span><i class="fas fa-shopping-bag"></i> طلب جديد وصل!</span>
            <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:var(--text-muted); cursor:pointer;">&times;</button>
        </div>
        <div style="font-size: 0.9rem;">الطلب: <span style="color:var(--accent-orange)">#${order.orderId}</span></div>
        <div style="font-size: 0.8rem; color:var(--text-muted)">المشتري: ${order.buyerEmail}</div>
        <div style="font-size: 0.9rem; font-weight:bold; color:var(--primary-neon)">القيمة: ${order.price.toFixed(2)}$</div>
    `;

    container.appendChild(toast);

    // 🔊 تشغيل صوت تنبيه مميز (Digital Notification)
    if (isSoundEnabled) {
        const alertSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        alertSound.volume = 0.5;
        alertSound.play().catch(e => console.log("الصوت يتطلب تفاعل المستخدم أولاً"));
    }

    // إخفاء التنبيه تلقائياً بعد 8 ثوانٍ
    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 8000);
}

function renderStats(stats) {
    document.getElementById('pendingCount').textContent = stats.pendingOrders;
    document.getElementById('totalSales').textContent = stats.revenue.toFixed(2) + '$';
    document.getElementById('totalProfit').textContent = stats.totalProfit.toFixed(2) + '$';
    document.getElementById('stockCount').textContent = stats.availableCodes;

    if (stats.providerBalances) {
        document.getElementById('providerStatus').innerHTML = stats.providerBalances.map(p => `<div>${p.name}: ${p.balance || p.status}</div>`).join('');
    }
}

function filterAndRenderOrders(filter) {
    let filtered = allOrders;
    
    if (filter === 'low_profit') {
        filtered = allOrders.filter(order => {
            const sellingPrice = order.price || 0;
            const costPrice = order.costPrice || 0;
            const profitMargin = sellingPrice > 0 ? (sellingPrice - costPrice) / sellingPrice : 0;
            // نعرض الطلبات المكتملة فقط التي ربحها أقل من 5%
            return order.status === 'completed' && profitMargin < 0.05;
        });
    }
    
    renderOrders(filtered);
}

function renderOrders(orders) {
    const tbody = document.getElementById('ordersTableBody');
    tbody.innerHTML = orders.map(order => {
        const sellingPrice = order.price || 0;
        const costPrice = order.costPrice || 0;
        const profitMargin = sellingPrice > 0 ? (sellingPrice - costPrice) / sellingPrice : 0;

        // تلوين السعر بالأحمر إذا كان الهامش أقل من 5% (أي أن الربح ضعيف جداً مقارنة بالتكلفة)
        const costStyle = profitMargin < 0.05 ? 'color:#e74c3c; font-weight:bold;' : 'color:var(--text-muted);';

        // جلب معرف المنتج من تفاصيل الطلب (نفترض أول عنصر) لتمكين التعديل الفوري
        const productId = order.items && order.items.length > 0 ? order.items[0].id : null;

        // تحديد حالة توفر المخزون للمنتج
        const product = allProducts.find(p => p._id === productId);
        let stockStatus = '';
        if (product) {
            if (product.isExternal) {
                stockStatus = `<span style="font-size: 0.75rem; color: #9b59b6; display: block; margin-top: 4px;">(🔄 مزود API خارجي)</span>`;
            } else {
                const count = product.codes ? product.codes.filter(c => c.status === 'available').length : 0;
                const color = count > 0 ? '#2ecc71' : '#e74c3c';
                stockStatus = `<span style="font-size: 0.75rem; color: ${color}; display: block; margin-top: 4px;">(📦 متاح: ${count})</span>`;
            }
        }

        return `
            <tr>
                <td>#${order.orderId}</td>
                <td>${order.buyerEmail}</td>
                <td>
                    <div style="font-weight: 600;">${order.productName}</div>
                    ${stockStatus}
                </td>
                <td>${order.paymentGateway}</td>
                <td style="font-size: 0.9rem;">
                    ${order.paymentRef
                        ? `<div style="display: flex; align-items: center; justify-content: flex-end; gap: 5px; color:var(--accent-orange);">
                            <span>رقم التحويل: <span id="paymentRef-${order.orderId}" style="font-weight: bold; color: var(--primary-neon);">${order.paymentRef}</span></span>
                            <button class="copy-btn" onclick="copyPaymentRef('${order.orderId}', event)" title="نسخ رقم التحويل">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>`
                        : '<span style="color:var(--accent-orange);">لا يوجد رقم تحويل</span>'}
                </td>
                <td style="${costStyle}">${costPrice.toFixed(2)}$</td>
                <td>
                    <button class="btn-action btn-approve" onclick="approveOrder('${order.orderId}')">✅ تأكيد وإرسال</button>
                    ${productId ? `<button class="btn-action" style="background:var(--accent-orange); color:white; margin-top:5px; font-size: 0.75rem;" onclick="updateMarginPrompt('${productId}')">⚙️ تعديل الربح</button>` : ''}
                    <button class="btn-action btn-reject" onclick="rejectOrder('${order.orderId}')">❌ رفض</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function toggleAdminView(view) {
    const ordersBody = document.querySelector('h2:not(#logsSection h2)');
    const ordersTable = document.querySelector('.admin-table-container:not(#logsSection .admin-table-container)');
    const logsSection = document.getElementById('logsSection');

    if (view === 'logs') {
        ordersBody.style.display = 'none';
        ordersTable.style.display = 'none';
        logsSection.style.display = 'block';
        fetchLogs();
    }
}

async function fetchLogs() {
    try {
        const res = await fetch('/api/admin/logs', {
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` }
        });
        const data = await res.json();
        if (data.success) {
            allLogs = data.logs;
            const filterValue = document.getElementById('logFilter')?.value || 'all';
            renderLogs(filterValue);
        }
    } catch (err) { console.error('خطأ في جلب السجلات:', err); }
}

function renderLogs(filter) {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;

    const filteredLogs = filter === 'all' 
        ? allLogs 
        : allLogs.filter(log => log.action === filter);

    tbody.innerHTML = filteredLogs.map(log => `
        <tr>
            <td style="font-size: 0.8rem;">${new Date(log.createdAt).toLocaleString('ar-EG')}</td>
            <td style="color: var(--primary-neon)">${log.action}</td>
            <td>${log.details}</td>
            <td style="color: var(--text-muted); font-size: 0.8rem;">${log.ip}</td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                    ${log.targetName ? `<a href="/index.html" target="_blank" title="مشاهدة المنتج في المتجر" style="font-size: 0.75rem; color: var(--accent-orange); font-weight: bold; text-decoration: none; border-bottom: 1px dashed var(--accent-orange); transition: 0.3s; cursor: pointer;">📦 ${log.targetName}</a>` : ''}
                    <div style="display: flex; gap: 4px;">
                        ${log.targetId ? `<button class="btn-action btn-approve" style="padding: 4px 8px; font-size: 0.7rem;" onclick="updateMarginPrompt('${log.targetId}')">⚙️ تعديل الربح</button>` : ''}
                        <button class="btn-action btn-reject" style="padding: 4px 8px; font-size: 0.7rem;" onclick="deleteLog('${log._id}')">🗑️ حذف</button>
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
}

async function deleteLog(logId) {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا السجل نهائياً؟')) return;

    try {
        const res = await fetch(`/api/admin/logs/${logId}`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
            }
        });
        const data = await res.json();
        if (data.success) {
            // تحديث المصفوفة المحلية وحذف العنصر منها لتجنب إعادة التحميل كاملة
            allLogs = allLogs.filter(log => log._id !== logId);
            const filterValue = document.getElementById('logFilter')?.value || 'all';
            renderLogs(filterValue);
        } else {
            alert('❌ ' + data.message);
        }
    } catch (err) {
        alert('❌ فشل الاتصال بالسيرفر');
    }
}

async function deleteAllLogs() {
    if (!confirm('🚨 تحذير: هل أنت متأكد من رغبتك في حذف جميع السجلات نهائياً؟ لا يمكن التراجع عن هذه الخطوة.')) return;

    try {
        const res = await fetch('/api/admin/logs', {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
            }
        });
        const data = await res.json();
        if (data.success) {
            allLogs = []; // تفريغ المصفوفة المحلية
            renderLogs('all');
            alert('🧹 ' + data.message);
        } else {
            alert('❌ ' + data.message);
        }
    } catch (err) {
        alert('❌ فشل الاتصال بالسيرفر');
    }
}

async function exportLogsToCSV() {
    try {
        const res = await fetch('/api/admin/logs/export', {
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` }
        });
        const data = await res.json();
        
        if (data.success) {
            const logs = data.logs;
            if (logs.length === 0) {
                alert('لا توجد سجلات لتصديرها حالياً.');
                return;
            }

            // إضافة BOM لضمان ظهور اللغة العربية بشكل صحيح في Excel
            let csvContent = "\uFEFF";
            csvContent += "التوقيت,الحركة,التفاصيل,IP الجهاز\n";

            logs.forEach(log => {
                const row = [
                    `"${new Date(log.createdAt).toLocaleString('ar-EG')}"`,
                    `"${log.action}"`,
                    `"${log.details.replace(/"/g, '""')}"`, // حماية النصوص التي تحتوي على علامات تنصيص
                    `"${log.ip}"`
                ].join(",");
                csvContent += row + "\n";
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `joker_activity_logs_${new Date().toISOString().split('T')[0]}.csv`);
            link.click();
        }
    } catch (err) {
        console.error('Export Error:', err);
        alert('❌ فشل تصدير السجلات');
    }
}

async function updateMarginPrompt(productId) {
    const newMargin = prompt('أدخل هامش الربح الجديد (مثال: 1.15 لربح 15%):');
    if (!newMargin || isNaN(newMargin)) return;

    try {
        const res = await fetch(`/api/admin/inventory/${productId}/margin`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
            },
            body: JSON.stringify({ margin: newMargin })
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ ' + data.message);
            fetchDashboardData(); // تحديث البيانات والإحصائيات فوراً لرؤية أثر تعديل الربح
            if (document.getElementById('logsSection').style.display === 'block') fetchLogs();
        } else {
            alert('❌ ' + data.message);
        }
    } catch (err) {
        alert('❌ فشل الاتصال بالسيرفر');
    }
}

async function approveOrder(orderId) {
    if (!confirm('هل تأكدت من استلام المبلغ؟ سيتم سحب كود وإرساله للزبون فوراً.')) return;
    
    const res = await fetch(`/api/admin/orders/${orderId}/approve`, { 
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` 
        }
    });
    const result = await res.json();
    
    if (result.success) {
        alert('🚀 تم تأكيد الطلب بنجاح وإرسال الكود للزبون!');
        fetchDashboardData(); // تحديث القائمة
    } else {
        alert('❌ خطأ: ' + result.message);
    }
}

async function syncExternalProducts(e) {
    e.preventDefault();
    if (!confirm('هل تريد جلب وتحديث أسعار المنتجات من المزودين الخارجيين الآن؟')) return;

    const btn = document.getElementById('syncBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المزامنة...';
    
    try {
        const res = await fetch('/api/admin/inventory/sync', { 
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` 
            }
        });
        const data = await res.json();
        alert(data.message);
        fetchDashboardData();
    } catch (err) {
        alert('❌ فشل الاتصال بالسيرفر للمزامنة');
    } finally {
        btn.innerHTML = '<i class="fas fa-sync"></i> مزامنة المنتجات';
    }
}

// دالة مساعدة لنسخ رقم التحويل إلى الحافظة
function copyPaymentRef(orderId, event) {
    event.stopPropagation(); // منع أي أحداث أخرى قد تكون مرتبطة بالصف
    const paymentRefSpan = document.getElementById(`paymentRef-${orderId}`);
    if (paymentRefSpan) {
        const textToCopy = paymentRefSpan.textContent;
        navigator.clipboard.writeText(textToCopy).then(() => {
            const copyBtn = event.currentTarget;
            const originalIcon = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check" style="color: #2ecc71;"></i>'; // تغيير الأيقونة إلى علامة صح خضراء
            copyBtn.style.borderColor = '#2ecc71';
            copyBtn.style.color = '#2ecc71';
            copyBtn.style.boxShadow = '0 0 8px rgba(46, 204, 113, 0.6)';
            
            setTimeout(() => {
                copyBtn.innerHTML = originalIcon; // إعادة الأيقونة الأصلية بعد 1.5 ثانية
                copyBtn.style.borderColor = 'rgba(0, 242, 254, 0.2)';
                copyBtn.style.color = 'var(--primary-neon)';
                copyBtn.style.boxShadow = 'none';
            }, 1500);
        }).catch(err => {
            console.error('فشل نسخ رقم التحويل:', err);
            alert('❌ فشل نسخ رقم التحويل. يرجى المحاولة يدوياً.');
        });
    }
}