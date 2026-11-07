// إعداد Playwright لاختبارات الواجهة (E2E) وإمكانية الوصول.
// - يعمل على خادم ملفات ثابت بلا قاعدة بيانات، لذا سريع وثابت في CI.
// - لتشغيله محلياً: npm run test:e2e (يتطلب npx playwright install chromium مرة واحدة).

const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_STATIC_PORT || 4173;

module.exports = defineConfig({
    testDir: './e2e',
    timeout: 30000,
    expect: { timeout: 7000 },
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? [['github'], ['list']] : [['list']],
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    projects: [
        {
            name: 'desktop-chromium',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
        },
        {
            name: 'mobile-chromium',
            use: { ...devices['Pixel 7'] }
        }
    ],
    webServer: {
        command: 'node e2e/static-server.js',
        url: `http://127.0.0.1:${PORT}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 20000
    }
});
