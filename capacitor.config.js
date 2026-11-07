// إعداد Capacitor — يُقرأ وقت البناء (npx cap sync/build) وليس وقت التشغيل.
// عنوان المتجر يُشتق من APP_URL (أو SITE_URL) حتى يكون الانتقال إلى نطاق
// جديد مسألة تحديث متغيّر بيئة وإعادة بناء التطبيق، دون تعديل الكود.
const DEFAULT_APP_URL = 'https://joker-store.onrender.com';
const rawAppUrl = String(process.env.APP_URL || process.env.SITE_URL || DEFAULT_APP_URL).trim();

let appUrl = DEFAULT_APP_URL;
try {
    appUrl = new URL(rawAppUrl).origin;
} catch (_e) {
    console.warn(`⚠️ APP_URL غير صالح (${rawAppUrl}) — سيُستخدم ${DEFAULT_APP_URL}`);
}

module.exports = {
    appId: 'com.jokerstore.app',
    appName: 'Joker Store',
    webDir: 'www',
    bundledWebRuntime: false,
    backgroundColor: '#0B0F1C',
    server: {
        url: appUrl,
        cleartext: false,
        allowNavigation: [new URL(appUrl).host],
        errorPath: 'error.html'
    },
    android: {
        allowMixedContent: false,
        captureInput: true,
        webContentsDebuggingEnabled: false
    },
    plugins: {
        StatusBar: {
            style: 'LIGHT',
            backgroundColor: '#0B0F1C',
            overlaysWebView: false
        },
        SplashScreen: {
            launchShowDuration: 1200,
            launchAutoHide: true,
            backgroundColor: '#0B0F1C',
            androidScaleType: 'CENTER_CROP',
            showSpinner: false,
            splashFullScreen: true,
            splashImmersive: true
        }
    }
};
