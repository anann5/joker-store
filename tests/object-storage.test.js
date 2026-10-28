const { Readable } = require('stream');

jest.mock('@aws-sdk/client-s3', () => {
    const send = jest.fn();
    return {
        __send: send,
        S3Client: jest.fn(() => ({ send })),
        PutObjectCommand: jest.fn(input => ({ command: 'put', input })),
        GetObjectCommand: jest.fn(input => ({ command: 'get', input }))
    };
});

const s3 = require('@aws-sdk/client-s3');
const storage = require('../services/objectStorage');

const ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT'];

function clearEnv() {
    for (const key of ENV_KEYS) delete process.env[key];
}

function enableR2() {
    process.env.R2_ACCOUNT_ID = 'account123';
    process.env.R2_ACCESS_KEY_ID = 'access-key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret-key';
    process.env.R2_BUCKET = 'joker-store';
}

describe('تخزين R2', () => {
    beforeEach(() => {
        clearEnv();
        s3.__send.mockReset();
    });

    afterAll(clearEnv);

    it('يبقى معطلاً عند غياب الإعدادات', async () => {
        expect(storage.isEnabled()).toBe(false);
        await expect(storage.putObject('uploads/a.png', Buffer.from('x'), 'image/png')).rejects.toThrow();
        expect(s3.__send).not.toHaveBeenCalled();
    });

    it('يتفعل عند اكتمال المتغيرات', () => {
        enableR2();
        expect(storage.isEnabled()).toBe(true);
        expect(storage.getObject).toBeInstanceOf(Function);
    });

    it('يرفع الكائنات إلى الدلو مع نوع المحتوى', async () => {
        enableR2();
        s3.__send.mockResolvedValue({});

        await storage.putObject('payment-proofs/1700000000000-0123456789abcdef.png', Buffer.from('x'), 'image/png');

        const command = s3.__send.mock.calls[0][0];
        expect(command.command).toBe('put');
        expect(command.input).toMatchObject({
            Bucket: 'joker-store',
            Key: 'payment-proofs/1700000000000-0123456789abcdef.png',
            ContentType: 'image/png'
        });
    });

    it('يقرأ الكائن كـ Buffer ويفرض حد الحجم', async () => {
        enableR2();
        s3.__send.mockResolvedValue({
            Body: Readable.from([Buffer.from('abc'), Buffer.from('def')]),
            ContentType: 'image/png',
            ContentLength: 6
        });

        await expect(storage.getObjectBuffer('uploads/a.png', 10)).resolves.toEqual(Buffer.from('abcdef'));

        s3.__send.mockResolvedValue({
            Body: Readable.from([Buffer.alloc(8, 1)]),
            ContentLength: 8
        });
        await expect(storage.getObjectBuffer('uploads/a.png', 4)).rejects.toThrow('الحد');
    });

    it('يحدد نوع المحتوى من الامتداد', () => {
        expect(storage.contentTypeForFilename('photo.JPG')).toBe('image/jpeg');
        expect(storage.contentTypeForFilename('proof.webp')).toBe('image/webp');
        expect(storage.contentTypeForFilename('file.bin')).toBe('application/octet-stream');
    });

    it('يميز أخطاء عدم وجود الملف', () => {
        expect(storage.isNotFoundError({ name: 'NoSuchKey' })).toBe(true);
        expect(storage.isNotFoundError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
        expect(storage.isNotFoundError(new Error('network'))).toBe(false);
    });
});
