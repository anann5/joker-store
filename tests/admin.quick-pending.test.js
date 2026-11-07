// اختبارات بطاقة الطلبات المعلقة السريعة والتنبيه الصوتي:
//   - البطاقة موجودة في لوحة الإحصائيات مع عدّاد وزر عرض الكل
//   - أزرار الاعتماد/الرفض السريعة يستخدم نفس data-action
//   - التنبيه يعمل محلياً (WebAudio) مع اهتزاز وحفظ التفضيل
//   - زر الصوت العام في الترويسة يزامن تبديل المخزون

const fs = require('fs');
const path = require('path');

const ADMIN_HTML = path.join(__dirname, '..', 'private', 'admin.html');
const ADMIN_CSS = path.join(__dirname, '..', 'private', 'admin-style.css');
const ADMIN_JS = path.join(__dirname, '..', 'private', 'admin.js');

const html = fs.readFileSync(ADMIN_HTML, 'utf8');
const css = fs.readFileSync(ADMIN_CSS, 'utf8');
const js = fs.readFileSync(ADMIN_JS, 'utf8');

describe('Quick pending card: markup', () => {
    it('يوجد بطاقة في لوحة الإحصائيات بعد شبكة الإحصائيات', () => {
        expect(html).toContain('id="quickPendingCard"');
        expect(html).toContain('id="quickPendingList"');
        expect(html).toContain('id="quickPendingCount"');
        expect(html).toContain('id="quickPendingViewAll"');
        // البطاقة داخل قسم لوحة الإحصائيات
        const dashIdx = html.indexOf('id="dashboardSection"');
        const cardIdx = html.indexOf('id="quickPendingCard"');
        const inventoryIdx = html.indexOf('id="inventorySection"');
        expect(cardIdx).toBeGreaterThan(dashIdx);
        expect(cardIdx).toBeLessThan(inventoryIdx);
    });
});

describe('Quick pending card: styles (كل الأجهزة)', () => {
    it('يعرض شارة بعدّاد ويُبرز البطاقة عند وجود معلق', () => {
        expect(css).toContain('.quick-pending-card');
        expect(css).toContain('.pending-badge');
        expect(css).toContain('.has-pending');
    });

    it('أزرار الاعتماد/الرفض بارتفاع 44px فأكثر', () => {
        expect(css).toContain('.quick-order-actions .btn');
        expect(css).toContain('min-height: 44px');
    });

    it('يومض عند وصول طلب جديد (flash)', () => {
        expect(css).toContain('.flash');
        expect(css).toContain('quickPendingFlash');
    });
});

describe('Quick pending card: logic', () => {
    it('يجلب الطلبات المعلقة فقط من API', () => {
        expect(js).toContain('loadQuickPending');
        expect(js).toContain('/api/admin/orders?status=pending&limit=20');
    });

    it('يعرض أزرار اعتماد/رفض عبر data-action الموجودة', () => {
        expect(js).toContain('data-action="approve-order"');
        expect(js).toContain('data-action="reject-order"');
        expect(js).toContain('data-order-id=');
    });

    it('يُستدعى تلقائياً عند تحميل لوحة الإحصائيات', () => {
        expect(js).toContain('loadQuickPending();');
    });

    it('«عرض الكل» يفتح تبويب الطلبات على فلتر معلق', () => {
        expect(js).toContain('quickPendingViewAll');
        expect(js).toContain("_ordersFilter = 'pending'");
        expect(js).toContain("chip.dataset.status === 'pending'");
    });
});

describe('Sound alert: WebAudio + vibrate + persistence', () => {
    it('يُستخدم WebAudio مولّد محلياً بدون ملف خارجي أساسي', () => {
        expect(js).toContain('AudioContext');
        expect(js).toContain('createOscillator');
        expect(js).toContain('createGain');
    });

    it('يهتز الجوال عند وصول طلب', () => {
        expect(js).toContain('navigator.vibrate');
    });

    it('يحفظ تفضيل الصوت في الجهاز', () => {
        expect(js).toContain('admin_sound_enabled');
        expect(js).toContain('localStorage');
    });

    it('زر الترويسة العام يُزامن مع تبديل المخزون', () => {
        expect(html).toContain('id="soundToggleGlobalBtn"');
        expect(js).toContain('soundToggleGlobalBtn');
        expect(js).toContain('setSoundEnabled');
        expect(js).toContain('updateSoundIcon');
    });

    it('يُفتح AudioContext عند أول تفاعل (سياسة الجوال)', () => {
        expect(js).toContain('pointerdown');
        expect(js).toContain('_audioContext.resume');
    });

    it('الوافي يفعل flashQuickPendingCard عند new_order', () => {
        expect(js).toContain('flashQuickPendingCard');
        expect(js).toContain("socket.on('new_order'");
    });
});
