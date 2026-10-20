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
5. Render يمرر كل الطلبات عبر Cloudflare، لذا `req.ip` يساوي IP الوكيل المشترك وليس الزائر.
   - يقرأ `middleware/clientIp.js` عنوان `CF-Connecting-IP` ويضبط `req.clientIp` قبل أي rate limiter.
   - كل حدود المعدّل وقفل الدخول وبصمة جلسة الأدمن مبنية على هذا العنوان.
   - `app.set('trust proxy', 1)` باقٍ فقط لمعرفة البروتوكول (`req.secure`).
6. استخدم ملف [render.yaml](render.yaml) كإعداد جاهز.
7. فعّل التحقق الثنائي (2FA): `node scripts/generate-totp.js` ثم أضف `ADMIN_TOTP_SECRET` في متغيرات Render.

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

## هيكل المشروع
- server.js: نقطة دخول التطبيق
- app.js: إعداد Express والـ middleware
- routes/: تعريف المسارات العامة والإدارية
- controllers/: المنطق التجاري والعمليات
- middleware/: حماية، مصادقة، وسجلات الأمان
- public/: الواجهة الأمامية العامة
- private/: واجهة الأدمن المحمية
- tests/: اختبارات API والـ CSRF

## التحقق الثنائي (2FA)
1. شغّل `node scripts/generate-totp.js` واحتفظ بالسر المعروض.
2. أضف `ADMIN_TOTP_SECRET` في متغيرات Render (وفي `.env` محلياً عند الحاجة).
3. أضف الحساب في Google Authenticator عبر مفتاح الإعداد أو رابط `otpauth://`.
4. بعد إعادة النشر سيُطلب رمز 6 أرقام مع كلمة المرور، وتُحتسب المحاولات الخاطئة ضمن قفل الدخول.

## النسخ الاحتياطي والمراقبة
- نسخ احتياطي يومي: [backup.yml](.github/workflows/backup.yml) يشغّل `mongodump` ويرفع أرشيفاً مضغوطاً كـ Artifact لمدة 30 يوماً.
  - أضف سرّ المستودع `MONGODB_URI` (Settings → Secrets and variables → Actions).
  - يجب أن يسمح Atlas لعناوين GitHub Actions (عادةً `0.0.0.0/0`).
  - للاستعادة: `mongorestore --uri="$MONGODB_URI" --gzip --archive=joker-store.gz`.
- مراقبة كل 10 دقائق: [uptime.yml](.github/workflows/uptime.yml) يفحص `/health` ويرسل تنبيهاً على تيليجرام عند الفشل.
  - أضف السرّين `TELEGRAM_BOT_TOKEN` و `TELEGRAM_CHAT_ID` (اختياري).
  - الفحص الدوري يقلل أيضاً من سبات Render المجاني.

## ملاحظات إنتاجية
- استخدم HTTPS دائماً في الإنتاج.
- لا تشارك قيم `.env` أو مفاتيح الحسابات.
- راقب السجلات والخدمة بعد النشر.
