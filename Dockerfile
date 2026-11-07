# صورة إنتاج متجر الجوكر (كور مضاعف: تثبيت الأنسب فقط ثم نسخ الكود)
# البناء: npm ci --omit=dev (لا نثبّت أدوات التطوير في المرحلة النهائية)
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY . .

# تشغيل التطبيق بمستخدم غير متميز (بلا صلاحيات root)
# مجلدات الرفع تُنشأ مسبقاً بملكية مستخدم التطبيق حتى تعمل أحجام Docker
# المسماة (named volumes) في docker-compose دون أخطاء صلاحيات.
RUN addgroup -S app && adduser -S -G app app \
    && mkdir -p public/uploads private/uploads/payments \
    && chown -R app:app /app
USER app

EXPOSE 5850
# فحص صحة للـ orchestrator/لوحة السحابة (يتبع متغير PORT إن وُجد)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- "http://localhost:${PORT:-5850}/health" || exit 1

CMD ["node", "server.js"]