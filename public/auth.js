import { showToast } from './ui.js';
import { logout } from './logout.js';

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
    }
    if (!registerForm) {
    }
    if (!logoutBtn) {
        // هذا أقل أهمية للتهيئة الأولية، لكن تسجيل الخروج لن يعمل
    }
    if (!orderHistoryBtn) {
    }
    if (!closeOrderHistoryModal) {
    }


    // فتح نافذة التسجيل
    userAuthBtn.addEventListener('click', () => {
        if (!currentUser) {
            authModal.classList.add('active');
        } else {
            document.getElementById('userAccountDropdown').classList.toggle('active');
        }
    });

    // إغلاق نافذة التسجيل
    if (closeAuthModal) { // أضف فحصاً هنا أيضاً
        closeAuthModal.addEventListener('click', () => authModal.classList.remove('active'));
    }

    // التبديل بين نماذج التسجيل والدخول
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            authTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
            document.getElementById(tab.dataset.form).classList.add('active');
        });
    });

    // معالجة نماذج الإرسال
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // معالجة نافذة سجل الطلبات
    if (orderHistoryBtn) orderHistoryBtn.addEventListener('click', showOrderHistory);
    if (closeOrderHistoryModal) closeOrderHistoryModal.addEventListener('click', () => {
        document.getElementById('orderHistoryModal').classList.remove('active');
    });

    // التحقق من حالة تسجيل الدخول عند تحميل الصفحة
    checkLoginState();
}

/**
 * إظهار نافذة سجل الطلبات وجلب البيانات
 */
async function showOrderHistory() {
    const modal = document.getElementById('orderHistoryModal');
    const listContainer = document.getElementById('orderHistoryList');
    const token = localStorage.getItem('joker_token');

    if (!token) {
        showToast('الرجاء تسجيل الدخول أولاً لعرض طلباتك.', 'error');
        return;
    }

    modal.classList.add('active');
    listContainer.innerHTML = `<div style="text-align: center; padding: 40px 0; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> جاري تحميل سجل الطلبات...</div>`;

    try {
        const res = await fetch('/api/users/orders', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            renderOrders(data.orders);
        } else {
            listContainer.innerHTML = `<div style="text-align: center; padding: 40px 0; color: #e74c3c;">❌ ${data.message || 'فشل تحميل الطلبات.'}</div>`;
            if (data.message === "جلسة غير صالحة.") {
                handleLogout(); // تسجيل الخروج إذا كانت الجلسة منتهية
            }
        }
    } catch (_err) {
        listContainer.innerHTML = `<div style="text-align: center; padding: 40px 0; color: #e74c3c;">❌ حدث خطأ في الاتصال بالخادم.</div>`;
    }
}

/**
 * عرض الطلبات في النافذة المنبثقة
 */
function renderOrders(orders) {
    const listContainer = document.getElementById('orderHistoryList');
    if (orders.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; padding: 40px 0; color: var(--text-muted);">لم تقم بأي طلبات بعد.</div>`;
        return;
    }

    const statusMap = {
        completed: { text: 'مكتمل', class: 'status-completed' },
        pending: { text: 'قيد المراجعة', class: 'status-pending' },
        failed: { text: 'فشل', class: 'status-failed' }
    };

    listContainer.innerHTML = orders.map(order => {
        const statusInfo = statusMap[order.status] || { text: order.status, class: '' };
        const orderDate = new Date(order.createdAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
        
        // عرض الكود فقط إذا كان الطلب مكتملاً
        const codeHtml = order.status === 'completed' && order.code
            ? `<div style="background: #1a1a2e; border:1px solid #ff9f43; border-radius:8px; padding:10px; margin-top:10px; font-size: 0.9rem;">
                   <span style="color:#b9bbbe;">كود الشحن:</span>
                   <strong style="color:#ff9f43; letter-spacing:1px; user-select:all;">${order.code}</strong>
               </div>`
            : '';

        return `
            <div class="order-item">
                <div class="order-details">
                    <div style="font-weight: bold; color: #fff; margin-bottom: 8px;">
                        ${order.items.map(item => item.name).join(', ')}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">
                        <span>رقم الطلب: #${order.orderId}</span> | <span>التاريخ: ${orderDate}</span>
                    </div>
                    ${codeHtml}
                </div>
                <div style="text-align: left;">
                    <div style="font-size: 1.2rem; font-weight: bold; color: var(--primary-neon); margin-bottom: 8px;">${order.price.toFixed(2)}$</div>
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
    btn.textContent = 'جاري التحقق...';

    try {
        const res = await fetch('/api/users/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success) {
            localStorage.setItem('joker_token', data.token);
            document.getElementById('authModal').classList.remove('active');
            showToast('✅ أهلاً بعودتك!', 'success');
            checkLoginState();
        } else {
            showToast(`❌ ${data.message}`, 'error');
        }
    } catch (_err) {
        showToast('❌ حدث خطأ في الاتصال بالخادم.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'تسجيل الدخول';
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
    btn.textContent = 'جاري الإنشاء...';

    try {
        const res = await fetch('/api/users/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success) {
            showToast('✅ تم إنشاء الحساب بنجاح! يمكنك الآن تسجيل الدخول.', 'success');
            // التبديل إلى نموذج تسجيل الدخول تلقائياً
            document.querySelector('.auth-tab-btn[data-form="loginForm"]').click();
            document.getElementById('loginEmail').value = email;
            document.getElementById('loginPassword').focus();
        } else {
            showToast(`❌ ${data.message}`, 'error');
        }
    } catch (_err) {
        showToast('❌ حدث خطأ في الاتصال بالخادم.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'إنشاء حساب';
    }
}

/**
 * التحقق من حالة تسجيل الدخول وتحديث الواجهة
 */
function checkLoginState() {
    const token = localStorage.getItem('joker_token');
    if (token) {
        try {
            // فك تشفير التوكن محلياً للحصول على بيانات المستخدم
            const payload = JSON.parse(atob(token.split('.')[1]));
            currentUser = { email: payload.email };
            setAuthButtonLabel('حسابي');
            const userEmailDisplay = document.getElementById('userEmailDisplay');
            if (userEmailDisplay) {
                userEmailDisplay.textContent = currentUser.email;
            }
        } catch (_) {
            logout(); // التوكن غير صالح
        }
    } else {
        currentUser = null;
        setAuthButtonLabel('تسجيل الدخول');
        const userAccountDropdown = document.getElementById('userAccountDropdown');
        if (userAccountDropdown) {
            userAccountDropdown.classList.remove('active');
        }
    }
}

/**
 * تسجيل الخروج
 */
function handleLogout() {
    localStorage.removeItem('joker_token');
    currentUser = null;
    checkLoginState();
    showToast('تم تسجيل الخروج بنجاح.', 'success');
}

/**
 * دالة مساعدة للحصول على بيانات المستخدم الحالي
 */
export const getCurrentUser = () => currentUser;