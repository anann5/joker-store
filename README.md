# Joker Store

متجر إلكتروني يدعم عرض المنتجات، السلة، الدفع، وإدارة الأدمن. المشروع مبني بـ Node.js + Express + MongoDB وموجه لخدمة متجر بطاقات رقمية وألعاب.

## المتطلبات
- Node.js 20+
- MongoDB
- npm

## التثبيت محلياً
```bash
npm install
cp .env.example .env
# عدّل القيم داخل .env قبل التشغيل
```

## التشغيل
```bash
npm start
```

## الاختبارات
```bash
npm test -- --runInBand
```

## النشر على Render
1. اربط المستودع مع Render.
2. اختر خدمة Web Service.
3. استخدم الأمر:
   - Build Command: `npm install`
   - Start Command: `node server.js`
4. أضف المتغيرات البيئية المطلوبة مثل `MONGODB_URI`, `JWT_SECRET`, `ADMIN_PASSWORD_HASH` و `NODE_ENV=production`.
5. تأكد من أن Render يمرر رؤوس `X-Forwarded-Proto` و `X-Forwarded-For`.
   - التطبيق الآن يستخدم `app.set('trust proxy', 1)` في `app.js`.
   - هذا يحل خطأ `express-rate-limit` المتعلق بـ `X-Forwarded-For`.
6. استخدم ملف [render.yaml](render.yaml) كإعداد جاهز.

## النشر باستخدام Docker
```bash
docker build -t joker-store .
docker run -p 5850:5850 --env-file .env joker-store
```

## متغيرات البيئة الأساسية
- `PORT`
- `NODE_ENV`
- `MONGODB_URI`
- `JWT_SECRET`
- `ADMIN_PASSWORD_HASH`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `STRIPE_SECRET_KEY`

## هيكل المشروع
- server.js: نقطة دخول التطبيق
- app.js: إعداد Express والـ middleware
- routes/: تعريف المسارات العامة والإدارية
- controllers/: المنطق التجاري والعمليات
- middleware/: حماية، مصادقة، وسجلات الأمان
- public/: الواجهة الأمامية العامة
- private/: واجهة الأدمن المحمية
- tests/: اختبارات API والـ CSRF

## ملاحظات إنتاجية
- استخدم HTTPS دائماً في الإنتاج.
- لا تشارك قيم `.env` أو مفاتيح الحسابات.
- راقب السجلات والخدمة بعد النشر.
