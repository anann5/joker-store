// اختبارات سياسة المخزون الموحّدة:
// المنتج الخارجي بمخزون غير معروف (null) يُعامل كغير متوفر ويُخفى من الواجهة،
// ولا يُقبل طلب لا يمكن تسليمه من أي مزوّد.

const {
    computeAvailableStock,
    hasEnoughStock,
    isDeliverable,
    withDeliverableStock
} = require('../services/inventory');

describe('computeAvailableStock', () => {
    it('يحسب المخزون المحلي من الأكواد المتاحة فقط', () => {
        const product = {
            isExternal: false,
            codes: [
                { value: 'A', status: 'available' },
                { value: 'B', status: 'sold' },
                { value: 'C', status: 'reserved' },
                { value: 'D', status: 'available' }
            ]
        };
        expect(computeAvailableStock(product)).toBe(2);
    });

    it('يعيد صفراً عندما لا توجد أكواد أو تكون القائمة غير صالحة', () => {
        expect(computeAvailableStock({ isExternal: false })).toBe(0);
        expect(computeAvailableStock({ isExternal: false, codes: null })).toBe(0);
        expect(computeAvailableStock(null)).toBe(0);
    });

    it('يستخدم مخزون المزوّد للمنتج الخارجي', () => {
        expect(computeAvailableStock({ isExternal: true, providerStock: 7 })).toBe(7);
        expect(computeAvailableStock({ isExternal: true, providerStock: '3' })).toBe(3);
    });

    it('يعامل مخزون المزوّد غير المعروف أو الصفري كغير متوفر', () => {
        expect(computeAvailableStock({ isExternal: true, providerStock: null })).toBe(0);
        expect(computeAvailableStock({ isExternal: true })).toBe(0);
        expect(computeAvailableStock({ isExternal: true, providerStock: 0 })).toBe(0);
        expect(computeAvailableStock({ isExternal: true, providerStock: -3 })).toBe(0);
        expect(computeAvailableStock({ isExternal: true, providerStock: 'abc' })).toBe(0);
    });
});

describe('hasEnoughStock', () => {
    it('يرفض الكميات غير الصالحة', () => {
        const product = { isExternal: false, codes: [{ status: 'available' }] };
        expect(hasEnoughStock(product, 0)).toBe(false);
        expect(hasEnoughStock(product, -1)).toBe(false);
        expect(hasEnoughStock(null, 1)).toBe(false);
    });

    it('يقبل الكمية المتوفرة ويرفض ما يزيد عنها', () => {
        const local = { isExternal: false, codes: [{ status: 'available' }, { status: 'available' }] };
        expect(hasEnoughStock(local, 2)).toBe(true);
        expect(hasEnoughStock(local, 3)).toBe(false);

        const external = { isExternal: true, providerStock: 2 };
        expect(hasEnoughStock(external, 2)).toBe(true);
        expect(hasEnoughStock(external, 3)).toBe(false);
    });

    it('يرفض منتجاً خارجياً بلا مخزون معروف', () => {
        expect(hasEnoughStock({ isExternal: true, providerStock: null }, 1)).toBe(false);
    });
});

describe('isDeliverable', () => {
    it('يُخفي المنتج الخارجي بلا مخزون معروف أو بصفر', () => {
        expect(isDeliverable({ isExternal: true })).toBe(false);
        expect(isDeliverable({ isExternal: true, providerStock: null })).toBe(false);
        expect(isDeliverable({ isExternal: true, providerStock: 0 })).toBe(false);
    });

    it('يُظهر المنتج الخارجي عند وجود مخزون موجب', () => {
        expect(isDeliverable({ isExternal: true, providerStock: 1 })).toBe(true);
    });

    it('لا يُخفي المنتج المحلي (نقص المخزون يُعرض كنفد)', () => {
        expect(isDeliverable({ isExternal: false, codes: [] })).toBe(true);
        expect(isDeliverable({ isExternal: false, codes: [{ status: 'available' }] })).toBe(true);
    });
});

describe('withDeliverableStock', () => {
    it('يضيف شرطاً يحفظ المحلي ويشترط مخزوناً موجباً للخارجي', () => {
        const filter = withDeliverableStock({ isActive: true, category: 'pubg' });

        expect(filter.isActive).toBe(true);
        expect(filter.category).toBe('pubg');
        expect(filter.$and).toEqual([
            {
                $or: [
                    { isExternal: { $ne: true } },
                    { providerStock: { $gt: 0 } }
                ]
            }
        ]);
    });

    it('يحافظ على شروط $and الموجودة بدل استبدالها', () => {
        const existing = { $and: [{ price: { $gte: 10 } }] };
        const filter = withDeliverableStock(existing);

        expect(filter.$and).toHaveLength(2);
        expect(filter.$and[0]).toEqual({ price: { $gte: 10 } });
    });
});
