import { getCurrentLanguage } from '/i18n.js';
async function loadOffers() {
    const container = document.getElementById('offersContainer');
    try {
        const res = await fetch('/api/promotions');
        const data = await res.json();
        if (!data.success || !data.promotions || data.promotions.length === 0) {
            container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:var(--text-muted);"><i class="fas fa-tag" style="font-size:3rem;margin-bottom:16px;display:block;opacity:0.3;"></i><p>لا توجد عروض نشطة حالياً</p></div>`;
            return;
        }
        const lang = getCurrentLanguage();
        container.innerHTML = data.promotions.map(promo => {
            const title = promo.title?.[lang] || promo.title?.ar || '';
            const desc = promo.description?.[lang] || promo.description?.ar || '';
            const discount = promo.discountPercent || 0;
            const expiresAt = promo.expiresAt ? new Date(promo.expiresAt) : null;
            const products = promo.products || [];
            return `
                <div class="product-item-card" style="grid-column:1/-1;margin-bottom:20px;">
                    <div style="padding:24px;">
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
                            <span style="background:linear-gradient(135deg,#ef4444,#f97316);color:#fff;padding:6px 14px;border-radius:20px;font-weight:900;font-size:1.1rem;">-${discount}%</span>
                            <h3 style="margin:0;font-size:1.25rem;color:#fff;">${escapeHtml(title)}</h3>
                        </div>
                        ${desc ? `<p style="color:var(--text-muted);margin-bottom:12px;line-height:1.6;">${escapeHtml(desc)}</p>` : ''}
                        ${expiresAt ? `<p style="color:var(--danger);font-size:0.85rem;margin-bottom:16px;"><i class="fas fa-clock"></i> ينتهي: ${expiresAt.toLocaleDateString('ar-EG')}</p>` : ''}
                        ${products.length > 0 ? `
                            <div class="products-grid" style="gap:12px;">
                                ${products.map(p => {
                                    const name = p.productName?.[lang] || p.productName?.ar || '';
                                    const salePrice = p.salePrice || p.price;
                                    return `
                                        <div class="product-item-card" data-product-id="${p._id}" style="cursor:pointer;">
                                            <img src="${p.image || '/image/logo.png'}" alt="${escapeHtml(name)}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--radius-md);">
                                            <div style="padding:10px;">
                                                <div style="font-size:0.85rem;font-weight:700;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(name)}</div>
                                                <div style="display:flex;gap:8px;align-items:center;">
                                                    <span style="color:var(--primary-neon);font-weight:900;">${Number(salePrice).toFixed(2)} ₪</span>
                                                    ${p.price !== salePrice ? `<span style="text-decoration:line-through;color:var(--text-muted);font-size:0.8rem;">${Number(p.price).toFixed(2)} ₪</span>` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        container.querySelectorAll('[data-product-id]').forEach(el => {
            el.addEventListener('click', () => { window.location.href = '/product/' + el.dataset.productId; });
        });
    } catch (_err) {
        container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:var(--danger);">❌ فشل تحميل العروض</div>`;
    }
}
function escapeHtml(str) { const d=document.createElement('div'); d.textContent=str||''; return d.innerHTML; }
loadOffers();
const btt=document.getElementById('backToTop');
if(btt){ window.addEventListener('scroll',()=>{ if(window.scrollY>300) btt.classList.add('is-visible'); else btt.classList.remove('is-visible'); }); btt.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'})); }
fetch('/api/site-config').then(r=>r.json()).then(d=>{ const wa=d?.siteConfig?.social?.whatsapp; const btn=document.getElementById('whatsappFloatBtn'); if(wa&&btn){ btn.href='https://wa.me/'+String(wa).replace(/[^0-9]/g,''); btn.style.display='flex'; } }).catch(()=>{});
