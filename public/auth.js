import { showToast, escapeHtml, updateCartUI } from './ui.js';
import { formatPrice } from './currency.js';
import { t, getCurrentLanguage } from './i18n.js';
import { openModal, closeModal } from './modals.js';
import { mergeCarts } from './shared.js';
import { cart } from './cart.js';

let currentUser = null;

function setAuthButtonLabel(label) {
    const userStateText = document.getElementById('userStateText');
    if (userStateText) {
        userStateText.textContent = label;
    }
}

/**
 * تهيئة نظام المصادقة
 */
export function initAuth() {
    const authModal = document.getElementById('authModal');
    const userAuthBtn = document.getElementById('userAuthBtn');
    const closeAuthModal = document.getElementById('closeAuthModal');
    const authTabs = document.querySelectorAll('.auth-tab-btn');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const orderHistoryBtn = document.getElementById('orderHistoryBtn');
    const closeOrderHistoryModal = document.getElementById('closeOrderHistoryModal');

    // فحوصات دفاعية للتأكد من وجود جميع العناصر الضرورية
    if (!authModal) {
        return; // توقف عن التهيئة إذا كان العنصر الحرج مفقوداً
    }
    if (!userAuthBtn) {
        // يمكن الاستمرار هنا، لكن المستخدم لن يتمكن من فتح النافذة المنبثقة عبر الزر
    }
    if (!closeAuthModal) {
        // يمكن الاستمرار، لكن المستخدم لن يتمكن من إغلاق النافذة بسهولة
    }
    if (!loginForm) {
        // لا يمكن تسجيل الدخول بدون نموذج، لكن بقية التهيئة تستمر
    }
    if (!registerForm) {
        // لا يمكن إنشاء حساب بدون نموذج، لكن بقية التهيئة تستمر
    }
    if (!logoutBtn) {
        // هذا أقل أهمية للتهيئة الأولية، لكن تسجيل الخروج لن يعمل
    }
    if (!orderHistoryBtn) {
        // لا يمكن عرض سجل الطلبات بدون الزر، لكن بقية التهيئة تستمر
    }
    if (!closeOrderHistoryModal) {
        // لا يمكن إغلاق نافذة السجل إلا بالزر، لكن بقية التهيئة تستمر
    }


    // فتح نافذة التسجيل
    userAuthBtn.addEventListener('click', () => {
        if (!currentUser) {
            openModal(authModal);
        } else {
            document.getElementById('userAccountDropdown').classList.toggle('active');
        }
    });

    // التبديل بين نماذج التسجيل والدخول
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            authTabs.forEach(el => el.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
            document.getElementById(tab.dataset.form).classList.add('active');
        });
    });

    // معالجة نماذج الإرسال
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // معالجة نافذة سجل الطلبات (الإغلاق عبر [data-close-modal] في initModalBehaviors)
    if (orderHistoryBtn) orderHistoryBtn.addEventListener('click', showOrderHistory);

    // التحقق من حالة تسجيل الدخول عند تحميل الصفحة
    checkLoginState();
}

/**
 * إظهار نافذة سجل الطلبات وجلب البيانات
 */
export async function showOrderHistory() {
    const modal = document.getElementById('orderHistoryModal');
    const listContainer = document.getElementById('orderHistoryList');

    if (!currentUser) {
        showToast(t('auth_login_required'), 'error');
        return;
    }

    openModal(modal);
    listContainer.innerHTML = `<div style="text-align: center; padding: 40px 0; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> ${t('auth_loading_orders')}</div>`;

    try {
        // الجلسة تُرسل تلقائياً عبر HttpOnly cookie
        const res = await fetch('/api/users/orders', { credentials: 'include' });
        const data = await res.json();

        if (data.success) {
            renderOrders(data.orders);
        } else {
            listContainer.innerHTML = `<div style="text-align: center; padding: 40px 0; color: #e74c3c;">❌ ${escapeHtml(data.message || t('auth_orders_error'))}</div>`;
            if (res.status === 401) {
                handleLogout(); // تسجيل الخروج إذا كانت الجلسة منتهية
            }
        }
    } catch (_err) {
        listContainer.innerHTML = `<div style="text-align: center; padding: 40px 0; color: #e74c3c;">❌ ${t('auth_orders_conn_error')}</div>`;
    }
}

/**
 * عرض الطلبات في النافذة المنبثقة
 */
function renderOrders(orders) {
    const listContainer = document.getElementById('orderHistoryList');
    if (orders.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; padding: 40px 0; color: var(--text-muted);">${t('auth_no_orders')}</div>`;
        return;
    }

    const statusMap = {
        completed: { text: t('auth_status_completed'), class: 'status-completed' },
        pending: { text: t('auth_status_pending'), class: 'status-pending' },
        failed: { text: t('auth_status_failed'), class: 'status-failed' }
    };

    listContainer.innerHTML = orders.map(order => {
        const statusInfo = statusMap[order.status] || { text: order.status, class: '' };
        const dateLocale = getCurrentLanguage() === 'en' ? 'en-US' : 'ar-EG';
        const orderDate = new Date(order.createdAt).toLocaleString(dateLocale, { dateStyle: 'medium', timeStyle: 'short' });

        // عرض الكود فقط إذا كان الطلب مكتملاً
        const codeHtml = order.status === 'completed' && order.code
            ? `<div style="background: #1a1a2e; border:1px solid #ff9f43; border-radius:8px; padding:10px; margin-top:10px; font-size: 0.9rem;">
                   <span style="color:#b9bbbe;">${t('auth_shipping_code_label')}</span>
                   <strong style="color:#ff9f43; letter-spacing:1px; user-select:all;">${escapeHtml(order.code)}</strong>
               </div>`
            : '';

        return `
            <div class="order-item">
                <div class="order-details">
                    <div style="font-weight: bold; color: #fff; margin-bottom: 8px;">
                        ${order.items.map(item => escapeHtml(item.name)).join(', ')}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">
                        <span>${t('auth_order_num')} #${escapeHtml(order.orderId)}</span> | <span>${t('auth_order_date')} ${orderDate}</span>
                    </div>
                    ${codeHtml}
                </div>
                <div style="text-align: left;">
                    <div style="font-size: 1.2rem; font-weight: bold; color: var(--primary-neon); margin-bottom: 8px;">${formatPrice(order.price)}</div>
                    <div class="order-status ${statusInfo.class}">${statusInfo.text}</div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * معالجة نموذج تسجيل الدخول
 */
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = t('auth_checking');

    try {
        const res = await fetch('/api/users/login', {
            method: 'POST',
            credentials: 'include', // استقبال الـ HttpOnly cookie
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success) {
            closeModal(document.getElementById('authModal'));
            showToast(t('auth_welcome_back'), 'success');
            await checkLoginState();
            await syncUserCart();
            // وصّل الأحداث اللحظية فور تسجيل الدخول (idempotent)
            realtimeAfterLogin();
        } else {
            showToast(`❌ ${escapeHtml(data.message)}`, 'error');
        }
    } catch (_err) {
        showToast(t('auth_error_connection'), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = t('auth_login_btn');
    }
}

/**
 * معالجة نموذج التسجيل
 */
async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = t('auth_creating');

    try {
        const res = await fetch('/api/users/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success) {
            showToast(t('auth_account_created'), 'success');
            // التبديل إلى نموذج تسجيل الدخول تلقائياً
            document.querySelector('.auth-tab-btn[data-form="loginForm"]').click();
            document.getElementById('loginEmail').value = email;
            document.getElementById('loginPassword').focus();
        } else {
            showToast(`❌ ${escapeHtml(data.message)}`, 'error');
        }
    } catch (_err) {
        showToast(t('auth_error_connection'), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = t('auth_register_btn');
    }
}

/**
 * التحقق من حالة تسجيل الدخول عبر الخادم (بدون كشف التوكن للجافاسكريبت)
 */
async function checkLoginState() {
    try {
        const res = await fetch('/api/users/me', { credentials: 'include' });
        const data = await res.json();
        if (!data.success || !data.user) throw new Error('no session');

        currentUser = { email: data.user.email, balance: data.user.balance };
        setAuthButtonLabel(t('auth_account_label'));
        const userEmailDisplay = document.getElementById('userEmailDisplay');
        if (userEmailDisplay) {
            userEmailDisplay.textContent = currentUser.email;
        }
        // مستخدم مسجّل من قبل — دمج السلة السحابية محلياً (صامت عند الفشل)
        syncUserCart();
        // وصّل الأحداث اللحظية فور معرفة حالة الدخول (idempotent)
        realtimeAfterLogin();
    } catch (_err) {
        currentUser = null;
        setAuthButtonLabel(t('auth_login_btn'));
        const userAccountDropdown = document.getElementById('userAccountDropdown');
        if (userAccountDropdown) {
            userAccountDropdown.classList.remove('active');
        }
        realtimeAfterLogout();
    }
}

/**
 * مزامنة السلة بين الجهاز الحالي والخادم (بعد تسجيل الدخول).
 * الترتيب الآمن: جلب السلة السحابية أولاً ← دمجها مع المحلية (اتحاد، أعلى كمية)
 * ← رفع النتيجة المدمجة. السلة الفارغة محلياً لا تمسح أبداً سلة الخادم.
 * أي فشل يبقى صامتاً — تبقى السلة المحلية كما هي.
 */
async function syncUserCart() {
    try {
        // 1) السلة السحابية أولاً — الخادم هو مصدر الحقيقة عبر الأجهزة
        const getRes = await fetch('/api/users/cart', { credentials: 'include' });
        const getData = await getRes.json();
        if (!getData.success) return;
        const serverCart = Array.isArray(getData.cart) ? getData.cart : [];

        // 2) ادمج المحلية والسحابية، ثم ارفع النتيجة (لا حذف)
        const merged = mergeCarts(cart, serverCart);
        if (merged.length === 0) return;

        const putRes = await fetch('/api/users/cart', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cart: merged })
        });
        if (!putRes.ok) return;

        // 3) حدّث السلة المحلية لتعكس الدمج (تُثرى عناصر الخادم بالاسم والسعر)
        const idxRes = await fetch('/api/products/search-index');
        const idxData = await idxRes.json();
        const byId = new Map();
        (Array.isArray(idxData?.products) ? idxData.products : []).forEach(p => {
            byId.set(String(p._id || p.id), p);
        });
        const lang = getCurrentLanguage();

        const next = [];
        merged.forEach(item => {
            const existing = cart.find(c => c.id === item.id);
            if (existing) {
                next.push({ ...existing, qty: Math.min(99, item.qty) });
                return;
            }
            const known = byId.get(item.id);
            if (!known) return;
            const name = typeof known.productName === 'object'
                ? (known.productName[lang] || known.productName.ar || '')
                : String(known.productName || '');
            next.push({ id: item.id, name, price: Number(known.price) || 0, qty: item.qty });
        });

        const before = cart.map(i => `${i.id}:${i.qty}`).join(',');
        cart.splice(0, cart.length, ...next);
        const after = cart.map(i => `${i.id}:${i.qty}`).join(',');
        if (before !== after) {
            localStorage.setItem('joker_cart', JSON.stringify(cart));
            updateCartUI();
        }
    } catch (_err) {
        // فشل المزامنة لا يُعطّل تجربة الشراء المحلية
    }
}

/**
 * تسجيل الخروج (يمسح الجلسة في الخادم)
 */
async function handleLogout() {
    try {
        await fetch('/api/users/logout', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (_err) {
        // نكمل حتى لو فشل الاتصال
    }
    currentUser = null;
    setAuthButtonLabel(t('auth_login_btn'));
    const userAccountDropdown = document.getElementById('userAccountDropdown');
    if (userAccountDropdown) {
        userAccountDropdown.classList.remove('active');
    }
    realtimeAfterLogout();
    showToast(t('auth_logout_success'), 'success');
}

/**
 * تفعيل الأحداث اللحظية بعد التأكد من تسجيل الدخول (تحميل ديناميكي
 * لتفادي أي دورة استيراد ثابتة بين الوحدات — الرابط idempotent).
 */
async function realtimeAfterLogin() {
    try {
        const { initRealtime } = await import('./realtime.js');
        initRealtime();
    } catch (_err) {
        // لا تُعطّل تجربة الشراء إن تعذر تحميل عميل الأحداث اللحظية
    }
}

/**
 * إيقاف الأحداث اللحظية عند تسجيل الخروج.
 */
async function realtimeAfterLogout() {
    try {
        const { destroyRealtime } = await import('./realtime.js');
        destroyRealtime();
    } catch (_err) {
        // تجاهل صامت
    }
}

/**
 * دالة مساعدة للحصول على بيانات المستخدم الحالي
 */
export const getCurrentUser = () => currentUser;
