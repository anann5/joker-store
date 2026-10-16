if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js?v=10').then(reg => {
            if (reg) reg.update().catch(()=>{});
        }).catch(() => {});
        // إجبار تحديث الـ SW القديم عند وجوده
        navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => {
                if (r.active && r.active.scriptURL && !r.active.scriptURL.includes('v=10')) r.update().catch(()=>{});
            });
        }).catch(()=>{});
    });
}
