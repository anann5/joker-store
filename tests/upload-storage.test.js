const express = require('express');
const fs = require('fs');
const { Readable } = require('stream');
const request = require('supertest');

jest.mock('../services/objectStorage', () => ({
    isEnabled: jest.fn(),
    putObject: jest.fn(),
    getObject: jest.fn(),
    getObjectBuffer: jest.fn(),
    contentTypeForFilename: jest.fn(() => 'image/png'),
    isNotFoundError: jest.fn(() => false)
}));

const objectStorage = require('../services/objectStorage');
const upload = require('../middleware/upload');
const uploadController = require('../controllers/uploadController');

const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    Buffer.alloc(32, 7)
]);
const PROOF_FILENAME = '1700000000000-0123456789abcdef.png';

function binaryParser(res, callback) {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
}

const app = express();
app.post('/upload/proof', upload.paymentProofUpload.single('image'), uploadController.uploadPaymentProof);
app.post('/upload/image', upload.single('image'), uploadController.uploadImage);
app.get('/uploads/:filename', uploadController.servePublicUpload);
app.get('/payment-proofs/:filename', uploadController.servePaymentProof);
app.use((req, res) => res.status(404).end());

function uploadFile(path, buffer, filename) {
    return request(app)
        .post(path)
        .attach('image', buffer, { filename, contentType: 'image/png' });
}

describe('رفع الملفات وتقديمها عبر R2', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        objectStorage.isEnabled.mockReturnValue(true);
        objectStorage.contentTypeForFilename.mockReturnValue('image/png');
        objectStorage.isNotFoundError.mockReturnValue(false);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('يرفع إثبات الدفع إلى R2 ويعيد رابطاً خاصاً', async () => {
        objectStorage.putObject.mockResolvedValue('ok');

        const res = await uploadFile('/upload/proof', PNG, 'proof.png');

        expect(res.statusCode).toBe(200);
        expect(res.body.url).toMatch(/^\/private-proofs\/\d{10,16}-[a-f0-9]{16}\.png$/);
        expect(objectStorage.putObject).toHaveBeenCalledTimes(1);
        const [key, body, contentType] = objectStorage.putObject.mock.calls[0];
        expect(key).toMatch(/^payment-proofs\/\d{10,16}-[a-f0-9]{16}\.png$/);
        expect(body.equals(PNG)).toBe(true);
        expect(contentType).toBe('image/png');
    });

    it('يرفع صور المتجر إلى R2 تحت uploads/', async () => {
        objectStorage.putObject.mockResolvedValue('ok');

        const res = await uploadFile('/upload/image', PNG, 'product.png');

        expect(res.statusCode).toBe(200);
        expect(res.body.url).toMatch(/^\/uploads\/\d{10,16}-[a-f0-9]{16}\.png$/);
        expect(objectStorage.putObject.mock.calls[0][0]).toMatch(/^uploads\/\d{10,16}-[a-f0-9]{16}\.png$/);
    });

    it('يرفض المحتوى غير الصوري رغم الامتداد الصحيح', async () => {
        const res = await uploadFile('/upload/proof', Buffer.from('not-an-image'), 'fake.png');

        expect(res.statusCode).toBe(400);
        expect(objectStorage.putObject).not.toHaveBeenCalled();
    });

    it('يعيد 502 عند فشل الرفع إلى R2 دون حفظ محلي', async () => {
        const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();
        objectStorage.putObject.mockRejectedValue(new Error('r2 down'));

        const res = await uploadFile('/upload/proof', PNG, 'proof.png');

        expect(res.statusCode).toBe(502);
        expect(res.body.success).toBe(false);
        expect(writeSpy).not.toHaveBeenCalled();
    });

    it('يحفظ محلياً عند تعطيل R2', async () => {
        objectStorage.isEnabled.mockReturnValue(false);
        const mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue();
        const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();

        const res = await uploadFile('/upload/proof', PNG, 'proof.png');

        expect(res.statusCode).toBe(200);
        expect(res.body.url).toMatch(/^\/private-proofs\/\d{10,16}-[a-f0-9]{16}\.png$/);
        expect(mkdirSpy).toHaveBeenCalled();
        expect(writeSpy).toHaveBeenCalledWith(
            expect.any(String),
            PNG
        );
        expect(objectStorage.putObject).not.toHaveBeenCalled();
    });

    it('يقدم صور /uploads من R2 مع كاش عام', async () => {
        objectStorage.getObject.mockResolvedValue({
            body: Readable.from([PNG]),
            contentType: 'image/png',
            contentLength: PNG.length
        });

        const res = await request(app)
            .get(`/uploads/${PROOF_FILENAME}`)
            .buffer(true)
            .parse(binaryParser);

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toMatch(/image\/png/);
        expect(res.headers['cache-control']).toContain('immutable');
        expect(Buffer.compare(res.body, PNG)).toBe(0);
        expect(objectStorage.getObject).toHaveBeenCalledWith(`uploads/${PROOF_FILENAME}`);
    });

    it('يقدم إثبات الدفع للأدمن مع منع الكاش', async () => {
        objectStorage.getObject.mockResolvedValue({
            body: Readable.from([PNG]),
            contentType: 'image/png',
            contentLength: PNG.length
        });

        const res = await request(app)
            .get(`/payment-proofs/${PROOF_FILENAME}`)
            .buffer(true)
            .parse(binaryParser);

        expect(res.statusCode).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.headers['content-disposition']).toContain('inline');
        expect(Buffer.compare(res.body, PNG)).toBe(0);
        expect(objectStorage.getObject).toHaveBeenCalledWith(`payment-proofs/${PROOF_FILENAME}`);
    });

    it('يرفض أسماء ملفات غير صالحة', async () => {
        const res = await request(app).get('/payment-proofs/..%2Fsecret.png');

        expect(res.statusCode).toBe(400);
        expect(objectStorage.getObject).not.toHaveBeenCalled();
    });

    it('يعيد 404 للإثبات غير الموجود في R2', async () => {
        objectStorage.isNotFoundError.mockReturnValue(true);
        objectStorage.getObject.mockRejectedValue({ name: 'NoSuchKey' });

        const res = await request(app).get(`/payment-proofs/${PROOF_FILENAME}`);

        expect(res.statusCode).toBe(404);
    });

    it('يمرر صور /uploads إلى التخزين المحلي عند تعطيل R2', async () => {
        objectStorage.isEnabled.mockReturnValue(false);

        const res = await request(app).get(`/uploads/${PROOF_FILENAME}`);

        expect(res.statusCode).toBe(404);
        expect(objectStorage.getObject).not.toHaveBeenCalled();
    });
});
