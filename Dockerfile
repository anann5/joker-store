# صورة إنتاج متجر الجوكر (كور مضاعف: تثبيت الأنسب فقط ثم نسخ الكود)
# البناء: npm ci --omit=dev (لا نثبّت أدوات التطوير في المرحلة النهائية)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY . .

EXPOSE 5850
# فحص صحة للـ orchestrator/لوحة السحابة (أعدّله لو غيّرت المنفذ عبر PORT)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:5850/health || exit 1

CMD ["node", "server.js"]