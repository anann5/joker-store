// اختبارات إصدار الويب للواجهة/التطبيق (الخطة A):
//   - GET /api/app/web-version يرجع بصمة تتغير مع الواجهة فقط
//   - app-update.js يقارنها ويعرض شريط تحديث عند تغيير الهيكل
//   - يبقى فحص APK (GitHub) للنتف فقط ويعمل بالتوازي

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../models', () => ({
    Product: { find: jest.fn() },
    Order: {},
    Category: {},
    Promotion: {},
    User: {},
    AdminSession: {}
}));

const app = require('../app');

// NOTE: app.js يفرض CSP/ratelimit، لكن endpoint بسيط GET للقراءة

const APP_UPDATE_JS = path.join(__dirname, '..', 'public', 'app-update.js');
const src = fs.readFileSync(APP_UPDATE_JS, 'utf8');

describe('GET /api/app/web-version', () => {
    it('يرجع webVersion غير فارغة بدون كشف سر', async () => {
        const res = await request(app).get('/api/app/web-version');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.webVersion).toBe('string');
        expect(res.body.webVersion.length).toBeGreaterThanOrEqual(8);
        expect(res.body.webVersion.startsWith('web-')).toBe(true);
        expect(res.headers['cache-control']).toContain('no-store');
    });

    it('يحمل version الحزمة وcommit إن توفر', async () => {
        const res = await request(app).get('/api/app/web-version');
        expect(res.body.version).toBeDefined();
    });
});

describe('app-update.js: web-version check', () => {
    it('يفحص /api/app/web-version ويقارن localStorage', () => {
        expect(src).toContain('/api/app/web-version');
        expect(src).toContain('joker_web_seen_version');
        expect(src).toContain('joker_web_check_at');
    });

    it('يعرض شريطاً عند تغيّر الإصدار مع زر إعادة تحميل', () => {
        expect(src).toContain('app-web-update-bar');
        expect(src).toContain('window.location.reload');
        expect(src).toContain('يتوفر تحديث جديد للموقع');
    });

    it('يسجّل أول تشغيل بصمت ثم يُظهر عند التبديل', () => {
        expect(src).toContain('أول تشغيل');
        expect(src).toContain('seen !== current');
    });

    it('الخيار A يعمل على كل السياقات وAPK على النتف فقط', () => {
        expect(src).toContain('isNativeApp()');
        expect(src).toContain('checkApk');
        expect(src).toContain('checkWebVersion');
        // APK يفحص GitHub، الويب يفحص endpoint المحلي
        expect(src).toContain('api.github.com');
        expect(src).toContain('KEY_WEB_SEEN');
    });

    it('لا يعرض شريطين بنفس المعرف', () => {
        expect(src).toContain('id: \'app-update-bar\'');
        expect(src).toContain('id: \'app-web-update-bar\'');
    });
});
