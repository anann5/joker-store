// خادم ملفات ثابت صغير لاختبارات E2E — يخدم public/ دون قاعدة بيانات.
// الهدف: فحص إمكانية الوصول والتخطيط وموافقة الكوكيز بسرعة وثبات في CI.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number.parseInt(process.env.E2E_STATIC_PORT, 10) || 4173;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

/**
 * يحوّل مسار الطلب إلى ملف داخل public بأمان (يمنع الخروج من المجلد).
 * @param {string} urlPath - مسار الرابط.
 * @returns {string|null}
 */
function resolveFile(urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    const relative = decoded.replace(/^\/+/, '');
    const candidates = [
        relative,
        `${relative}.html`,
        path.join(relative, 'index.html')
    ];
    for (const candidate of candidates) {
        const full = path.resolve(PUBLIC_DIR, candidate || 'index.html');
        if (!full.startsWith(PUBLIC_DIR)) continue;
        if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    }
    return null;
}

const server = http.createServer((req, res) => {
    const file = resolveFile(req.url || '/');
    if (!file) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`static server on http://127.0.0.1:${PORT}`);
});
