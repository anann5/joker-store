// اختبارات إمكانية الوصول: رابط التخطي، axe، وعدم وجود تمرير أفقي.

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const CONSENT_KEY = 'joker_consent_v1';

/**
 * يمنع ظهور بانر الكوكيز أثناء اختبارات أخرى.
 * @param {import('@playwright/test').Page} page - الصفحة.
 * @returns {Promise<void>}
 */
async function skipBanner(page) {
    await page.addInitScript(({ key }) => {
        localStorage.setItem(key, JSON.stringify({
            version: 1,
            necessary: true,
            analytics: false,
            marketing: false,
            choice: 'rejected',
            ts: Date.now()
        }));
    }, { key: CONSENT_KEY });
}

test.describe('accessibility', () => {
    test('skip link is the first tab stop and jumps to main content', async ({ page }) => {
        await skipBanner(page);
        await page.goto('/');
        await page.locator('header').waitFor();

        await page.keyboard.press('Tab');
        const first = await page.evaluate(() => ({
            href: document.activeElement.getAttribute('href'),
            className: document.activeElement.className
        }));
        expect(first.className).toContain('skip-link');
        expect(first.href).toBe('#main-content');

        await page.keyboard.press('Enter');
        const after = await page.evaluate(() => ({
            hash: window.location.hash,
            activeId: document.activeElement.id
        }));
        expect(after.hash).toBe('#main-content');
        expect(after.activeId).toBe('main-content');
    });

    test('has no serious or critical axe violations on the home page', async ({ page }) => {
        await skipBanner(page);
        await page.goto('/');
        await page.locator('footer').waitFor();

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();

        const blocking = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact));
        const summary = blocking.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            targets: violation.nodes.slice(0, 5).map((node) => node.target.join(' '))
        }));
        expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
    });

    test('page never scrolls horizontally at common widths', async ({ page }) => {
        await skipBanner(page);
        await page.goto('/');
        await page.locator('footer').waitFor();

        for (const width of [320, 360, 390, 414, 768, 1024, 1280, 1440]) {
            await page.setViewportSize({ width, height: 800 });
            const overflow = await page.evaluate(() => {
                const root = document.documentElement;
                return root.scrollWidth - root.clientWidth;
            });
            expect({ width, overflow }).toEqual({ width, overflow: 0 });
        }
    });

    test('mobile menu opens and closes without breaking the layout', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'mobile-chromium', 'زر القائمة يظهر على الجوال فقط');
        await skipBanner(page);
        await page.goto('/');
        await page.locator('#mobileMenuBtn').waitFor();

        const button = page.locator('#mobileMenuBtn');
        await button.click();
        await expect(button).toHaveAttribute('aria-expanded', 'true');
        await button.click();
        await expect(button).toHaveAttribute('aria-expanded', 'false');
    });
});

test.describe('language', () => {
    test('English version switches direction and translates the header', async ({ page }) => {
        await skipBanner(page);
        await page.goto('/?lang=en');
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
        await expect(page.locator('footer')).toContainText(/privacy|Privacy|Cookie/i);
    });
});
