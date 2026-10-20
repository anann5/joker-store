const { generateSecret, otpauthUri } = require('../middleware/totp');

const account = process.argv[2] || 'admin';
const issuer = process.argv[3] || 'Joker Store';
const secret = generateSecret();

console.log('');
console.log(`ADMIN_TOTP_SECRET=${secret}`);
console.log('');
console.log('otpauth:// URI (paste into an authenticator app that accepts a setup URI):');
console.log(otpauthUri(secret, account, issuer));
console.log('');
console.log('Manual setup: add the account in Google Authenticator/Authy and type the key above.');
console.log('Then set ADMIN_TOTP_SECRET in Render (and locally in .env) and redeploy.');
console.log('Do NOT commit the secret or share it.');
