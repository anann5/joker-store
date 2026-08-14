const { Product, Category } = require('../models');
const siteSettings = require('../config/siteSettings');

const STATIC_PAGES = [
    { path: '', ar: 'الرئيسية', en: 'Home' },
    { path: 'about', ar: 'من نحن', en: 'About' },
    { path: 'faq', ar: 'الأسئلة الشائعة', en: 'FAQ' },
    { path: 'contact', ar: 'تواصل معنا', en: 'Contact' },
    { path: 'privacy', ar: 'سياسة الخصوصية', en: 'Privacy Policy' },
    { path: 'terms', ar: 'الشروط والأحكام', en: 'Terms' }
];

/**
 * عنوان الموقع الأساسي من SITE_URL (بدون شرطة مائلة خلفية).
 */
function getBaseUrl() {
    return String(process.env.SITE_URL || '').replace(/\/+$/, '');
}

/**
 * خريطة موقع XML ديناميكية مبنية من قاعدة البيانات.
 * تغطي: الصفحات الثابتة، الأقسام، والمنتجات النشطة — باللغتين (ar/en) مع hreflang.
 */
exports.sitemapXml = async (_req, res) => {
    try {
        const baseUrl = getBaseUrl();
        // بدون عنوان قاعدة صريح لا يمكننا توليد روابط مطلقة موثوقة
        if (!baseUrl) {
            return res.status(503)
                .type('text/plain')
                .send('SITEMAP_DISABLED: SITE_URL is not configured');
        }

        const [products, categories] = await Promise.all([
            Product.find({ isActive: true })
                .select('category updatedAt')
                .sort({ createdAt: -1 })
                .lean(),
            Category.find({ isActive: true }).select('key').lean()
        ]);

        const urls = [];
        const now = new Date().toISOString().slice(0, 10);

        // الصفحات الثابتة (بدون /product/ داخلية لأنها SPA)
        STATIC_PAGES.forEach((page) => {
            urls.push(`
  <url>
    <loc>${xmlEscape(`${baseUrl}/${page.path}`)}</loc>
    <lastmod>${now}</lastmod>
    <priority>${page.path === '' ? '1.0' : '0.7'}</priority>
  </url>`);
        });

        // الأقسام
        categories.forEach((cat) => {
            urls.push(`
  <url>
    <loc>${xmlEscape(`${baseUrl}/#category-${cat.key}`)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
        });

        // المنتجات
        products.forEach((product) => {
            const lastmod = product.updatedAt
                ? new Date(product.updatedAt).toISOString().slice(0, 10)
                : now;
            urls.push(`
  <url>
    <loc>${xmlEscape(`${baseUrl}/product/${product._id}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`);
        });

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <!-- سايت ماب مولّد تلقائياً — عدد الروابط: ${urls.length} -->${urls.join('')}
</urlset>`;

        res.type('application/xml').send(xml);
    } catch (err) {
        console.error('Sitemap generation error:', err);
        res.status(500).type('text/plain').send('SITEMAP_ERROR');
    }
};

/**
 * ملف robots.txt — يسمح بالزحف ويشير إلى خريطة الموقع.
 */
exports.robotsTxt = (_req, res) => {
    const baseUrl = getBaseUrl();
    let body = 'User-agent: *\nAllow: /\n';
    body += 'Disallow: /api/\n';
    body += 'Disallow: /admin\n';
    body += 'Disallow: /login\n';

    if (baseUrl) {
        body += `\nSitemap: ${baseUrl}/sitemap.xml\n`;
    }

    res.type('text/plain').send(body);
};

/**
 * JSON-LD Schema.org للمنتج — يُستخدم لواجهة تفاصيل المنتج.
 */
exports.productSchema = async (req, res) => {
    try {
        const { productId } = req.params;
        if (!productId || !/^[a-fA-F0-9]{24}$/.test(productId)) {
            return res.status(400).json({ success: false, error: 'معرف منتج غير صالح' });
        }

        const product = await Product.findById(productId);
        if (!product || !product.isActive) {
            return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
        }

        const name = product.productName.ar || product.productName.en;
        const baseUrl = getBaseUrl();
        const price = Number(product.price);

        const schema = {
            '@context': 'https://schema.org',
            '@type': 'Product',
            'name': name,
            'image': product.image ? xmlEscape(String(product.image)) : undefined,
            'description': String(product.description.ar || product.description.en || ''),
            'sku': String(product._id),
            'brand': { '@type': 'Brand', 'name': siteSettings.name || 'Joker Store' },
            'offers': {
                '@type': 'Offer',
                'priceCurrency': siteSettings.currency.code,
                'price': Number.isFinite(price) && price > 0 ? price : undefined,
                'availability': 'https://schema.org/InStock',
                'url': baseUrl ? `${baseUrl}/product/${product._id}` : undefined
            }
        };

        res.json({ success: true, schema });
    } catch (err) {
        console.error('Product schema error:', err);
        res.status(500).json({ success: false, error: 'فشل في توليد بيانات المنتج' });
    }
};

function xmlEscape(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}