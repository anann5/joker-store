// اختبارات موافقة الكوكيز: لا تتبّع قبل الموافقة، والاختيار يُحفظ ويُطبَّق.

const { test, expect } = require('@playwright/test');

const CONSENT_KEY = 'joker_consent_v1';

/**
 * يزرع اختياراً محفوظاً قبل تحميل أي سكربت.
 * @param {import('@playwright/test').Page} page - الصفحة.
 * @param {Object} choice - الاختيار.
 * @returns {Promise<void>}
 */
async function seedConsent(page, choice) {
    await page.addInitScript(({ key, value }) => {
        localStorage.setItem(key, JSON.stringify(value));
    }, {
        key: CONSENT_KEY,
        value: { version: 1, necessary: true, analytics: false, marketing: false, choice: 'rejected', ts: Date.now(), ...choice }
    });
}

test.describe('cookie consent', () => {
    test('shows the banner on first visit and loads no trackers', async ({ page }) => {
        const trackerRequests = [];
        page.on('request', (request) => {
            const url = request.url();
            if (/googletagmanager|google-analytics|facebook\.net|facebook\.com\/tr/.test(url)) {
                trackerRequests.push(url);
            }
        });

        await page.goto('/');
        const banner = page.locator('#cookieBanner');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText(/نحترم خصوصيتك|We respect your privacy/);

        // لا يجب أن يُحمَّل أي وسم قياس قبل الاختيار
        await page.waitForTimeout(1200);
        expect(trackerRequests).toEqual([]);
    });

    test('accept all is persisted and hides the banner after reload', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: /قبول الكل|Accept all/ }).click();
        await expect(page.locator('#cookieBanner')).toHaveCount(0, { timeout: 5000 });

        const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), CONSENT_KEY);
        expect(stored).toMatchObject({ analytics: true, marketing: true, choice: 'accepted', necessary: true });

        await page.reload();
        await expect(page.locator('#cookieBanner')).toHaveCount(0);
    });

    test('reject optional keeps non-essential cookies off', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: /رفض غير الضروري|Reject optional/ }).click();
        await expect(page.locator('#cookieBanner')).toHaveCount(0, { timeout: 5000 });

        const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), CONSENT_KEY);
        expect(stored).toMatchObject({ analytics: false, marketing: false, choice: 'rejected' });
    });

    test('customize saves granular choices', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: /تخصيص|Customize/ }).click();
        await page.getByRole('switch', { name: /تحليلات|Analytics/ }).check();
        await page.getByRole('button', { name: /حفظ الاختيار|Save choices/ }).click();
        await expect(page.locator('#cookieBanner')).toHaveCount(0, { timeout: 5000 });

        const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), CONSENT_KEY);
        expect(stored).toMatchObject({ analytics: true, marketing: false, choice: 'custom' });
    });

    test('footer settings reopens the banner for a saved visitor', async ({ page }) => {
        await seedConsent(page, {});
        await page.goto('/');
        await expect(page.locator('#cookieBanner')).toHaveCount(0);

        const link = page.locator('[data-cookie-settings]');
        await expect(link).toHaveCount(1);
        // شريط تثبيت التطبيق يظهر فوق الفوتر على الجوال — نغلقه قبل النقر.
        await page.evaluate(() => document.getElementById('pwaInstallClose')?.click());
        await expect(page.locator('#pwa-install-bar')).toHaveCount(0);
        await link.click();
        await expect(page.locator('#cookieBanner')).toBeVisible();
    });
});
