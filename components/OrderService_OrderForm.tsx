
import React, { useState, useCallback, useMemo } from 'react';
import { useData, useUI, ProductSelectionModal } from '../App';
import { Order, Company, Product, BOM, OrderLog } from '../types';
import { calculateImalatDurumuForOrder, calculateCommittedQuantities } from '../utils/helpers';
import { DatePicker } from './shared';

export const OrderForm: React.FC<{
  customers: Company[];
  orders: Order[];
  sevkEdilenler: Order[];
  logAction: (no: string, islem: string) => void;
  products: Product[];
  boms: BOM[];
}> = ({ customers, orders, sevkEdilenler, logAction, products, boms }) => {
    const { pushData } = useData();
    const { showToast } = useUI();
    const [newOrder, setNewOrder] = useState<Partial<Order>>({ adet: 1, hazir: false, sevkeHazir: false });
    const [isProductModalOpen, setProductModalOpen] = useState(false);
    
    const motorProducts = useMemo(() => products.filter(p => p.category === 'motor'), [products]);

    const handleProductSelect = useCallback((product: Product) => {
        setNewOrder(prev => {
            const updatedOrder = {
                ...prev,
                urun: product.name,
                kw: product.m_kw ?? product.kw,
                rpm: product.m_rpm ?? product.rpm,
                volt: product.m_volt ?? product.volt,
                kapak: product.m_cover,
                rulman: product.m_rulman,
                milKod: product.milType
            };
            const committedQuantities = calculateCommittedQuantities(orders, boms);
            const imalatDurumu = calculateImalatDurumuForOrder(updatedOrder, products, boms, committedQuantities, product);
            return { ...updatedOrder, imalatDurumu };
        });
        setProductModalOpen(false);
    }, [products, boms, orders]);

    const handleNewOrderChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setNewOrder(prev => ({ ...prev, [name]: value }));
    }, []);

    const handleNewOrderDateChange = useCallback((dateStr: string) => {
        setNewOrder(prev => ({ ...prev, sevkTarihi: dateStr }));
    }, []);

    const handleAddOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newOrder.musteriId || !newOrder.urun) {
            showToast("Müşteri ve Ürün alanları zorunludur.", "error");
            return;
        }

        const now = new Date();
        const prefix = `ORD-${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const newOrderNo = `${prefix}-${String(Date.now()).slice(-6)}`;

        try {
             const finalOrder: Order = {
                ...newOrder,
                id: crypto.randomUUID(),
                no: newOrderNo,
                musteriId: newOrder.musteriId!,
                urun: newOrder.urun!,
                adet: Number(newOrder.adet) || 1,
                milKod: newOrder.milKod || '',
                hazir: false,
                sevkeHazir: false,
                eklenmeTarihi: now.toISOString(),
                imalatDurumu: {},
            };
            
            const selectedProduct = products.find(p => p.name === finalOrder.urun);
            // We pass the current orders list to calculate committed quantities for OTHER orders.
            const committedQuantities = calculateCommittedQuantities(orders, boms);
            finalOrder.imalatDurumu = calculateImalatDurumuForOrder(finalOrder, products, boms, committedQuantities, selectedProduct);

            await pushData('siparisler', (prev: Order[] = []) => [finalOrder, ...prev]);

            logAction(finalOrder.no, "Sipariş eklendi");
            showToast("Yeni sipariş eklendi.", "success");
            setNewOrder({ adet: 1, hazir: false, sevkeHazir: false });
        } catch (error) {
            showToast("Sipariş eklenemedi.", "error");
            console.error("Failed to add order", error);
        }
    };
    
    const inputClass = "w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900";

    return (
        <form onSubmit={handleAddOrder} className="mb-6 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border dark:border-slate-700">
            <h2 className="text-lg font-semibold mb-3 dark:text-slate-100">Yeni Sipariş Ekle</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                <div className="lg:col-span-2">
                    <label className="text-sm">Müşteri</label>
                    <select name="musteriId" value={newOrder.musteriId || ''} onChange={handleNewOrderChange} required className={inputClass}>
                        <option value="">Seçiniz</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div className="lg:col-span-2">
                    <label className="text-sm">Ürün (Motor)</label>
                    <div className="flex items-center">
                        <input name="urun" value={newOrder.urun || ''} readOnly placeholder="Motor Seçmek İçin Tıklayın" onClick={() => setProductModalOpen(true)} required className={`${inputClass} cursor-pointer`} />
                    </div>
                </div>
                <div>
                    <label className="text-sm">Adet</label>
                    <input type="number" name="adet" value={newOrder.adet || ''} onChange={handleNewOrderChange} required className={inputClass} />
                </div>
                 <div>
                    <label className="text-sm">Termin</label>
                    <DatePicker value={newOrder.sevkTarihi} onChange={handleNewOrderDateChange} placeholder="gg/aa/yyyy" className={inputClass} />
                </div>
                <div className="lg:col-span-2 xl:col-span-4">
                    <label className="text-sm">Açıklama</label>
                    <input name="aciklama" value={newOrder.aciklama || ''} onChange={handleNewOrderChange} className={inputClass} />
                </div>
                <div className="flex items-end">
                    <button type="submit" className="w-full btn-brand py-2.5 rounded-xl">Ekle</button>
                </div>
            </div>
             <ProductSelectionModal 
                isOpen={isProductModalOpen}
                onClose={() => setProductModalOpen(false)}
                onProductSelect={handleProductSelect}
                productFilter={(p) => p.category === 'motor'}
                title="Sipariş İçin Motor Seç"
            />
        </form>
    );
};
