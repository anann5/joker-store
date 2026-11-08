/**
 * اختبار إرسال بريد تجريبي عبر بريد (Brevo HTTPS) — محلياً فقط.
 * الاستخدام:
 *   node scripts/test-email.js                 يرسل إلى MAIL_FROM
 *   node scripts/test-email.js you@example.com يرسل إلى العنوان المذكور
 *
 * يتطلب في .env:
 *   BREVO_API_KEY=xxxx
 *   MAIL_FROM=Joker Store <sender@example.com>   (مرسِل موثّق في Brevo)
 *
 * لا يطبع المفتاح، فقط الحالة وسبب الفشل إن وُجد.
 */
require('dotenv').config();

function parseSender(value) {
    const match = String(value || '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (match) return { name: match[1] || 'Joker Store', email: match[2].trim() };
    return { name: 'Joker Store', email: String(value || '').trim() };
}

async function main() {
    const apiKey = String(process.env.BREVO_API_KEY || '').trim();
    const senderRaw = String(process.env.MAIL_FROM || '').trim();

    if (!apiKey || !senderRaw) {
        console.error('✖ البريد غير مهيأ: اضبط BREVO_API_KEY وMAIL_FROM في .env أولاً.');
        process.exit(1);
    }

    const to = process.argv[2] || parseSender(senderRaw).email;
    const sender = parseSender(senderRaw);
    console.log(`إرسال تجريبي من ${sender.email} → ${to} ...`);

    const response = await fetch(
        process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email',
        {
            method: 'POST',
            headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
                sender,
                to: [{ email: to }],
                subject: 'Joker Store — test email',
                htmlContent: '<p style="font-family:sans-serif">بريد تجريبي من JOKER STORE — الإعداد يعمل ✅</p>'
            })
        }
    );

    const text = await response.text().catch(() => '');
    if (!response.ok) {
        console.error(`✖ فشل Brevo (${response.status}): ${text.slice(0, 400)}`);
        console.error('تلميح: تحقق من أن المرسِل موثّق في Brevo → Senders & IP، وأن المفتاح SMTP/API فعال.');
        process.exit(1);
    }

    console.log(`✅ نجح — أُرسل إلى ${to} (تحقق من الوارد/الرسائل المهملة).`);
}

main().catch(err => {
    console.error('خطأ:', err.message);
    process.exit(1);
});
