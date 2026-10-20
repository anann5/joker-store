const { resolveClientIp, clientIpMiddleware, rateLimitKey } = require('../middleware/clientIp');

describe('middleware/clientIp — IP الزائر خلف Cloudflare/Render', () => {
    it('يفضّل CF-Connecting-IP على بقية الترويسات', () => {
        const headers = {
            'cf-connecting-ip': '203.0.113.9',
            'true-client-ip': '198.51.100.4',
            'x-forwarded-for': '192.0.2.1, 172.71.0.1, 10.0.0.1'
        };
        expect(resolveClientIp(headers, '10.0.0.1')).toBe('203.0.113.9');
    });

    it('يرجع إلى True-Client-IP عند غياب ترويسة Cloudflare', () => {
        expect(resolveClientIp({ 'true-client-ip': '198.51.100.4' }, '10.0.0.1')).toBe('198.51.100.4');
    });

    it('يتجاهل القيم غير الصالحة ويتجنب X-Forwarded-For القابل للتزوير', () => {
        expect(resolveClientIp({ 'cf-connecting-ip': 'spoofed', 'x-forwarded-for': '1.2.3.4' }, '10.0.0.1')).toBe('10.0.0.1');
        expect(resolveClientIp({}, '')).toBe('unknown');
    });

    it('يقبل IPv6 صالحاً', () => {
        expect(resolveClientIp({ 'cf-connecting-ip': '2001:db8::1' }, '10.0.0.1')).toBe('2001:db8::1');
    });

    it('يضبط req.clientIp في الميدلوير', () => {
        const req = { headers: { 'cf-connecting-ip': '198.51.100.7' }, ip: '10.0.0.1' };
        let called = false;
        clientIpMiddleware(req, {}, () => { called = true; });
        expect(called).toBe(true);
        expect(req.clientIp).toBe('198.51.100.7');
    });

    it('يعطي مفاتيح مختلفة لزائرين مختلفين خلف نفس الوكيل', () => {
        const first = rateLimitKey({ clientIp: '198.51.100.7', ip: '10.0.0.1' });
        const second = rateLimitKey({ clientIp: '198.51.100.8', ip: '10.0.0.1' });
        expect(first).not.toBe(second);
    });

    it('يعطي نفس المفتاح لنفس الزائر', () => {
        expect(rateLimitKey({ clientIp: '198.51.100.7' }))
            .toBe(rateLimitKey({ clientIp: '198.51.100.7', ip: '10.0.0.1' }));
    });
});
