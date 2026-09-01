if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js?v=7').then(reg => {
            if (reg) reg.update().catch(()=>{});
        }).catch(() => {});
        // إجبار تحديث الـ SW القديم عند وجوده
        navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => {
                if (r.active && r.active.scriptURL && !r.active.scriptURL.includes('v=7')) r.update().catch(()=>{});
            });
        }).catch(()=>{});
    });
}
