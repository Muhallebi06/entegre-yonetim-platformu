import React, { useState, useMemo, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import { useData, useUI, useAuth, ModuleDataManager } from '../App';
import { Order, ShippedOrder, ServiceRecord, ShippedServiceRecord, OrderLog } from '../types';
import { formatDateTimeTR, parseAnyDate, atLocalMidnight } from '../utils/helpers';
import { exportSiparisServisData, importSiparisServisData, deleteSiparisServisData } from '../services/firebase';
import { TabButton } from './shared';
import { OrderForm } from './OrderService_OrderForm';
import { OrderList } from './OrderService_OrderList';
import { OrderLogList } from './OrderService_OrderLogList';
import { ServiceRecords } from './OrderService_ServiceRecords';
import { ShippedList } from './OrderService_ShippedList';
import { Analysis } from './OrderService_Analysis';

// Register Chart.js components
Chart.register(...registerables);

// --- HELPER & UTILITY FUNCTIONS ---
const todayLocal = () => atLocalMidnight(new Date());

export const getRowBgByDue = (today: Date, sevkStr?: string, isHazir?: boolean): string => {
    if(!sevkStr) return 'bg-rose-100 dark:bg-rose-500/20'; // Highlight if no date
    const due = parseAnyDate(sevkStr);
    if (!due) return 'bg-rose-100 dark:bg-rose-500/20';
    
    const dayMs = 86400000;
    const diff = (atLocalMidnight(due).getTime() - today.getTime()) / dayMs;

    if (diff < 0) return isHazir ? 'bg-yellow-400 dark:bg-yellow-600/50' : 'bg-red-400 text-white dark:bg-red-800/60 dark:text-red-100';
    if (diff <= 3) return 'bg-yellow-200 dark:bg-yellow-700/40';
    return '';
};

export const getServisRowBg = (servis: ServiceRecord, today: Date): string => {
    if (servis.sevkTarihi) {
        const isHazir = (servis.durum || '').toUpperCase() === 'HAZIR';
        const dueDateBg = getRowBgByDue(today, servis.sevkTarihi, isHazir);
        if (dueDateBg && !dueDateBg.includes('bg-rose-100')) return dueDateBg;
    }
    switch((servis.durum || '').toUpperCase()){
        case "HAZIR": return "bg-yellow-200 dark:bg-yellow-700/40";
        case "BEKLEMEDE": return "bg-slate-100 dark:bg-slate-700/40";
        case "İNCELENİYOR": case "INCELENIYOR": return "bg-yellow-100 dark:bg-yellow-800/30";
        case "TEKLİF BEKLİYOR": case "TEKLIF BEKLIYOR": return "bg-purple-100 dark:bg-purple-800/30";
        default: return "";
    }
}

// --- MAIN COMPONENT ---
const OrderService: React.FC = () => {
    const { dataStore, pushData } = useData();
    const { showToast, showConfirmation } = useUI();
    const { user } = useAuth();
    
    const [activeTab, setActiveTab] = useState<'siparisler' | 'servis' | 'sevk' | 'analiz'>('siparisler');
    const [orderSearchTerm, setOrderSearchTerm] = useState('');
    const [orderSortConfig, setOrderSortConfig] = useState<{ key: keyof Order; direction: 'asc' | 'desc' }>({ key: 'sevkTarihi', direction: 'asc' });

    const { orders, sevkEdilenler, servisKayitlari, servisSevkEdilenler, customers, products, boms, siparisLog } = useMemo(() => ({
        orders: dataStore.siparisler || [],
        sevkEdilenler: dataStore.sevkEdilenler || [],
        servisKayitlari: dataStore.servisKayitlari || [],
        servisSevkEdilenler: dataStore.servisSevkEdilenler || [],
        customers: (dataStore.contacts || []).filter(c => c.type === 'customer'),
        products: dataStore['stokTakip-v1']?.products || [],
        boms: dataStore.boms || [],
        siparisLog: dataStore.siparisLog || [],
    }), [dataStore]);
    
    const getContactNameById = useCallback((id: string) => customers.find(c => c.id === id)?.name || `<span class="italic text-slate-400">Bilinmeyen Firma</span>`, [customers]);

    const logAction = useCallback((no: string, islem: string) => {
        const newLog: OrderLog = { no, islem, user: user?.username || 'Bilinmiyor', tarih: new Date().toISOString() };
        pushData('siparisLog', (prev: OrderLog[] = []) => [newLog, ...prev]);
    }, [user, pushData]);

    const handleUpdateOrder = useCallback(async (orderToUpdate: Order): Promise<void> => {
        try {
            await pushData('siparisler', (prev: Order[] = []) => prev.map(o => o.id === orderToUpdate.id ? orderToUpdate : o));
        } catch (err) { 
            showToast("Sipariş güncellenemedi.", "error"); 
            throw err;
        }
    }, [pushData, showToast]);

    const handleDeleteOrder = useCallback((orderId: string) => {
        const order = orders.find(o => o.id === orderId);
        if(!order) return;
        showConfirmation({
            title: "Siparişi Sil",
            message: `<b>${order.no}</b> numaralı sipariş silinecektir. Bu işlem geri alınamaz.`,
            confirmText: "Evet, Sil",
            onConfirm: async () => {
                await pushData('siparisler', (prev: Order[] = []) => prev.filter(o => o.id !== orderId));
                logAction(order.no, "Sipariş silindi");
                showToast("Sipariş silindi.", "success");
            },
            requiresInput: null
        });
    }, [orders, pushData, logAction, showToast, showConfirmation]);

    const handleSevkOrder = useCallback((orderId: string) => {
        const orderToSevk = orders.find(o => o.id === orderId);
        if (!orderToSevk) return;
        
        showConfirmation({
            title: "Siparişi Sevk Et",
            message: `<b>${orderToSevk.no}</b> numaralı sipariş sevk edilmiş olarak işaretlenecek.`,
            confirmText: "Evet, Sevk Et",
            onConfirm: async () => {
                const shippedOrder: ShippedOrder = { ...orderToSevk, sevkEdildi: new Date().toISOString(), kullanici: user?.username || 'Bilinmiyor' };
                await pushData('siparisler', (prevSiparisler: Order[] = []) => prevSiparisler.filter(o => o.id !== orderId));
                await pushData('sevkEdilenler', (prevSevk: ShippedOrder[] = []) => [shippedOrder, ...prevSevk]);
                logAction(orderToSevk.no, "Sipariş sevk edildi.");
                showToast("Sipariş sevk edildi.", "success");
            },
            requiresInput: null
        });
    }, [orders, user, pushData, logAction, showToast, showConfirmation]);

    // Service Record Handlers
    const handleUpdateServiceRecord = useCallback(async (recordToUpdate: ServiceRecord): Promise<void> => {
        try {
            await pushData('servisKayitlari', (prev: ServiceRecord[] = []) => prev.map(r => r.id === recordToUpdate.id ? recordToUpdate : r));
            showToast("Servis kaydı güncellendi.", "success");
        } catch (err) { 
            showToast("Servis kaydı güncellenemedi.", "error"); 
            throw err;
        }
    }, [pushData, showToast]);

    const handleDeleteServiceRecord = useCallback((recordId: string) => {
         const record = servisKayitlari.find(s => s.id === recordId);
         if (!record) return;
         showConfirmation({
             title: "Servis Kaydını Sil",
             message: `<b>${record.no}</b> numaralı servis kaydı silinecektir.`,
             confirmText: "Evet, Sil",
             onConfirm: async () => {
                 await pushData('servisKayitlari', (prev: ServiceRecord[] = []) => prev.filter(r => r.id !== recordId));
                 logAction(record.no, "Servis kaydı silindi.");
                 showToast("Servis kaydı silindi.", "success");
             },
             requiresInput: null
         });
    }, [servisKayitlari, pushData, logAction, showToast, showConfirmation]);

    const handleSevkServiceRecord = useCallback((recordId: string) => {
        const recordToSevk = servisKayitlari.find(s => s.id === recordId);
        if (!recordToSevk) return;
        showConfirmation({
            title: "Servis Kaydını Sevk Et",
            message: `<b>${recordToSevk.no}</b> numaralı servis kaydı sevk edilmiş olarak işaretlenecek.`,
            confirmText: "Evet, Sevk Et",
            onConfirm: async () => {
                const shippedRecord: ShippedServiceRecord = { ...recordToSevk, sevkEdildi: new Date().toISOString(), kullanici: user?.username || 'Bilinmiyor' };
                await pushData('servisKayitlari', (prevServis: ServiceRecord[] = []) => prevServis.filter(s => s.id !== recordId));
                await pushData('servisSevkEdilenler', (prevSevk: ShippedServiceRecord[] = []) => [shippedRecord, ...prevSevk]);
                logAction(recordToSevk.no, "Servis sevk edildi.");
                showToast("Servis sevk edildi.", "success");
            },
            requiresInput: null
        });
    }, [servisKayitlari, user, pushData, logAction, showToast, showConfirmation]);
    
    const handleAddServiceRecord = useCallback(async (record: ServiceRecord) => {
        await pushData('servisKayitlari', (prev: ServiceRecord[] = []) => [record, ...prev]);
        logAction(record.no, "Yeni servis kaydı eklendi.");
        showToast("Yeni servis kaydı eklendi.", "success");
    }, [pushData, logAction, showToast]);
    
    const handleUndoOrderShip = useCallback((shippedId: string) => {
        const shippedOrder = sevkEdilenler.find(s => s.id === shippedId);
        if (!shippedOrder) return;
        showConfirmation({
            title: "Sevkiyatı Geri Al",
            message: `<b>${shippedOrder.no}</b> numaralı siparişin sevkiyatı geri alınacak ve sipariş listesine taşınacak.`,
            confirmText: "Evet, Geri Al",
            onConfirm: async () => {
                const { sevkEdildi, kullanici, ...originalOrder } = shippedOrder;
                await pushData('sevkEdilenler', (prevSevk: ShippedOrder[] = []) => prevSevk.filter(s => s.id !== shippedId));
                await pushData('siparisler', (prevSiparisler: Order[] = []) => [originalOrder, ...prevSiparisler]);
                logAction(originalOrder.no, "Sevkiyat geri alındı.");
                showToast("Sevkiyat geri alındı.", "success");
            },
            requiresInput: null
        });
    }, [sevkEdilenler, pushData, logAction, showToast, showConfirmation]);

    const handleUndoServiceShip = useCallback((shippedId: string) => {
        const shippedService = servisSevkEdilenler.find(s => s.id === shippedId);
        if (!shippedService) return;
        showConfirmation({
            title: "Servis Sevkiyatını Geri Al",
            message: `<b>${shippedService.no}</b> numaralı servisin sevkiyatı geri alınacak.`,
            confirmText: "Evet, Geri Al",
            onConfirm: async () => {
                const { sevkEdildi, kullanici, ...originalService } = shippedService;
                await pushData('servisSevkEdilenler', (prevSevk: ShippedServiceRecord[] = []) => prevSevk.filter(s => s.id !== shippedId));
                await pushData('servisKayitlari', (prevServis: ServiceRecord[] = []) => [originalService, ...prevServis]);
                logAction(originalService.no, "Servis sevkiyatı geri alındı.");
                showToast("Servis sevkiyatı geri alındı.", "success");
            },
            requiresInput: null
        });
    }, [servisSevkEdilenler, pushData, logAction, showToast, showConfirmation]);

    return (
        <div className="mx-auto max-w-screen-2xl p-3 md:p-4">
            <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Sipariş & Servis</h2>
                <ModuleDataManager
                    moduleName="Sipariş & Servis"
                    onExport={() => exportSiparisServisData(dataStore)}
                    onImport={importSiparisServisData}
                    onDelete={deleteSiparisServisData}
                />
            </div>

            <div className="mb-4">
                <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 mobile-scroll-nav-container">
                    <nav className="flex flex-nowrap space-x-1 mobile-scroll-nav">
                        <TabButton tabId="siparisler" activeTab={activeTab} onClick={() => setActiveTab('siparisler')}>Siparişler</TabButton>
                        <TabButton tabId="servis" activeTab={activeTab} onClick={() => setActiveTab('servis')}>Teknik Servis</TabButton>
                        <TabButton tabId="sevk" activeTab={activeTab} onClick={() => setActiveTab('sevk')}>Sevk Edilenler</TabButton>
                        <TabButton tabId="analiz" activeTab={activeTab} onClick={() => setActiveTab('analiz')}>Analiz</TabButton>
                    </nav>
                </div>
            </div>

            {activeTab === 'siparisler' && (
                <>
                <OrderForm customers={customers} orders={orders} sevkEdilenler={sevkEdilenler} logAction={logAction} products={products} boms={boms}/>
                <OrderList 
                    orders={orders} 
                    customers={customers} 
                    products={products}
                    boms={boms}
                    getContactNameById={getContactNameById} 
                    onUpdate={handleUpdateOrder} 
                    onDelete={handleDeleteOrder} 
                    onSevk={handleSevkOrder} 
                    logAction={logAction} 
                    searchTerm={orderSearchTerm} 
                    setSearchTerm={setOrderSearchTerm} 
                    sortConfig={orderSortConfig} 
                    setSortConfig={setOrderSortConfig}
                    today={todayLocal()}
                />
{/* Fix: The OrderLogList component requires a 'logs' prop. It is now provided with the 'siparisLog' data. */}
                <OrderLogList logs={siparisLog} />
                </>
            )}
            
            {activeTab === 'servis' && (
                <ServiceRecords 
                    servisKayitlari={servisKayitlari}
                    servisSevkEdilenler={servisSevkEdilenler}
                    customers={customers}
                    products={products}
                    getContactNameById={getContactNameById}
                    onUpdate={handleUpdateServiceRecord}
                    onDelete={handleDeleteServiceRecord}
                    onSevk={handleSevkServiceRecord}
                    onAdd={handleAddServiceRecord}
                    logAction={logAction}
                    today={todayLocal()}
                />
            )}
            {activeTab === 'sevk' && (
                <ShippedList 
                    shippedOrders={sevkEdilenler}
                    shippedServices={servisSevkEdilenler}
                    getContactNameById={getContactNameById}
                    onUndoOrderShip={handleUndoOrderShip}
                    onUndoServiceShip={handleUndoServiceShip}
                />
            )}
            {activeTab === 'analiz' && (
                <Analysis 
                    orders={orders} 
                    shippedOrders={sevkEdilenler} 
                    servisKayitlari={servisKayitlari}
                    shippedServiceRecords={servisSevkEdilenler}
                    customers={customers} 
                />
            )}
        </div>
    );
};

export default OrderService;