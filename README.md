# Joker Store

متجر إلكتروني يدعم عرض المنتجات، السلة، الدفع، وإدارة الأدمن. المشروع مبني بـ Node.js + Express + MongoDB وموجه لخدمة متجر بطاقات رقمية وألعاب.

## المتطلبات
- Node.js 22+
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
   - على VPS بلا Cloudflare اضبط `TRUST_CF_CONNECTING_IP=false` لمنع تزوير الترويسة.
   - `app.set('trust proxy', 1)` باقٍ فقط لمعرفة البروتوكول (`req.secure`).
6. استخدم ملف [render.yaml](render.yaml) كإعداد جاهز.
7. فعّل التحقق الثنائي (2FA): `node scripts/generate-totp.js` ثم أضف `ADMIN_TOTP_SECRET` في متغيرات Render.

## النشر باستخدام Docker
```bash
docker build -t joker-store .
docker run -p 5850:5850 --env-file .env joker-store
```

للنشر على خادم خاص مع HTTPS تلقائي، استخدم `docker-compose.yml` و`Caddyfile`:
```bash
cp .env.example .env   # املأ DOMAIN وSITE_URL وAPP_URL وبقية القيم
docker compose up -d --build
```
التفاصيل الكاملة في [DEPLOYMENT.md](DEPLOYMENT.md#migrating-from-render-to-a-private-vps).

## متغيرات البيئة الأساسية
- `PORT`
- `NODE_ENV`
- `SITE_URL` (أصل الموقع العام: CSP/CORS/Socket.IO/روابط البريد وsitemap)
- `APP_URL` (عنوان المتجر داخل تطبيق الأندرويد؛ يرجع إلى `SITE_URL` إن تُرك فارغاً)
- `DOMAIN` (نطاق الاستضافة الخاصة مع docker-compose/Caddy)
- `TRUST_CF_CONNECTING_IP` (`false` على VPS بلا Cloudflare)
- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_USER_SECRET`
- `ADMIN_PASSWORD_HASH`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## النطاق المخصص وكاش Cloudflare
1. Render → Settings → Custom Domains → أضف النطاق واحصل على هدف CNAME.
2. Cloudflare → DNS → أضف CNAME (Proxy مفعّل) إلى هدف Render، ثم SSL/TLS → Full (strict).
3. Render → Environment → `SITE_URL=https://<domain>` (يُستخدم في canonical وCSP وSocket).
4. Cache Rules: كاش لـ `/image/*` و `/vendor/*` (Edge TTL: شهر)، وBypass لـ `/api/*` و `/admin*` و `/login*`. لا تفعّل Cache Everything على HTML.
5. حدّث `SITE_URL` و`APP_URL` (في لوحة Render/الاستضافة وفي Settings → Variables على GitHub) ثم أعد بناء APK — لم يعد هناك رابط ثابت داخل `capacitor.config.js` بعد الآن.

## تفعيل مزوّد أو الدفع التلقائي
- المزوّدون: املأ `PROVIDER_1_*` (انظر [.env.example](.env.example)) ثم `PROVIDERS_COUNT=1` وأعد النشر، ثم اضغط «مزامنة» من لوحة الأدمن. يتطلب API key وBase URL ومسارات items/balance/purchase وطريقة المصادقة.
- الدفع التلقائي غير مفعّل حالياً (التحويل يدوي). يتطلب من مزوّد الدفع: merchant ID وAPI key/secret وwebhook URL ووثائق API.

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
- نسخ احتياطي يومي: [backup.yml](.github/workflows/backup.yml) يشغّل `mongodump` ثم يشفّر الأرشيف (AES-256) قبل رفعه كـ Artifact لمدة 30 يوماً.
  - أضف السرّين `MONGODB_URI` و `BACKUP_PASSPHRASE` (Settings → Secrets and variables → Actions).
  - يجب أن يسمح Atlas لعناوين GitHub Actions (عادةً `0.0.0.0/0`).
  - للاستعادة: `openssl enc -d -aes-256-cbc -pbkdf2 -in joker-store.gz.enc -out joker-store.gz -pass env:BACKUP_PASSPHRASE` ثم `mongorestore --uri="$MONGODB_URI" --gzip --archive=joker-store.gz`.
- مراقبة كل 10 دقائق: [uptime.yml](.github/workflows/uptime.yml) يفحص `/health` ويرسل تنبيهاً على تيليجرام عند الفشل.
  - أضف السرّين `TELEGRAM_BOT_TOKEN` و `TELEGRAM_CHAT_ID` (اختياري).
  - عيّن المتغيّر `SITE_URL` في Settings → Variables عند تغيير النطاق (الافتراضي هو نطاق Render).
  - الفحص الدوري يقلل أيضاً من سبات Render المجاني.

## ملاحظات إنتاجية
- استخدم HTTPS دائماً في الإنتاج.
- لا تشارك قيم `.env` أو مفاتيح الحسابات.
- راقب السجلات والخدمة بعد النشر.
- حافة Cloudflare المشتركة في `onrender.com` لا تخزّن الأصول (`cf-cache-status: DYNAMIC`). لتفعيل الكاش استخدم نطاقاً مخصصاً مع حساب Cloudflare وقواعد Cache Rules لـ `/image/*` و `/vendor/*`.
