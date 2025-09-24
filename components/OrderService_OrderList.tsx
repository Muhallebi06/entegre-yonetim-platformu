

import React, { useState, useMemo, useCallback } from 'react';
import { useData, useUI, useAuth, Icon, ProductSelectionModal } from '../App';
import { Order, Company, Product, BOM } from '../types';
import { calculateImalatDurumuForOrder, calculateCommittedQuantities } from '../utils/helpers';
import { getRowBgByDue } from './OrderService';
import { SortableHeader, EditableCell, DescriptionModal } from './shared';

export const OrderList: React.FC<{
    orders: Order[];
    customers: Company[];
    products: Product[];
    boms: BOM[];
    getContactNameById: (id: string) => string;
    onUpdate: (order: Order) => Promise<void>;
    onDelete: (orderId: string) => void;
    onSevk: (orderId: string) => void;
    logAction: (no: string, islem: string) => void;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    sortConfig: { key: keyof Order; direction: 'asc' | 'desc' };
    setSortConfig: (config: { key: keyof Order; direction: 'asc' | 'desc' }) => void;
    today: Date;
}> = React.memo(({ orders, customers, products, boms, getContactNameById, onUpdate, onDelete, onSevk, logAction, searchTerm, setSearchTerm, sortConfig, setSortConfig, today }) => {
    const { checkPermission } = useAuth();
    const [descModal, setDescModal] = useState<{ isOpen: boolean, order: Order | null }>({ isOpen: false, order: null });

    const [productSelectionState, setProductSelectionState] = useState<{ isOpen: boolean; orderId: string | null }>({ isOpen: false, orderId: null });

    const customerOptions = useMemo(() => customers.map(c => ({ value: c.id, label: c.name })), [customers]);

    const handleUpdateField = useCallback(async (order: Order, field: keyof Order, value: any) => {
        const updatedOrder = { ...order, [field]: value };
        
        if(field === 'musteriId' || field === 'adet') {
            const product = products.find(p => p.name === order.urun);
            const committedQuantities = calculateCommittedQuantities(orders, boms, order.id);
            updatedOrder.imalatDurumu = calculateImalatDurumuForOrder(updatedOrder, products, boms, committedQuantities, product);
            logAction(order.no, `Müşteri/adet değiştirildi. Yeni imalat durumu hesaplandı.`);
        }
        await onUpdate(updatedOrder);
        logAction(order.no, `'${String(field)}' güncellendi.`);
    }, [onUpdate, logAction, products, boms, orders]);

    const handleProductSelect = (orderToUpdate: Order | undefined, selectedProduct: Product) => {
        if (!orderToUpdate) return;
        const updatedOrder = {
            ...orderToUpdate,
            urun: selectedProduct.name,
            kw: selectedProduct.m_kw ?? selectedProduct.kw,
            rpm: selectedProduct.m_rpm ?? selectedProduct.rpm,
            volt: selectedProduct.m_volt ?? selectedProduct.volt,
            kapak: selectedProduct.m_cover,
            rulman: selectedProduct.m_rulman,
            milKod: selectedProduct.milType
        };
        const committedQuantities = calculateCommittedQuantities(orders, boms, orderToUpdate.id);
        updatedOrder.imalatDurumu = calculateImalatDurumuForOrder(updatedOrder, products, boms, committedQuantities, selectedProduct);
        onUpdate(updatedOrder);
        logAction(updatedOrder.no, `Ürün '${selectedProduct.name}' olarak değiştirildi. Yeni imalat durumu hesaplandı.`);
        setProductSelectionState({ isOpen: false, orderId: null });
    };

    const handleToggleReady = (order: Order, field: 'hazir' | 'sevkeHazir') => {
        const newValue = !order[field];
        onUpdate({ ...order, [field]: newValue });
        logAction(order.no, `${field === 'hazir' ? 'Üretim' : 'Sevk'} durumu '${newValue ? 'Hazır' : 'Bekliyor'}' olarak değiştirildi.`);
    };

    const filteredAndSortedOrders = useMemo(() => {
        const filtered = orders.filter(o => {
            if (o.isCancelled) return false;
            if (searchTerm) {
                const search = searchTerm.toLowerCase();
                return o.no.toLowerCase().includes(search) ||
                       o.urun.toLowerCase().includes(search) ||
                       o.milKod?.toLowerCase().includes(search) ||
                       getContactNameById(o.musteriId).toLowerCase().includes(search);
            }
            return true;
        });

        return [...filtered].sort((a, b) => {
            const key = sortConfig.key;
            let valA = a[key] as any;
            let valB = b[key] as any;
            if (key === 'sevkTarihi') {
                valA = valA ? new Date(valA.split('/').reverse().join('-')).getTime() : Infinity;
                valB = valB ? new Date(valB.split('/').reverse().join('-')).getTime() : Infinity;
            }
            if (typeof valA === 'string') return sortConfig.direction === 'asc' ? valA.localeCompare(valB, 'tr') : valB.localeCompare(valA, 'tr');
            return sortConfig.direction === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
        });
    }, [orders, searchTerm, sortConfig, getContactNameById]);

    return (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
            <input type="search" placeholder="Siparişlerde Ara (No, Müşteri, Ürün...)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full mb-3 px-3 py-2 rounded-xl border dark:border-slate-600 bg-white dark:bg-slate-900" />
            <div className="overflow-auto"><table className="w-full text-sm responsive-table">
                <thead className="bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
                    <tr>
                        <SortableHeader label="Sipariş No" sortKey="no" currentSort={sortConfig} setSort={setSortConfig} className="text-left px-2 py-2" />
                        <th className="text-left px-2 py-2">Müşteri</th>
                        <th className="text-left px-2 py-2">Ürün</th>
                        <th className="text-right px-2 py-2">Adet</th>
                        <th className="text-left px-2 py-2">Mil Kod</th>
                        <th className="text-left px-2 py-2">Kapak/Rulman</th>
                        <th className="text-left px-2 py-2">kW/RPM/Volt</th>
                        <SortableHeader label="Termin" sortKey="sevkTarihi" currentSort={sortConfig} setSort={setSortConfig} className="text-left px-2 py-2" />
                        <th className="text-left px-2 py-2">Açıklama</th>
                        <th className="text-center px-2 py-2">Hazır</th>
                        <th className="text-center px-2 py-2">Sevke Hazır</th>
                        <th className="text-right px-2 py-2">İşlemler</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredAndSortedOrders.map(o => (
                        <tr key={o.id} className={getRowBgByDue(today, o.sevkTarihi, o.sevkeHazir)}>
                            <td data-label="Sipariş No" className="p-1 font-semibold">{o.no}</td>
                            <td data-label="Müşteri" className="p-1"><EditableCell recordId={o.id} value={o.musteriId} onSave={val => handleUpdateField(o, 'musteriId', val)} type="select" options={customerOptions} /></td>
                            <td data-label="Ürün" className="p-1">
                                <div onClick={() => setProductSelectionState({ isOpen: true, orderId: o.id })} className="group relative w-full block min-h-[28px] p-1 rounded-md cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-700/50 hover:border hover:border-dashed hover:border-slate-400 dark:hover:border-slate-500 hover:-m-px">
                                    {o.urun}
                                    <Icon name="pencil" size={12} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            </td>
                            <td data-label="Adet" className="p-1 text-right"><EditableCell recordId={o.id} value={o.adet} onSave={val => handleUpdateField(o, 'adet', val)} type="number" /></td>
                            <td data-label="Mil Kod" className="p-1"><EditableCell recordId={o.id} value={o.milKod} onSave={val => handleUpdateField(o, 'milKod', val)} /></td>
                            <td data-label="Kapak/Rulman" className="p-1">{o.kapak}/{o.rulman}</td>
                            <td data-label="kW/RPM/Volt" className="p-1">{o.kw}/{o.rpm}/{o.volt}</td>
                            <td data-label="Termin" className="p-1"><EditableCell recordId={o.id} value={o.sevkTarihi} onSave={val => handleUpdateField(o, 'sevkTarihi', val)} type="date" /></td>
                            <td data-label="Açıklama" className="p-1 text-center"><button onClick={() => setDescModal({ isOpen: true, order: o })}><Icon name="file-text" size={16} /></button></td>
                            <td data-label="Hazır" className="p-1 text-center"><input type="checkbox" checked={o.hazir} onChange={() => handleToggleReady(o, 'hazir')} className="w-5 h-5" /></td>
                            <td data-label="Sevke Hazır" className="p-1 text-center"><input type="checkbox" checked={o.sevkeHazir} onChange={() => handleToggleReady(o, 'sevkeHazir')} className="w-5 h-5" /></td>
                            <td data-label="İşlemler" className="p-1 text-right"><div className="flex justify-end gap-1">
                                <button onClick={() => onSevk(o.id)} disabled={!o.sevkeHazir} className="p-1.5 rounded-lg bg-green-100 text-green-700 disabled:opacity-50 dark:bg-green-900/50 dark:text-green-200"><Icon name="check" size={16} title="Sevk Et" /></button>
                                <button onClick={() => onDelete(o.id)} disabled={!checkPermission('hertz')} className="p-1.5 rounded-lg bg-red-100 text-red-700 disabled:opacity-50 dark:bg-red-900/50 dark:text-red-200"><Icon name="trash-2" size={16} title="Sil" /></button>
                            </div></td>
                        </tr>
                    ))}
                </tbody>
            </table></div>
            <DescriptionModal 
                isOpen={descModal.isOpen} 
                onClose={() => setDescModal({ isOpen: false, order: null })} 
                initialValue={descModal.order?.aciklama}
                onSave={(value) => descModal.order && handleUpdateField(descModal.order, 'aciklama', value)}
            />
            <ProductSelectionModal 
                isOpen={productSelectionState.isOpen}
                onClose={() => setProductSelectionState({ isOpen: false, orderId: null })}
                onProductSelect={(product) => handleProductSelect(orders.find(o => o.id === productSelectionState.orderId), product)}
                productFilter={(p) => p.category === 'motor'}
                title="Sipariş İçin Motor Seç"
            />
        </div>
    );
});
