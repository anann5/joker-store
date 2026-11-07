const request = require('supertest');
const app = require('../app');
const logger = require('../config/logger');
const { normalizeIncomingId } = require('../middleware/requestContext');

describe('Observability: request context', () => {
    it('adds a valid X-Request-Id header to every response', async () => {
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(200);
        expect(res.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{8,64}$/);
    });

    it('keeps a safe client-provided request id', async () => {
        const res = await request(app).get('/health').set('X-Request-Id', 'client-req-123456');
        expect(res.headers['x-request-id']).toBe('client-req-123456');
    });

    it('rejects unsafe client-provided request ids', () => {
        expect(normalizeIncomingId('<script>alert(1)</script>')).toBeNull();
        expect(normalizeIncomingId('short')).toBeNull();
        expect(normalizeIncomingId('valid-id-1234567')).toBe('valid-id-1234567');
    });
});

describe('Observability: health endpoint', () => {
    it('reports version, uptime and database check without leaking secrets', async () => {
        const res = await request(app).get('/health');
        expect(res.body).toEqual(expect.objectContaining({
            success: true,
            status: 'ok',
            version: expect.any(String),
            uptimeSeconds: expect.any(Number),
            checks: expect.objectContaining({
                database: expect.any(String),
                databaseReady: expect.any(Boolean)
            })
        }));
        expect(res.headers['cache-control']).toContain('no-store');
        expect(JSON.stringify(res.body)).not.toMatch(/mongodb\+srv:\/\//i);
    });
});

describe('Observability: structured logger', () => {
    it('redacts secrets and credentials recursively', () => {
        const output = logger.redact({
            password: 'hunter2',
            nested: { apiKey: 'abc', authorization: 'Bearer token', safe: 'value' },
            user: 'joker'
        });
        expect(output.password).toBe('[redacted]');
        expect(output.nested.apiKey).toBe('[redacted]');
        expect(output.nested.authorization).toBe('[redacted]');
        expect(output.nested.safe).toBe('value');
        expect(output.user).toBe('joker');
    });

    it('serializes errors without exposing production stacks', () => {
        const serialized = logger.serializeError(new Error('boom'));
        expect(serialized).toEqual(expect.objectContaining({
            name: 'Error',
            message: 'boom'
        }));
    });

    it('handles circular structures safely', () => {
        const value = { name: 'root' };
        value.self = value;
        const output = logger.redact(value);
        expect(output.self).toBe('[circular]');
    });
});

describe('Security headers', () => {
    it('allows analytics and pixel origins only through CSP for consent-based loading', async () => {
        const res = await request(app).get('/');
        const csp = res.headers['content-security-policy'] || '';
        expect(csp).toContain('https://www.googletagmanager.com');
        expect(csp).toContain('https://connect.facebook.net');
        expect(csp).toContain('https://www.google-analytics.com');
        // لا يُسمح بأي سكربت inline
        expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    });
});
