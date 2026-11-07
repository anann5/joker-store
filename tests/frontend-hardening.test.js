const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const htmlFiles = fs.readdirSync(PUBLIC).filter((file) => file.endsWith('.html'));

describe('Privacy: cookie consent assets', () => {
    it('defines a versioned storage key and denies all non-essential by default', () => {
        const source = fs.readFileSync(path.join(PUBLIC, 'consent.js'), 'utf8');
        expect(source).toContain("joker_consent_v1");
        // Consent Mode v2 defaults
        expect(source).toContain('consent');
        expect(source).toContain('ad_storage');
        expect(source).toContain('analytics_storage');
        expect(source).toContain("'denied'");
    });

    it('loads the consent script on every HTML page', () => {
        for (const file of htmlFiles) {
            const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
            expect({ file, hasConsent: html.includes('/consent.js') }).toEqual({ file, hasConsent: true });
        }
    });

    it('never loads analytics scripts from index.html before consent', () => {
        const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
        expect(html).not.toContain('googletagmanager.com/gtag/js');
        expect(html).not.toContain('connect.facebook.net/en_US/fbevents.js');
    });

    it('gates analytics loading behind consent in the client module', () => {
        const analytics = fs.readFileSync(path.join(PUBLIC, 'analytics.js'), 'utf8');
        expect(analytics).toContain('JokerConsent');
        // التحميل مشروط بالموافقة، وليس عند مجرد توفر المعرّف
        expect(analytics).toContain('if (consent.analytics) loadAnalytics');
        expect(analytics).toContain('if (consent.marketing) loadMarketingPixel');
    });
});

describe('Accessibility: skip link and main landmark', () => {
    it('every page with a <main> exposes a skip link to #main-content', () => {
        for (const file of htmlFiles) {
            const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
            if (!/<main\b/i.test(html)) continue;
            expect({ file, skip: html.includes('class="skip-link"') }).toEqual({ file, skip: true });
            expect({ file, main: /id="main-content"/.test(html) }).toEqual({ file, main: true });
        }
    });

    it('provides the skip link translation in both languages', () => {
        const ar = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'ar.json'), 'utf8'));
        const en = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'en.json'), 'utf8'));
        expect(ar.skip_to_content).toBeTruthy();
        expect(en.skip_to_content).toBeTruthy();
        expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    });
});

describe('Performance: pre-built assets', () => {
    it('ships minified bundles that are meaningfully smaller than the sources', () => {
        for (const name of ['style.css', 'script.js', 'ui.js']) {
            const source = fs.statSync(path.join(PUBLIC, name)).size;
            const minifiedPath = path.join(PUBLIC, name.replace(/\.(css|js)$/, '.min.$1'));
            expect(fs.existsSync(minifiedPath)).toBe(true);
            const minified = fs.statSync(minifiedPath).size;
            expect(minified).toBeLessThan(source * 0.8);
        }
    });

    it('provides webp siblings for the heaviest static images', () => {
        for (const name of ['logo.png', 'razer.png', 'netflix.png', 'adobe.png', 'icon-512.png']) {
            const webp = path.join(PUBLIC, 'image', name.replace(/\.png$/, '.webp'));
            expect({ name, exists: fs.existsSync(webp) }).toEqual({ name, exists: true });
        }
    });

    it('declares explicit dimensions for lazy-loaded product images', () => {
        const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
        expect(html).toContain('loading="lazy"');
        expect(html).toMatch(/<img[^>]+width="\d+"[^>]+height="\d+"/);
    });
});
