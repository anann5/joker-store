// realtime.js — إشعارات لحظية (WebSocket) لعملاء Joker Store المسجلين.
// يتصل بمآخذ الخادم عند تسجيل الدخول فقط، ويستمع لأحداث `order_status`
// لعرض إشعار فوري عند اكتمال/رفض الطلب دون حاجة لتحديث يدوي.
import { getCurrentUser, showOrderHistory } from './auth.js';
import { showToast } from './ui.js';
import { t } from './i18n.js';

let socket = null;

/**
 * تحويل حالة الطلب المستقبلة عن طريق WS إلى رسالة مترجمة.
 */
function buildStatusMessage(payload) {
    const { status, orderId } = payload || {};
    if (status === 'completed') {
        return t('realtime_order_completed').replace('{orderId}', orderId || '');
    }
    if (status === 'refunded') {
        return t('realtime_order_rejected').replace('{orderId}', orderId || '');
    }
    return t('realtime_order_updated').replace('{orderId}', orderId || '');
}

/**
 * اختيار نوع الإشعار (تلوين toast) حسب حالة الطلب.
 */
function toastTypeFor(status) {
    if (status === 'completed') return 'success';
    if (status === 'refunded') return 'error';
    return 'info';
}

/**
 * إن كانت نافذة سجل الطلبات مفتوحة نعيد تحميلها للحصول على البيانات الجديدة،
 * ونطلق حدثاً للواجهة كي تنعش نافذة التتبع إن كانت معنية بالطلب المتأثر.
 */
function refreshOpenOrderViews(payload) {
    const historyModal = document.getElementById('orderHistoryModal');
    if (historyModal && historyModal.classList.contains('active')) {
        showOrderHistory();
    }
    window.dispatchEvent(new CustomEvent('joker-order-status', {
        detail: {
            orderId: payload && payload.orderId,
            status: payload && payload.status
        }
    }));
}

/**
 * تهيئة اتصال الأحداث اللحظية (قابلة لإعادة الاستدعاء عند تسجيل الدخول).
 * - تعمل فقط عندما يكون window.io متاحاً والمستخدم مسجلاً الدخول.
 * - idempotent: تُغلق أي مآخذ سابقة قبل إنشاء اتصال جديد.
 */
export function initRealtime() {
    if (typeof window === 'undefined' || !window.io || !getCurrentUser()) {
        return null;
    }

    if (socket) {
        socket.disconnect();
        socket = null;
    }

    socket = window.io(window.location.origin, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 3000
    });

    socket.on('order_status', (payload) => {
        const status = payload && payload.status;
        showToast(buildStatusMessage(payload), toastTypeFor(status));
        refreshOpenOrderViews(payload);
    });

    // صامتة: لا نزعج المستخدم عند انقطاع الاتصال أو فشله
    socket.on('disconnect', () => {});
    socket.on('connect_error', () => {});

    return socket;
}

let publicSocket = null;
export function initPublicPulse(){
    if(typeof window==='undefined' || !window.io) return null;
    if(publicSocket) return publicSocket;
    publicSocket = window.io(window.location.origin, { transports:['websocket','polling'], reconnection:true, reconnectionDelay:5000 });
    publicSocket.on('order_completed', (payload)=>{
        const name = payload?.productName ? String(payload.productName).slice(0,40) : t('social_proof_product');
        // احترام تفضيل تقليل الحركة — لا نبض إن طلبه المستخدم
        if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        showToast(`${t('social_proof_now')} — ${name}`, 'success');
    });
    publicSocket.on('disconnect', ()=>{});
    publicSocket.on('connect_error', ()=>{});
    return publicSocket;
}

/**
 * إغلاق الاتصال الحالي (يُستدعى عند تسجيل الخروج).
 */
export function destroyRealtime() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}