// ======================================================
//  منطق لوحة تحكم جوكر ستور (متكامل)
//  Dashboard, المخزون, الطلبات, الأقسام, السجلات
// ======================================================

let isSoundEnabled = true;
let adminCsrfToken = null;
const _allOrdersCache = [];
let _allProducts = [];
let _allCategories = [];
let CURRENCY_SYMBOL = '₪';

function formatMoney(value) {
    const numeric = Number(value);
    return `${Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00'} ${CURRENCY_SYMBOL}`;
}

/**
 * تهريب القيم لإدراجها بأمان داخل HTML (منع XSS).
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

//  WebSocket Connection — إشعارات فورية
// ======================================================
function connectWebSocket() {
    const statusEl = document.getElementById('socketStatus');
    if (!statusEl) return;
    if (typeof window.io === 'undefined') {
        statusEl.innerHTML = '<i class="fas fa-circle" style="color: var(--text-muted);"></i> غير متاح';
        return;
    }

    const socket = window.io(window.location.origin, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 3000
    });

    socket.on('connect', () => {
        statusEl.innerHTML = '<i class="fas fa-circle" style="color: var(--success);"></i> مباشر';
    });

    socket.on('new_order', (data) => {
        showAdminToast(`🆕 طلب جديد #${data.orderId} — ${data.buyerEmail || ''} (${formatMoney(data.price)})`, 'success');
        playNotificationSound();
        loadDashboard();
        loadRecentOrders();
    });

    socket.on('order_approved', () => {
        showAdminToast(`✅ تم اعتماد الطلب`, 'success');
    });

    socket.on('disconnect', () => {
        statusEl.innerHTML = '<i class="fas fa-circle" style="color: var(--danger);"></i> غير متصل';
    });

    socket.on('connect_error', () => {
        statusEl.innerHTML = '<i class="fas fa-circle" style="color: var(--warning);"></i> خطأ';
    });
}

function playNotificationSound() {
    if (!isSoundEnabled) return;
    try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.volume = 0.5;
        audio.play();
    } catch (_) { /* أومأ - قد لا يتمكن المتصفح من تشغيل الصوت */ }
}

// ======================================================
//  CSRF Token
// ======================================================

async function ensureAdminCsrfToken() {
    if (adminCsrfToken) return adminCsrfToken;
    try {
        const res = await fetch('/api/csrf-token', { credentials: 'include' });
        const data = await res.json();
        if (data.success && data.csrfToken) {
            adminCsrfToken = data.csrfToken;
            return adminCsrfToken;
        }
    } catch (_err) { /* تجاهل - لا يوجد توكن */ }
    return null;
}

function buildJsonHeaders(extraHeaders = {}) {
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': adminCsrfToken || '',
        ...extraHeaders
    };
}

// رفع صورة ملف (إن وُجد) وإرجاع رابطها، وإلا إرجاع الرابط النصي الاحتياطي
async function uploadImageIfAny(fileInput, fallbackUrl = '') {
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) return (fallbackUrl || '').trim();
    const csrfToken = await ensureAdminCsrfToken();
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/admin/upload', {
        method: 'POST', credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken || '' },
        body: formData
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'فشل رفع الصورة');
    return data.url;
}

// ======================================================
//  Admin Toast Notification
// ======================================================

function showAdminToast(message, type = 'info') {
    const toast = document.getElementById('adminToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'admin-toast';
    toast.classList.add('show');
    if (type === 'success') toast.classList.add('toast-success');
    else if (type === 'error') toast.classList.add('toast-error');
    else if (type === 'warning') toast.classList.add('toast-warning');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 4000);
}

// ======================================================
//  التهيئة الرئيسية
// ======================================================

const initAdmin = async () => {
    // === Logout: يُربط أولاً قبل أي طلب شبكة حتى يعمل الزر دائماً ===
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            // إرسال طلب الخروج للسيرفر دون انتظار الرد حتى لا يتجمد الزر
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/admin/logout');
            } else {
                fetch('/api/admin/logout', { method: 'POST', credentials: 'include', keepalive: true }).catch(() => {});
            }
            // لا نحاول مسح الـ HttpOnly cookie عبر document.cookie (لن ينجح)؛
            // الخادم يمسحه فعلياً في /api/admin/logout
            window.location.href = '/login.html';
        });
    }

    // تحقق من الجلسة (مع مهلة قصيرة حتى لا تتجمد الواجهة لو كان السيرفر بطيئاً)
    try {
        const authCheck = await Promise.race([
            fetch('/api/admin/dashboard', { credentials: 'include', method: 'GET' }),
            new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), 5000))
        ]);
        if (authCheck && !authCheck.timedOut && !authCheck.ok) { window.location.href = '/login.html'; return; }
    } catch (_err) { /* نكمل ربط الواجهة حتى لو تعطل فحص الجلسة */ }

    connectWebSocket();

    // التاريخ
    const now = new Date();
    const dateEl = document.getElementById('currentDate');
    if (dateEl) {
        dateEl.textContent = now.toLocaleString('ar-EG', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    // الصوت
    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
        soundToggle.checked = isSoundEnabled;
        soundToggle.onchange = () => {
            isSoundEnabled = soundToggle.checked;
            updateSoundIcon();
        };
    }

    // === Tab switching ===
    const tabs = [
        { btn: 'dashboardTabBtn', section: 'dashboardSection' },
        { btn: 'inventoryTabBtn', section: 'inventorySection' },
        { btn: 'ordersTabBtn', section: 'ordersSection' },
        { btn: 'categoriesTabBtn', section: 'categoriesSection' },
        { btn: 'logsTabBtn', section: 'logsSection' }
    ];

    tabs.forEach(({ btn: btnId, section: sectionId }) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', () => {
            tabs.forEach(t => {
                const tb = document.getElementById(t.btn);
                const ts = document.getElementById(t.section);
                if (tb) tb.classList.remove('active');
                if (ts) ts.classList.add('hidden');
            });
            btn.classList.add('active');
            const section = document.getElementById(sectionId);
            if (section) section.classList.remove('hidden');

            // Load data on tab switch
            if (sectionId === 'dashboardSection') loadDashboard();
            else if (sectionId === 'inventorySection') loadInventory();
            else if (sectionId === 'ordersSection') loadRecentOrders();
            else if (sectionId === 'categoriesSection') loadCategories();
            else if (sectionId === 'logsSection') loadLogs();
        });
    });

    // === Dashboard ===
    const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
    if (refreshDashboardBtn) refreshDashboardBtn.addEventListener('click', loadDashboard);

    // === Providers ===
    const providerSyncBtn = document.getElementById('providerSyncBtn');
    if (providerSyncBtn) providerSyncBtn.addEventListener('click', runProviderSync);
    const refreshRatesBtn = document.getElementById('refreshRatesBtn');
    if (refreshRatesBtn) refreshRatesBtn.addEventListener('click', refreshCurrencyRates);

    // === Inventory buttons ===
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadInventory);

    const loadMoreInventoryBtn = document.getElementById('loadMoreInventoryBtn');
    if (loadMoreInventoryBtn) loadMoreInventoryBtn.addEventListener('click', loadMoreInventory);

    const addManualBtn = document.getElementById('addManualBtn');
    if (addManualBtn) addManualBtn.addEventListener('click', openAddManualModal);

    const closeAddModalBtn = document.getElementById('closeAddManualModalBtn');
    const cancelAddBtn = document.getElementById('cancelAddManualBtn');
    const saveAddBtn = document.getElementById('saveAddManualBtn');
    if (closeAddModalBtn) closeAddModalBtn.addEventListener('click', closeAddManualModal);
    if (cancelAddBtn) cancelAddBtn.addEventListener('click', closeAddManualModal);
    if (saveAddBtn) saveAddBtn.addEventListener('click', saveManualProduct);

    // Manual codes textarea
    const codesTextarea = document.getElementById('manualCodesTextarea');
    if (codesTextarea) {
        codesTextarea.addEventListener('input', function() {
            const lines = this.value.trim().split('\n').filter(l => l.trim());
            const countEl = document.getElementById('codeCountValue');
            const infoEl = document.getElementById('codeCountInfo');
            if (countEl) countEl.textContent = lines.length;
            if (infoEl) infoEl.style.display = lines.length > 0 ? 'block' : 'none';
        });
    }

    const codesFileInput = document.getElementById('manualCodesFile');
    if (codesFileInput) codesFileInput.addEventListener('change', loadManualCodes);

    const addManualModal = document.getElementById('addManualModal');
    if (addManualModal) {
        addManualModal.addEventListener('click', (e) => { if (e.target === addManualModal) closeAddManualModal(); });
    }

    // Edit modal
    const saveEditBtn = document.getElementById('saveEditBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const closeEditBtn = document.getElementById('closeModalBtn');
    if (saveEditBtn) saveEditBtn.onclick = saveProductEdit;
    if (cancelEditBtn) cancelEditBtn.onclick = () => closeModal(document.getElementById('editModal'));
    if (closeEditBtn) closeEditBtn.onclick = () => closeModal(document.getElementById('editModal'));

    // Export CSV
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => { window.location.href = '/api/admin/inventory/export'; });

    // Import CSV
    const importCsvBtn = document.getElementById('importCsvBtn');
    const importCsvModal = document.getElementById('importCsvModal');
    const closeImportCsv = document.getElementById('closeImportCsvBtn');
    const cancelImportCsv = document.getElementById('cancelImportCsvBtn');
    const confirmImportCsv = document.getElementById('confirmImportCsvBtn');

    if (importCsvBtn) importCsvBtn.addEventListener('click', () => openModal(importCsvModal));
    if (closeImportCsv) closeImportCsv.addEventListener('click', () => closeModal(importCsvModal));
    if (cancelImportCsv) cancelImportCsv.addEventListener('click', () => closeModal(importCsvModal));
    if (confirmImportCsv) confirmImportCsv.addEventListener('click', importCsvData);

    // === Orders ===
    const refreshOrdersBtn = document.getElementById('refreshOrdersBtn');
    if (refreshOrdersBtn) refreshOrdersBtn.addEventListener('click', loadRecentOrders);

    // Order filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filterOrders(chip.dataset.status);
        });
    });

    // === Categories ===
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (addCategoryBtn) addCategoryBtn.addEventListener('click', openAddCategoryModal);

    const closeCategoryModal = document.getElementById('closeCategoryModalBtn');
    const cancelCategory = document.getElementById('cancelCategoryBtn');
    const saveCategory = document.getElementById('saveCategoryBtn');
    if (closeCategoryModal) closeCategoryModal.addEventListener('click', () => closeModal(document.getElementById('categoryModal')));
    if (cancelCategory) cancelCategory.addEventListener('click', () => closeModal(document.getElementById('categoryModal')));
    if (saveCategory) saveCategory.addEventListener('click', saveCategoryHandler);

    // === Logs ===
    const refreshLogs = document.getElementById('refreshLogsBtn');
    const exportLogs = document.getElementById('exportLogsBtn');
    const clearLogs = document.getElementById('clearLogsBtn');
    if (refreshLogs) refreshLogs.addEventListener('click', loadLogs);
    if (exportLogs) exportLogs.addEventListener('click', () => { window.location.href = '/api/admin/logs/export'; });
    if (clearLogs) clearLogs.addEventListener('click', clearAllLogs);

    // === Load initial data ===
    loadDashboard();
    setInterval(loadDashboard, 60000);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
} else {
    initAdmin();
}

// ======================================================
//  مُساعدات عامة
// ======================================================

function updateSoundIcon() {
    const icon = document.getElementById('soundIcon');
    if (!icon) return;
    icon.className = isSoundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
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
//  DASHBOARD — لوحة الإحصائيات
// ======================================================

async function loadDashboard() {
    try {
        const res = await fetch('/api/admin/dashboard', { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();

        if (data.success) {
            const s = data.stats;
            document.getElementById('statRevenue').textContent = formatMoney(s.revenue || 0);
            document.getElementById('statProfit').textContent = formatMoney(s.totalProfit || 0);
            document.getElementById('statCompleted').textContent = s.completedOrders || 0;
            document.getElementById('statPending').textContent = s.pendingOrders || 0;
            document.getElementById('statTodaySales').textContent = formatMoney(s.salesToday || 0);
            document.getElementById('statTodayOrders').textContent = s.completedOrdersToday || 0;

            // Provider balances
            if (s.providerBalances && s.providerBalances.length > 0) {
                const statsGrid = document.getElementById('statsGrid');
                s.providerBalances.forEach(p => {
                    const existingProvider = document.getElementById(`provider-${p.name.replace(/\s/g, '')}`);
                    if (existingProvider) {
                        existingProvider.querySelector('.stat-value').textContent = `${p.balance.toFixed(2)} ${p.currency}`;
                    } else if (!document.getElementById(`provider-${p.name.replace(/\s/g, '')}`)) {
                        const card = document.createElement('div');
                        card.className = 'stat-card stat-provider';
                        card.id = `provider-${p.name.replace(/\s/g, '')}`;
                        card.innerHTML = `
                            <div class="stat-icon">🏢</div>
                            <div class="stat-value">${p.balance.toFixed(2)} ${p.currency}</div>
                            <div class="stat-label">${p.name}</div>
                        `;
                        statsGrid.appendChild(card);
                    }
                });
            }
        }

        // Recent orders
        loadRecentOrdersMini();

        // Providers status
        loadProviderStatus();

    } catch (_err) {
        showAdminToast('❌ فشل تحميل الإحصائيات', 'error');
    }
}

// ======================================================
//  PROVIDERS — المزودون والمزامنة وأسعار الصرف
// ======================================================

function providerStatusRow(provider) {
    const statusMap = {
        ok: '<span class="mini-badge badge-success">متصل</span>',
        failed: '<span class="mini-badge badge-danger">فشل</span>',
        never: '<span class="mini-badge badge-warning">لم تتم المزامنة</span>'
    };
    const badge = statusMap[provider.status] || statusMap.never;
    const lastSync = provider.lastSyncAt
        ? new Date(provider.lastSyncAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })
        : '—';
    const error = provider.lastError ? `<div style="color:var(--danger);font-size:0.82rem;margin-top:4px;">⚠ ${escapeHtml(provider.lastError)}</div>` : '';

    return `
        <div class="mini-order-row" style="flex-wrap:wrap;gap:10px;">
            <span style="color:var(--primary);font-weight:700;min-width:110px;">🏢 ${escapeHtml(provider.name)}</span>
            ${badge}
            <span class="order-amount">${provider.hasApiKey ? 'مفتاح API ✓' : 'بدون مفتاح'}</span>
            <span class="order-email">عملة: ${escapeHtml(provider.currency || '—')}${provider.margin ? ` · هامش: ${provider.margin}` : ''}</span>
            <span class="order-email">منتجات: ${provider.fetched ?? 0} (جديد ${provider.created ?? 0} / محدث ${provider.updated ?? 0})</span>
            <span class="order-date">آخر مزامنة: ${lastSync}</span>
            ${error}
        </div>
    `;
}

async function loadProviderStatus() {
    const container = document.getElementById('providersStatusList');
    if (!container) return;

    try {
        const res = await fetch('/api/admin/providers/status', { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = '<div style="padding:14px;color:var(--danger);">فشل تحميل حالة المزودين</div>';
            return;
        }

        const fx = data.currency || {};
        if (fx.symbol) CURRENCY_SYMBOL = fx.symbol;
        const fxLine = `
            <div style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);color:var(--text-muted);font-size:0.9rem;">
                💱 عملة المتجر: <b style="color:var(--primary);">${escapeHtml(fx.storeCurrency || 'ILS')} (${escapeHtml(fx.symbol || CURRENCY_SYMBOL)})</b>
                · مصدر الأسعار: <b>${escapeHtml(fx.source || '—')}</b>
                ${fx.updatedAt ? `· آخر تحديث: ${new Date(fx.updatedAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
            </div>`;

        if (!data.providers || data.providers.length === 0) {
            container.innerHTML = `${fxLine}
                <div style="padding:14px;color:var(--text-muted);">
                    لا يوجد مزودون مُعدّون. أضف <code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;">PROVIDERS_COUNT</code> ومفاتيح API في ملف <code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;">.env</code>.
                </div>`;
            return;
        }

        container.innerHTML = `${fxLine}${data.providers.map(providerStatusRow).join('')}`;
    } catch (_err) {
        container.innerHTML = '<div style="padding:14px;color:var(--danger);">فشل تحميل حالة المزودين</div>';
    }
}

async function runProviderSync() {
    const btn = document.getElementById('providerSyncBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ المزامنة...'; }

    try {
        await ensureAdminCsrfToken();
        const res = await fetch('/api/admin/providers/sync', {
            method: 'POST', credentials: 'include', headers: buildJsonHeaders()
        });
        const data = await res.json();
        if (data.success) {
            showAdminToast(`✅ تمت المزامنة: ${data.totalCreated} جديد، ${data.totalUpdated} محدث`, 'success');
        } else {
            showAdminToast(`❌ ${data.error || 'فشلت المزامنة'}`, 'error');
        }
    } catch (_err) {
        showAdminToast('❌ تعذر الوصول للسيرفر', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> مزامنة الآن'; }
        loadProviderStatus();
    }
}

async function refreshCurrencyRates() {
    const btn = document.getElementById('refreshRatesBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ التحديث...'; }

    try {
        await ensureAdminCsrfToken();
        const res = await fetch('/api/admin/currency/rates/refresh', {
            method: 'POST', credentials: 'include', headers: buildJsonHeaders()
        });
        const data = await res.json();
        if (data.success) {
            showAdminToast(`✅ تم تحديث أسعار الصرف (${data.rateCount} عملة)`, 'success');
        } else {
            showAdminToast(`❌ ${data.error || 'فشل تحديث أسعار الصرف'}`, 'error');
        }
    } catch (_err) {
        showAdminToast('❌ تعذر الوصول للسيرفر', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-coins"></i> تحديث أسعار الصرف'; }
        loadProviderStatus();
    }
}

async function loadRecentOrdersMini() {
    const container = document.getElementById('recentOrdersList');
    if (!container) return;
    try {
        const res = await fetch('/api/admin/orders?limit=200', { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (!data.success) return;

        const orders = (data.orders || []).slice(0, 15);
        if (orders.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">لا توجد طلبات بعد</div>';
            return;
        }

        container.innerHTML = orders.map(order => `
            <div class="mini-order-row">
                <span style="color:var(--primary);font-weight:700;min-width:80px;">#${escapeHtml(order.orderId)}</span>
                <span class="order-email">${escapeHtml(order.buyerEmail || '—')}</span>
                <span class="order-amount">${formatMoney(order.price)}</span>
                <span class="mini-badge ${order.status === 'completed' ? 'badge-success' : order.status === 'pending' ? 'badge-warning' : 'badge-danger'}">${order.status === 'completed' ? 'مكتمل' : order.status === 'pending' ? 'معلق' : order.status === 'refunded' ? 'مرفوض' : 'فشل'}</span>
                <span class="order-date">${escapeHtml(new Date(order.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }))}</span>
            </div>
        `).join('');
    } catch (_) {
        container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">فشل تحميل الطلبات</div>';
    }
}

// ======================================================
//  إدارة المخزون
// ======================================================

let _inventoryPage = 1;
let _inventoryHasMore = false;

function renderInventoryRow(item) {
    const nameAr = escapeHtml(item.productName?.ar || item.productName || '');
    const nameEn = escapeHtml(item.productName?.en || '');
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
            <td><span class="badge badge-accent">${escapeHtml(item.category || '—')}</span></td>
            <td>🌍 ${escapeHtml(item.region || 'global')}</td>
            <td class="${priceClass}">${formatMoney(item.price)}</td>
            <td><span class="badge ${stockBadgeClass}">${stockText}</span></td>
            <td>
                <div class="action-btns-group">
                    <button class="action-icon btn-edit" onclick="editProduct('${item._id}')" title="تعديل"><i class="fas fa-edit"></i></button>
                    <button class="action-icon btn-delete" onclick="deleteProduct('${item._id}')" title="حذف"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `;
}

function updateInventoryFooter(hasMore) {
    const footer = document.getElementById('inventoryFooter');
    if (!footer) return;
    footer.style.display = hasMore ? '' : 'none';
}

async function loadInventory() {
    const tbody = document.getElementById('inventoryList');
    if (!tbody) return;

    _inventoryPage = 1;
    _allProducts = [];
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell"><span class="spinner"></span> جاري تحميل المنتجات...</td></tr>`;
    updateInventoryFooter(false);

    try {
        const res = await fetch(`/api/admin/inventory?page=${_inventoryPage}&limit=100`, { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();

        if (!res.ok || !data.success) {
            tbody.innerHTML = `<tr><td colspan="6" class="error-cell">❌ فشل تحميل المنتجات: ${data.message || 'خطأ غير معروف'}</td></tr>`;
            return;
        }

        const products = Array.isArray(data) ? data : (data.products || []);
        _allProducts = products;
        _inventoryHasMore = Boolean(data.hasMore);
        tbody.innerHTML = '';

        if (products.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">لا توجد منتجات متاحة حالياً.</td></tr>`;
            updateInventoryFooter(false);
            return;
        }

        tbody.innerHTML = products.map(renderInventoryRow).join('');
        updateInventoryFooter(_inventoryHasMore);
    } catch (_err) {
        tbody.innerHTML = `<tr><td colspan="6" class="error-cell">❌ فشل الاتصال بالسيرفر.</td></tr>`;
        updateInventoryFooter(false);
    }
}

async function loadMoreInventory() {
    const tbody = document.getElementById('inventoryList');
    if (!tbody) return;

    _inventoryPage += 1;
    try {
        const res = await fetch(`/api/admin/inventory?page=${_inventoryPage}&limit=100`, { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (!res.ok || !data.success) return;

        const products = Array.isArray(data) ? data : (data.products || []);
        _allProducts = _allProducts.concat(products);
        _inventoryHasMore = Boolean(data.hasMore);
        tbody.insertAdjacentHTML('beforeend', products.map(renderInventoryRow).join(''));
        updateInventoryFooter(_inventoryHasMore);
    } catch (_err) {
        _inventoryPage -= 1;
    }
}

function fillEditProductForm(product) {
    document.getElementById('editId').value = product._id;
    document.getElementById('editName').value = product.productName?.en || product.productName;
    document.getElementById('editPrice').value = product.price || '';
    document.getElementById('editMargin').value = product.profitMargin || 1.15;
    const ratingInput = document.getElementById('editRating');
    if (ratingInput) ratingInput.value = product.rating || 0;
    const reviewsInput = document.getElementById('editReviewsCount');
    if (reviewsInput) reviewsInput.value = product.reviewsCount || 0;
    const imageUrl = product.image || '';
    document.getElementById('editImageUrl').value = imageUrl;
    const preview = document.getElementById('editImagePreview');
    if (preview) {
        preview.src = imageUrl;
        preview.style.display = imageUrl ? 'inline-block' : 'none';
    }
    const imageFile = document.getElementById('editProductImage');
    if (imageFile) imageFile.value = '';
    openModal(document.getElementById('editModal'));
}

// تُستدعى من onclick في HTML ("تعديل")
// eslint-disable-next-line no-unused-vars
async function editProduct(productId) {
    try {
        const res = await fetch(`/api/admin/inventory/${productId}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();

        if (!data.success && !data._id) {
            const allData = await fetch('/api/admin/inventory?limit=200', { credentials: 'include', headers: { 'Content-Type': 'application/json' } }).then(r => r.json());
            const allProducts = Array.isArray(allData) ? allData : (allData.products || []);
            const product = allProducts.find(p => p._id === productId);
            if (!product) return alert('❌ لم يتم العثور على المنتج');
            fillEditProductForm(product);
            return;
        }

        fillEditProductForm(data);

    } catch (_err) {
        alert('❌ فشل تحميل بيانات المنتج');
    }
}

// eslint-disable-next-line no-unused-vars
async function deleteProduct(productId) {
    const product = _allProducts.find(p => p._id === productId);
    const productName = product?.productName?.ar || product?.productName?.en || product?.productName || '';
    if (!confirm(`هل أنت متأكد من حذف المنتج: ${productName}؟`)) return;

    try {
        const csrfToken = await ensureAdminCsrfToken();
        const res = await fetch(`/api/admin/inventory/${productId}`, {
            method: 'DELETE', credentials: 'include',
            headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' })
        });
        const data = await res.json();
        if (data.success) {
            showAdminToast('🗑️ تم حذف المنتج بنجاح', 'success');
            loadInventory();
        } else {
            alert(`❌ ${data.message || 'فشل الحذف'}`);
        }
    } catch (_err) {
        alert('❌ فشل الاتصال بالسيرفر');
    }
}

async function saveProductEdit() {
    const productId = document.getElementById('editId').value;
    const price = parseFloat(document.getElementById('editPrice').value);
    const margin = parseFloat(document.getElementById('editMargin').value);
    const ratingInput = document.getElementById('editRating');
    const reviewsInput = document.getElementById('editReviewsCount');

    try {
        const image = await uploadImageIfAny(
            document.getElementById('editProductImage'),
            (document.getElementById('editImageUrl') || {}).value || ''
        );
        const payload = { price, profitMargin: margin, image };
        if (ratingInput) {
            const rating = parseFloat(ratingInput.value);
            payload.rating = Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
        }
        if (reviewsInput) {
            const reviews = parseInt(reviewsInput.value, 10);
            payload.reviewsCount = Number.isFinite(reviews) ? Math.max(0, reviews) : 0;
        }
        const csrfToken = await ensureAdminCsrfToken();
        const res = await fetch(`/api/admin/inventory/${productId}`, {
            method: 'PATCH', credentials: 'include',
            headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' }),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showAdminToast('✅ تم تحديث المنتج بنجاح', 'success');
            closeModal(document.getElementById('editModal'));
            loadInventory();
        } else {
            alert(`❌ ${data.message || 'فشل التحديث'}`);
        }
    } catch (_err) {
        alert('❌ فشل الاتصال بالسيرفر');
    }
}

// ======================================================
//  إدارة الطلبات
// ======================================================

let _ordersFilter = 'all';

async function loadRecentOrders() {
    const tbody = document.getElementById('ordersList');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell"><span class="spinner"></span> جاري جلب الفواتير...</td></tr>`;

    try {
        const res = await fetch('/api/admin/orders?limit=200', { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();

        if (!data.success) {
            tbody.innerHTML = `<tr><td colspan="7" class="error-cell">❌ فشل تحميل الطلبات.</td></tr>`;
            return;
        }

        _allOrdersCache = data.orders || [];
        renderOrders(_allOrdersCache);

    } catch (_err) {
        tbody.innerHTML = `<tr><td colspan="7" class="error-cell">❌ فشل الاتصال بالسيرفر.</td></tr>`;
    }
}

function filterOrders(status) {
    _ordersFilter = status;
    const filtered = status === 'all' ? _allOrdersCache : _allOrdersCache.filter(o => o.status === status);
    renderOrders(filtered);
}

function renderOrders(orders) {
    const tbody = document.getElementById('ordersList');
    if (!tbody) return;

    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">لا توجد طلبات بهذه الحالة.</td></tr>`;
        return;
    }

    tbody.innerHTML = orders.map(order => {
        const customerName = order.buyerEmail?.split('@')[0] || 'زبون';
        const email = order.buyerEmail || order.email || '—';
        const items = order.items && order.items.length > 0
            ? order.items.map(i => {
                const itemName = (i.name && typeof i.name === 'object')
                    ? (i.name.ar || i.name.en || '')
                    : (i.name || i.id || '');
                const qty = i.qty ?? i.quantity ?? 1;
                return `${escapeHtml(itemName)} (×${qty})`;
            }).join('، ')
            : escapeHtml(order.productName || '—');
        const total = order.price || order.totalAmount || 0;
        const status = order.status || 'pending';
        const statusBadge = status === 'completed' ? 'badge-success' : (status === 'pending' ? 'badge-warning' : status === 'refunded' ? 'badge-danger' : 'badge-danger');
        const statusText = status === 'completed' ? 'مكتمل' : (status === 'pending' ? 'معلّق' : (status === 'refunded' ? 'مرفوض' : (status === 'processing' ? 'قيد التنفيذ' : 'فشل')));
        const actionButtons = status === 'pending'
            ? `<button class="btn btn-approve btn-sm" onclick="approveOrder('${order.orderId}')"><i class="fas fa-check"></i> اعتماد</button>
               <button class="btn btn-reject btn-sm" onclick="rejectOrder('${order.orderId}')" style="margin-right:4px;"><i class="fas fa-times"></i> رفض</button>`
            : (status === 'completed' && order.deliveredCodes && order.deliveredCodes.length > 0
                ? `<button class="btn btn-secondary btn-sm" onclick="showCodes('${order.orderId}')"><i class="fas fa-eye"></i> الأكواد</button>`
                : '—');

        return `
            <tr>
                <td style="color:var(--primary);font-weight:700;">#${escapeHtml(order.orderId)}</td>
                <td class="customer-name-cell">${escapeHtml(customerName)}</td>
                <td class="customer-email-cell">${escapeHtml(email)}</td>
                <td>${items}</td>
                <td class="price-cell">${formatMoney(total)}</td>
                <td><span class="badge ${statusBadge}">${statusText}</span></td>
                <td><div class="action-btns-group">${actionButtons}</div></td>
            </tr>
        `;
    }).join('');
}

// eslint-disable-next-line no-unused-vars
async function approveOrder(orderId) {
    if (!confirm(`هل أنت متأكد من اعتماد الطلب #${orderId}؟`)) return;
    try {
        const csrfToken = await ensureAdminCsrfToken();
        const res = await fetch(`/api/admin/orders/${orderId}/approve`, {
            method: 'POST', credentials: 'include',
            headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' })
        });
        const data = await res.json();
        if (data.success) {
            showAdminToast(`✅ ${data.message || 'تم اعتماد الطلب بنجاح'}`, 'success');
            loadRecentOrders();
            loadDashboard();
            loadInventory();
        } else {
            showAdminToast(`❌ ${data.message || 'فشل اعتماد الطلب'}`, 'error');
        }
    } catch (_err) { showAdminToast('❌ فشل الاتصال بالسيرفر', 'error'); }
}

// eslint-disable-next-line no-unused-vars
async function rejectOrder(orderId) {
    if (!confirm(`هل أنت متأكد من رفض الطلب #${orderId}؟`)) return;
    try {
        const csrfToken = await ensureAdminCsrfToken();
        const res = await fetch(`/api/admin/orders/${orderId}/reject`, {
            method: 'POST', credentials: 'include',
            headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' })
        });
        const data = await res.json();
        if (data.success) {
            showAdminToast(`✅ ${data.message || 'تم رفض الطلب بنجاح'}`, 'success');
            loadRecentOrders();
            loadDashboard();
        } else {
            showAdminToast(`❌ ${data.message || 'فشل رفض الطلب'}`, 'error');
        }
    } catch (_err) { showAdminToast('❌ فشل الاتصال بالسيرفر', 'error'); }
}

// تُستدعى من onclick في HTML ("الأكواد")
// eslint-disable-next-line no-unused-vars
function showCodes(orderId) {
    const order = _allOrdersCache.find(o => o.orderId === orderId);
    if (!order || !order.deliveredCodes || order.deliveredCodes.length === 0) {
        showAdminToast('❌ لا توجد أكواد مسلمة', 'warning');
        return;
    }
    const codesStr = order.deliveredCodes.join('\n');
    const textarea = document.createElement('textarea');
    textarea.value = codesStr;
    textarea.style.width = '100%';
    textarea.style.height = '200px';
    textarea.style.background = '#1a1a2e';
    textarea.style.color = '#ff9f43';
    textarea.style.border = '1px solid rgba(255,159,67,0.3)';
    textarea.style.borderRadius = '8px';
    textarea.style.padding = '10px';
    textarea.style.direction = 'ltr';
    textarea.readOnly = true;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:500px;">
            <button class="close-modal-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            <h3 class="modal-title"><i class="fas fa-key"></i> أكواد الطلب #${escapeHtml(orderId)}</h3>
            <div style="margin-bottom:15px;">
                <span class="badge badge-success">📧 ${escapeHtml(order.buyerEmail)}</span>
            </div>
        </div>
    `;
    modal.querySelector('.modal-content').appendChild(textarea);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-primary';
    copyBtn.style.marginTop = '10px';
    copyBtn.innerHTML = '<i class="fas fa-copy"></i> نسخ الكل';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(codesStr).then(() => {
            showAdminToast('📋 تم نسخ الأكواد', 'success');
        });
    };
    modal.querySelector('.modal-content').appendChild(copyBtn);

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ======================================================
//  إضافة منتج يدوي مع كودات
// ======================================================

function openAddManualModal() {
    const modal = document.getElementById('addManualModal');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('manualProductNameAr').value = '';
    document.getElementById('manualProductNameEn').value = '';
    document.getElementById('manualCategory').value = '';
    document.getElementById('manualPrice').value = '';
    document.getElementById('manualProfitMargin').value = '1.15';
    document.getElementById('manualCodesTextarea').value = '';
    document.getElementById('manualCodesFile').value = '';
    const manualImageInput = document.getElementById('manualProductImage');
    const manualImageUrl = document.getElementById('manualProductImageUrl');
    if (manualImageInput) manualImageInput.value = '';
    if (manualImageUrl) manualImageUrl.value = '';
    document.getElementById('codeCountInfo').style.display = 'none';
    document.getElementById('codeCountValue').textContent = '0';
    const saveBtnText = document.getElementById('saveBtnText');
    const saveBtnLoading = document.getElementById('saveBtnLoading');
    const saveAddBtn = document.getElementById('saveAddManualBtn');
    if (saveBtnText) saveBtnText.classList.remove('hidden');
    if (saveBtnLoading) saveBtnLoading.classList.add('hidden');
    if (saveAddBtn) saveAddBtn.disabled = false;
}

function closeAddManualModal() {
    const modal = document.getElementById('addManualModal');
    if (modal) modal.classList.remove('active');
}

function parseCodesFromText(text) {
    return text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
}

function parseCodesFromCSV(text) {
    const lines = text.trim().split('\n');
    const codes = [];
    for (const line of lines) {
        const [firstCellRaw] = line.split(',');
        const [firstTabRaw] = line.split('\t');
        const code = (firstCellRaw || '').trim() || (firstTabRaw || '').trim();
        if (code && code.toUpperCase() !== 'CODE') codes.push(code);
    }
    return codes;
}

async function loadManualCodes() {
    const fileInput = document.getElementById('manualCodesFile');
    const textarea = document.getElementById('manualCodesTextarea');
    const [file] = fileInput.files;
    let codes = [];

    if (file) {
        const text = await file.text();
        if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) codes = parseCodesFromCSV(text);
        else if (file.name.endsWith('.json')) { const json = JSON.parse(text); codes = Array.isArray(json) ? json : (json.codes || []); }
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
        showAdminToast('❌ يرجى ملء جميع الحقول المطلوبة', 'error');
        return;
    }

    const codes = await loadManualCodes();
    if (codes.length === 0) {
        showAdminToast('❌ لا يوجد كودات لإضافتها', 'error');
        return;
    }

    document.getElementById('saveBtnText').classList.add('hidden');
    document.getElementById('saveBtnLoading').classList.remove('hidden');
    document.getElementById('saveAddManualBtn').disabled = true;

    try {
        const image = await uploadImageIfAny(
            document.getElementById('manualProductImage'),
            (document.getElementById('manualProductImageUrl') || {}).value || ''
        );
        const csrfToken = await ensureAdminCsrfToken();
        const res = await fetch('/api/admin/inventory/add-manual', {
            method: 'POST', credentials: 'include',
            headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' }),
            body: JSON.stringify({ productName: { ar: productNameAr, en: productNameEn }, category, price, profitMargin, manualCodes: codes, image })
        });
        const data = await res.json();

        if (data.success) {
            showAdminToast(`✅ ${data.message || 'تم إنشاء المنتج'}`, 'success');
            closeAddManualModal();
            loadInventory();
        } else {
            throw new Error(data.message || 'فشل إنشاء المنتج');
        }
    } catch (err) {
        document.getElementById('saveBtnText').classList.remove('hidden');
        document.getElementById('saveBtnLoading').classList.add('hidden');
        document.getElementById('saveAddManualBtn').disabled = false;
        showAdminToast(`❌ ${err.message || 'حدث خطأ'}`, 'error');
    }
}

// ======================================================
//  CSV Import
// ======================================================

async function importCsvData() {
    const fileInput = document.getElementById('csvFileInput');
    const textInput = document.getElementById('csvTextInput');
    let csvData = textInput.value.trim();

    if (fileInput.files.length > 0) {
        csvData = await fileInput.files[0].text();
    }

    if (!csvData) {
        showAdminToast('❌ يرجى اختيار ملف أو لصق بيانات CSV', 'error');
        return;
    }

    try {
        const csrfToken = await ensureAdminCsrfToken();
        const res = await fetch('/api/admin/inventory/import', {
            method: 'POST', credentials: 'include',
            headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' }),
            body: JSON.stringify({ csvData })
        });
        const data = await res.json();
        if (data.success) {
            showAdminToast(`✅ ${data.message}`, 'success');
            closeModal(document.getElementById('importCsvModal'));
            loadInventory();
        } else {
            showAdminToast(`❌ ${data.message}`, 'error');
        }
    } catch (_) {
        showAdminToast('❌ فشل استيراد البيانات', 'error');
    }
}

// ======================================================
//  إدارة الأقسام (Categories)
// ======================================================

async function loadCategories() {
    const tbody = document.getElementById('categoryList');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell"><span class="spinner"></span> جاري تحميل الأقسام...</td></tr>`;

    try {
        const res = await fetch('/api/admin/categories', { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (!data.success) {
            tbody.innerHTML = `<tr><td colspan="6" class="error-cell">❌ فشل تحميل الأقسام</td></tr>`;
            return;
        }

        const categories = data.categories || [];
        _allCategories = categories;
        tbody.innerHTML = '';

        if (categories.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">لا توجد أقسام بعد</td></tr>`;
            return;
        }

        tbody.innerHTML = categories.map(cat => {
            const titleAr = escapeHtml(cat.title?.ar || '—');
            const titleEn = escapeHtml(cat.title?.en || '—');
            return `
                <tr>
                    <td><span class="badge badge-accent">${escapeHtml(cat.key)}</span></td>
                    <td>${titleAr}</td>
                    <td>${titleEn}</td>
                    <td>${Number(cat.order) || 0}</td>
                    <td><span class="badge ${cat.isActive ? 'badge-success' : 'badge-danger'}">${cat.isActive ? 'نشط' : 'غير نشط'}</span></td>
                    <td>
                        <div class="action-btns-group">
                            <button class="action-icon btn-edit" onclick="editCategory('${cat._id}')" title="تعديل"><i class="fas fa-edit"></i></button>
                            <button class="action-icon btn-delete" onclick="deleteCategory('${cat._id}')" title="حذف"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (_err) {
        tbody.innerHTML = `<tr><td colspan="6" class="error-cell">❌ فشل الاتصال بالسيرفر.</td></tr>`;
    }
}

function openAddCategoryModal() {
    document.getElementById('categoryModalTitle').innerHTML = '<i class="fas fa-tag"></i> إضافة قسم جديد';
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryKey').value = '';
    document.getElementById('categoryTitleAr').value = '';
    document.getElementById('categoryTitleEn').value = '';
    document.getElementById('categoryDescAr').value = '';
    document.getElementById('categoryDescEn').value = '';
    document.getElementById('categoryImage').value = '';
    const categoryImageFile = document.getElementById('categoryImageFile');
    if (categoryImageFile) categoryImageFile.value = '';
    const categoryImagePreview = document.getElementById('categoryImagePreview');
    if (categoryImagePreview) categoryImagePreview.style.display = 'none';
    document.getElementById('categoryOrder').value = '0';
    openModal(document.getElementById('categoryModal'));
}

async function saveCategoryHandler() {
    const categoryId = document.getElementById('categoryId').value;
    const key = document.getElementById('categoryKey').value.trim();
    const titleAr = document.getElementById('categoryTitleAr').value.trim();
    const titleEn = document.getElementById('categoryTitleEn').value.trim();
    const descriptionAr = document.getElementById('categoryDescAr').value.trim();
    const descriptionEn = document.getElementById('categoryDescEn').value.trim();
    let image = document.getElementById('categoryImage').value.trim();
    const order = parseInt(document.getElementById('categoryOrder').value) || 0;

    if (!key || !titleAr || !titleEn) {
        showAdminToast('❌ المفتاح والعنوان مطلوبان', 'error');
        return;
    }

    try {
        image = await uploadImageIfAny(document.getElementById('categoryImageFile'), image);
        const csrfToken = await ensureAdminCsrfToken();
        let res;

        if (categoryId) {
            // Update
            res = await fetch(`/api/admin/categories/${categoryId}`, {
                method: 'PATCH', credentials: 'include',
                headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' }),
                body: JSON.stringify({ key, titleAr, titleEn, descriptionAr, descriptionEn, image, order })
            });
        } else {
            // Create
            res = await fetch('/api/admin/categories', {
                method: 'POST', credentials: 'include',
                headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' }),
                body: JSON.stringify({ key, titleAr, titleEn, descriptionAr, descriptionEn, image, order })
            });
        }

        const data = await res.json();
        if (data.success) {
            showAdminToast(`✅ ${data.message}`, 'success');
            closeModal(document.getElementById('categoryModal'));
            loadCategories();
        } else {
            showAdminToast(`❌ ${data.message}`, 'error');
        }
    } catch (_) {
        showAdminToast('❌ فشل حفظ القسم', 'error');
    }
}

// eslint-disable-next-line no-unused-vars
async function editCategory(categoryId) {
    try {
        const res = await fetch('/api/admin/categories', { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        const categories = data.categories || [];
        const cat = categories.find(c => c._id === categoryId);
        if (!cat) { showAdminToast('❌ القسم غير موجود', 'error'); return; }

        document.getElementById('categoryModalTitle').innerHTML = '<i class="fas fa-edit"></i> تعديل القسم';
        document.getElementById('categoryId').value = cat._id;
        document.getElementById('categoryKey').value = cat.key || '';
        document.getElementById('categoryTitleAr').value = cat.title?.ar || '';
        document.getElementById('categoryTitleEn').value = cat.title?.en || '';
        document.getElementById('categoryDescAr').value = cat.description?.ar || '';
        document.getElementById('categoryDescEn').value = cat.description?.en || '';
        document.getElementById('categoryImage').value = cat.image || '';
        const categoryImagePreview = document.getElementById('categoryImagePreview');
        if (categoryImagePreview) {
            categoryImagePreview.src = cat.image || '';
            categoryImagePreview.style.display = cat.image ? 'inline-block' : 'none';
        }
        const categoryImageFile = document.getElementById('categoryImageFile');
        if (categoryImageFile) categoryImageFile.value = '';
        document.getElementById('categoryOrder').value = cat.order || 0;
        openModal(document.getElementById('categoryModal'));
    } catch (_) {
        showAdminToast('❌ فشل تحميل بيانات القسم', 'error');
    }
}

// eslint-disable-next-line no-unused-vars
async function deleteCategory(categoryId) {
    const cat = _allCategories.find(c => c._id === categoryId);
    const name = cat?.title?.ar || cat?.title?.en || '';
    if (!confirm(`هل أنت متأكد من حذف القسم: ${name}؟`)) return;
    try {
        const csrfToken = await ensureAdminCsrfToken();
        const res = await fetch(`/api/admin/categories/${categoryId}`, {
            method: 'DELETE', credentials: 'include',
            headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' })
        });
        const data = await res.json();
        if (data.success) {
            showAdminToast('🗑️ تم حذف القسم', 'success');
            loadCategories();
        } else {
            showAdminToast(`❌ ${data.message}`, 'error');
        }
    } catch (_) {
        showAdminToast('❌ فشل حذف القسم', 'error');
    }
}

// ======================================================
//  السجلات (Logs)
// ======================================================

async function loadLogs() {
    const container = document.getElementById('logsContainer');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);"><span class="spinner"></span> جاري تحميل السجلات...</div>';

    try {
        const res = await fetch('/api/admin/logs', { credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (!data.success || !data.logs) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">لا توجد سجلات</div>';
            return;
        }

        const { logs } = data;
        if (logs.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">لا توجد سجلات</div>';
            return;
        }

        container.innerHTML = logs.map(log => `
            <div class="log-entry">
                <span class="log-action">${escapeHtml(log.action)}</span>
                <span class="log-details">${escapeHtml(log.details || '')} ${log.targetName ? `— ${escapeHtml(log.targetName)}` : ''}</span>
                <span class="log-time">${escapeHtml(new Date(log.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }))}</span>
            </div>
        `).join('');
    } catch (_) {
        container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">فشل تحميل السجلات</div>';
    }
}

async function clearAllLogs() {
    if (!confirm('هل أنت متأكد من مسح جميع السجلات؟')) return;
    try {
        const csrfToken = await ensureAdminCsrfToken();
        const res = await fetch('/api/admin/logs', {
            method: 'DELETE', credentials: 'include',
            headers: buildJsonHeaders({ 'X-CSRF-Token': csrfToken || '' })
        });
        const data = await res.json();
        if (data.success) {
            showAdminToast('🗑️ تم مسح السجلات', 'success');
            loadLogs();
        } else {
            showAdminToast('❌ فشل مسح السجلات', 'error');
        }
    } catch (_) {
        showAdminToast('❌ فشل الاتصال بالسيرفر', 'error');
    }
}
