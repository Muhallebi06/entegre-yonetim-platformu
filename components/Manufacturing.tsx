import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useData, useUI, useAuth, Icon, useEditingState, ModuleDataManager } from '../App';
import { Order, ImalatAsamaDurum, ImalatAsamaDetay, WorkOrder, Product, BOM, ProductCategory, OrderLog, InventoryLog, Company } from '../types';
// Fix: Import StokTakipData from ../types instead of ../services/firebase to avoid circular dependencies.
import { StokTakipData } from '../types';
import { parseAnyDate, formatDateTR, formatNumber, parseDdMmYyyy, formatDateTimeTR, findBestMatchingBom, parseLocaleNumber } from '../utils/helpers';
import { DatePicker, EditableCell } from './shared';
import { useManufacturingAutomation } from '../hooks/useManufacturingAutomation';
import { ManufacturingAnalysis } from './ManufacturingAnalysis';
import { exportImalatData, importImalatData, deleteImalatData } from '../services/firebase';

const IMALAT_ASAMALARI: { key: string; label: string; group: string }[] = [
    { key: 'bobinaj', label: 'Bobinaj', group: 'bobinaj' },
    { key: 'govdeImalat', label: 'Gövde İmalatı', group: 'govdeImalat' },
    { key: 'milIsleme', label: 'Mil İşleme', group: 'milIsleme' },
    { key: 'rotorluMilIsleme', label: 'Rotorlu Mil İşleme', group: 'milIsleme' },
    { key: 'rotorluMilTaslama', label: 'Rotorlu Mil Taşlama', group: 'milIsleme' },
    { key: 'kapakIsleme', label: 'Kapak İşleme', group: 'kapakIsleme' },
    { key: 'kapakTaslama', label: 'Çelik Kapak Taşlama', group: 'kapakIsleme' },
    { key: 'montaj', label: 'Motor Montajı', group: 'montaj' },
];

const DURUM_RENKLERI: Record<ImalatAsamaDurum, { bg: string; text: string; }> = {
    bekliyor: { bg: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-700 dark:text-slate-300' },
    imalatta: { bg: 'bg-blue-200 dark:bg-blue-900/50', text: 'text-blue-800 dark:text-blue-200' },
    hazir: { bg: 'bg-green-200 dark:bg-green-900/50', text: 'text-green-800 dark:text-green-200' },
};
const DURUM_ETIKETLERI: Record<ImalatAsamaDurum, string> = { bekliyor: 'Bekliyor', imalatta: 'İmalatta', hazir: 'Hazır' };

// --- Reusable Components ---

const EditableDateCell: React.FC<{
  value?: string;
  onSave: (newValue: string) => void | Promise<void>;
  canEdit: boolean;
}> = ({ value, onSave, canEdit }) => {
    const [isEditing, setIsEditing] = useState(false);
    
    if (isEditing) {
        return (
            <div onBlur={() => setIsEditing(false)}>
                 <DatePicker 
                    value={value}
                    onChange={(dateStr) => {
                        onSave(dateStr);
                        setIsEditing(false);
                    }}
                    className="w-full px-1 py-0.5 border rounded-md bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-xs"
                />
            </div>
        );
    }
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const terminDate = parseAnyDate(value);
    const isOverdue = terminDate && terminDate < today;

    return (
        <div 
            onClick={() => canEdit && setIsEditing(true)} 
            className={`min-h-[28px] p-1 rounded-md ${canEdit ? 'cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600' : ''} ${isOverdue ? 'text-red-500 font-semibold' : ''}`}
        >
            {formatDateTR(value)}
        </div>
    );
};


const TechnicalDetailsCell: React.FC<{ details: Order | Product | null; stageKey: string }> = React.memo(({ details, stageKey }) => {
    if (!details) return null;

    const renderDetail = (label: string, value: any) => (
        value || value === 0 ? <div className="text-xs"><span className="font-semibold text-slate-500 dark:text-slate-400">{label}:</span> {value}</div> : null
    );

    // Type guard to check if details is Order or Product
    const isOrder = 'no' in details;

    const getProp = (orderProp: keyof Order, productProp: keyof Product) => isOrder ? (details as Order)[orderProp] : (details as Product)[productProp];

    switch (stageKey) {
        case 'bobinaj':
            return <>{renderDetail('kW', getProp('kw', 'kw'))} {renderDetail('RPM', getProp('rpm', 'rpm'))} {renderDetail('Voltaj', getProp('volt', 'volt'))}</>;
        case 'milIsleme':
        case 'rotorluMilIsleme':
        case 'rotorluMilTaslama':
            return <>{renderDetail('Mil Kodu', getProp('milKod', 'milCode'))}</>;
        case 'kapakIsleme':
        case 'kapakTaslama':
            return <>{renderDetail('Kapak', getProp('kapak', 'm_cover'))} {renderDetail('Rulman', getProp('rulman', 'm_rulman'))}</>;
        case 'montaj':
            return <>
                {renderDetail('kW', getProp('kw', 'm_kw'))} {renderDetail('RPM', getProp('rpm', 'm_rpm'))} {renderDetail('Voltaj', getProp('volt', 'm_volt'))}
                {renderDetail('Mil Kodu', getProp('milKod', 'milCode'))} {renderDetail('Kapak', getProp('kapak', 'm_cover'))} {renderDetail('Rulman', getProp('rulman', 'm_rulman'))}
            </>;
        default:
            return <>{renderDetail('Ürün', getProp('urun', 'name'))}</>;
    }
});


// A unified task structure for the view
export interface DisplayTask {
  id: string; // Unique key for the row (e.g., order.id-stageKey or wo.id-stageKey)
  type: 'Sipariş' | 'Stok Emri';
  taskNo: string;
  customerOrTarget: string;
  productName: string;
  quantity: number;
  createdAt: string;
  dueDate: string;
  technicalDetails: Order | Product;
  stageKey: string;
  stageDetails: ImalatAsamaDetay;
  original: Order | WorkOrder;
}

const AddWorkOrderRow: React.FC<{
  products: { value: string; label: string }[];
  getProductById: (id: string) => Product | undefined;
  stageKey: string;
  onSave: (data: { productId: string; quantity: number; dueDate?: string }) => void;
  onCancel: () => void;
}> = ({ products, getProductById, stageKey, onSave, onCancel }) => {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState<string>('1');
  const [dueDate, setDueDate] = useState('');
  const { showToast } = useUI();

  const selectedProduct = useMemo(() => getProductById(productId), [productId, getProductById]);

  const handleSave = () => {
    const numQuantity = parseLocaleNumber(quantity);
    if (!productId || numQuantity === null || numQuantity <= 0) {
      showToast("Lütfen geçerli bir ürün ve miktar girin.", "error");
      return;
    }
    onSave({ productId, quantity: numQuantity, dueDate });
  };
  
  const inputClass = "w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs";

  return (
    <tr className="bg-slate-50 dark:bg-slate-700/50">
      <td data-label="İş Emri No" className="p-2 font-semibold text-orange-500">YENİ</td>
      {stageKey === 'all' && <td data-label="Aşama" className="p-2">-</td>}
      <td data-label="Tip" className="p-2">Stok Emri</td>
      <td data-label="Müşteri/Hedef" className="p-2">Stok</td>
      <td data-label="Ürün Adı" className="p-2">
        <select value={productId} onChange={e => setProductId(e.target.value)} required className={inputClass}>
          <option value="">-- Ürün Seç --</option>
          {products.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </td>
      <td data-label="Adet" className="p-2">
        <input type="text" value={quantity} onChange={e => setQuantity(e.target.value)} required className={`${inputClass} text-right`} />
      </td>
      <td data-label="Teknik Detaylar" className="p-2">
        <TechnicalDetailsCell details={selectedProduct || null} stageKey={stageKey} />
      </td>
      <td data-label="Oluşturma" className="p-2">-</td>
      <td data-label="Sipariş Termini" className="p-2">
        <DatePicker value={dueDate} onChange={setDueDate} placeholder="gg/aa/yyyy" className={inputClass} />
      </td>
      <td data-label="Aşama Termini" className="p-2">-</td>
      <td data-label="Durum" className="p-2">-</td>
      <td data-label="İşlemler" className="p-2">
        <div className="flex items-center gap-2">
          <button onClick={handleSave} className="px-3 py-1.5 text-xs rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-200 hover:bg-green-100">
              Kaydet
          </button>
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600">
              İptal
          </button>
        </div>
      </td>
    </tr>
  );
};


interface StageViewProps {
    tasks: DisplayTask[];
    stageKey: string;
    onUpdateStatus: (task: DisplayTask, newStatus: ImalatAsamaDurum) => void;
    onUpdateTermin: (task: DisplayTask, newTermin: string) => Promise<void>;
    onUpdateWorkOrder: (woId: string, field: keyof WorkOrder, value: any) => Promise<void>;
    onDeleteWorkOrder?: (wo: WorkOrder) => void;
    onPermanentDeleteOrder: (order: Order) => void;
    isAddingWorkOrder: boolean;
    onSaveWorkOrder: (data: { productId: string; quantity: number; dueDate?: string }) => void;
    onCancelAddWorkOrder: () => void;
    manufacturableProducts: { value: string; label: string }[];
    getProductById: (id: string) => Product | undefined;
}
const StageView: React.FC<StageViewProps> = ({ tasks, stageKey, onUpdateStatus, onUpdateTermin, onUpdateWorkOrder, onDeleteWorkOrder, onPermanentDeleteOrder, isAddingWorkOrder, onSaveWorkOrder, onCancelAddWorkOrder, manufacturableProducts, getProductById }) => {
    const { checkPermission } = useAuth();
    const isAdmin = checkPermission('hertz');

    if (tasks.length === 0 && !isAddingWorkOrder) {
        return <div className="text-center py-16 text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700">Bu aşamada bekleyen iş emri bulunmuyor.</div>
    }

    return (
        <div className="overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <table className="w-full text-sm responsive-table">
                <thead className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    <tr>
                        <th className="text-left px-4 py-3">İş Emri No</th>
                        {stageKey === 'all' && <th className="text-left px-4 py-3">Aşama</th>}
                        <th className="text-left px-4 py-3">Tip</th>
                        <th className="text-left px-4 py-3">Müşteri/Hedef</th>
                        <th className="text-left px-4 py-3">Ürün Adı</th>
                        <th className="text-right px-4 py-3">Adet</th>
                        <th className="text-left px-4 py-3">Teknik Detaylar</th>
                        <th className="text-left px-4 py-3">Oluşturma</th>
                        <th className="text-left px-4 py-3">Sipariş Termini</th>
                        <th className="text-left px-4 py-3">Aşama Termini</th>
                        <th className="text-left px-4 py-3">Durum</th>
                        <th className="text-left px-4 py-3">İşlemler</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {isAddingWorkOrder && (
                        <AddWorkOrderRow 
                            products={manufacturableProducts}
                            getProductById={getProductById}
                            stageKey={stageKey}
                            onSave={onSaveWorkOrder}
                            onCancel={onCancelAddWorkOrder}
                        />
                    )}
                    {tasks.map((task) => {
                        const { stageDetails } = task;
                        const isCancelled = task.type === 'Sipariş' && !!(task.original as Order).isCancelled;
                        const statusColors = DURUM_RENKLERI[stageDetails.durum];
                        const isUrgent = !isCancelled && task.dueDate && (parseAnyDate(task.dueDate) || new Date()) < new Date();
                        
                        return (
                            <tr key={task.id} className={`dark:hover:bg-slate-700/50 ${isUrgent ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''} ${isCancelled ? 'opacity-60' : ''}`}>
                                <td data-label="İş Emri No" className="p-4 font-semibold">{task.taskNo}</td>
                                {stageKey === 'all' && <td data-label="Aşama" className="p-4">{IMALAT_ASAMALARI.find(s => s.key === task.stageKey)?.label}</td>}
                                <td data-label="Tip" className="p-4">{task.type}</td>
                                <td data-label="Müşteri/Hedef" className="p-4" dangerouslySetInnerHTML={{ __html: task.customerOrTarget }} />
                                <td data-label="Ürün Adı" className="p-4">{task.productName}</td>
                                <td data-label="Adet" className="p-4 text-right">
                                     {task.type === 'Sipariş' ? formatNumber(task.quantity) : (
                                        <EditableCell
                                            recordId={task.original.id}
                                            value={task.quantity}
                                            onSave={newValue => onUpdateWorkOrder(task.original.id, 'quantity', newValue)}
                                            type="number"
                                        />
                                    )}
                                </td>
                                <td data-label="Teknik Detaylar" className="p-4"><TechnicalDetailsCell details={task.technicalDetails} stageKey={task.stageKey} /></td>
                                <td data-label="Oluşturma" className="p-4">{task.createdAt}</td>
                                <td data-label="Sipariş Termini" className="p-4">
                                    {task.type === 'Sipariş' ? task.dueDate : (
                                        <EditableDateCell
                                            value={task.dueDate}
                                            onSave={newDate => onUpdateWorkOrder(task.original.id, 'dueDate', newDate)}
                                            canEdit={!isCancelled}
                                        />
                                    )}
                                </td>
                                <td data-label="Aşama Termini" className="p-4">
                                    <EditableDateCell
                                        value={stageDetails.termin}
                                        onSave={(newTermin) => onUpdateTermin(task, newTermin)}
                                        canEdit={!isCancelled}
                                    />
                                </td>
                                <td data-label="Durum" className="p-4">
                                    {isCancelled ? (
                                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300`}>
                                            İptal Edildi
                                        </span>
                                    ) : (
                                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${statusColors.bg} ${statusColors.text}`}>
                                            {DURUM_ETIKETLERI[stageDetails.durum]}
                                        </span>
                                    )}
                                </td>
                                <td data-label="İşlemler" className="p-4">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {isAdmin && task.type === 'Sipariş' && (
                                            <button onClick={() => onPermanentDeleteOrder(task.original as Order)} className="px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs" title="Kalıcı olarak sil">
                                                Sil
                                            </button>
                                        )}
                                        {!isCancelled && (
                                            <>
                                                {stageDetails.durum === 'bekliyor' && (
                                                    <button onClick={() => onUpdateStatus(task, 'imalatta')} className="px-3 py-1.5 text-xs rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 hover:bg-blue-100">
                                                        İşe Başla
                                                    </button>
                                                )}
                                                {stageDetails.durum === 'imalatta' && (
                                                    <>
                                                        <button onClick={() => onUpdateStatus(task, 'hazir')} className="px-3 py-1.5 text-xs rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-200 hover:bg-green-100">
                                                            İşi Bitir
                                                        </button>
                                                        <button onClick={() => onUpdateStatus(task, 'bekliyor')} className="px-3 py-1.5 text-xs rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-100">
                                                            İşi Durdur
                                                        </button>
                                                    </>
                                                )}
                                                {task.type === 'Stok Emri' && onDeleteWorkOrder && (
                                                    <button onClick={() => onDeleteWorkOrder(task.original as WorkOrder)} className="px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs" title="İş emrini sil">
                                                        Sil
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    );
};

const CompletedTasksView: React.FC<{
    tasks: DisplayTask[];
    onUndoStatus: (task: DisplayTask) => void;
}> = ({ tasks, onUndoStatus }) => {
    const [stageFilter, setStageFilter] = useState('all');

    const filteredTasks = useMemo(() => {
        return tasks
            .filter(task => stageFilter === 'all' || task.stageKey === stageFilter)
            .sort((a, b) => new Date(b.stageDetails.tamamlanmaTarihi!).getTime() - new Date(a.stageDetails.tamamlanmaTarihi!).getTime());
    }, [tasks, stageFilter]);
    
    if (tasks.length === 0) {
        return <div className="text-center py-16 text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700">Henüz tamamlanmış bir iş bulunmuyor.</div>
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="px-3 py-2 border rounded-xl w-full max-w-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600">
                    <option value="all">Tüm Aşamaları Filtrele</option>
                    {IMALAT_ASAMALARI.map(stage => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
                </select>
            </div>
            <div className="overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                 <table className="w-full text-sm responsive-table">
                    <thead className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        <tr>
                            <th className="text-left px-4 py-3">İş Emri No</th>
                            <th className="text-left px-4 py-3">Aşama</th>
                            <th className="text-left px-4 py-3">Müşteri/Hedef</th>
                            <th className="text-left px-4 py-3">Ürün Adı</th>
                            <th className="text-right px-4 py-3">Adet</th>
                            <th className="text-left px-4 py-3">Tamamlanma Tarihi</th>
                            <th className="text-left px-4 py-3">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {filteredTasks.map(task => (
                             <tr key={task.id} className="dark:hover:bg-slate-700/50">
                                <td data-label="İş Emri No" className="p-4 font-semibold">{task.taskNo}</td>
                                <td data-label="Aşama" className="p-4">{IMALAT_ASAMALARI.find(s => s.key === task.stageKey)?.label}</td>
                                <td data-label="Müşteri/Hedef" className="p-4" dangerouslySetInnerHTML={{ __html: task.customerOrTarget }} />
                                <td data-label="Ürün Adı" className="p-4">{task.productName}</td>
                                <td data-label="Adet" className="p-4 text-right">{formatNumber(task.quantity)}</td>
                                <td data-label="Tamamlanma Tarihi" className="p-4">{formatDateTimeTR(task.stageDetails.tamamlanmaTarihi)}</td>
                                <td data-label="İşlemler" className="p-4">
                                    <button onClick={() => onUndoStatus(task)} className="p-1.5 flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-xs">
                                        <Icon name="undo-2" size={14} />
                                        <span>Geri Al</span>
                                    </button>
                                </td>
                             </tr>
                        ))}
                    </tbody>
                 </table>
            </div>
        </div>
    );
};


export const calculateWorkOrderImalatDurumu = (productToBuild: Product, workOrderQuantity: number, stockProducts: Product[], boms: BOM[]): Record<string, ImalatAsamaDetay> => {
    const imalatDurumu: Record<string, ImalatAsamaDetay> = Object.fromEntries(IMALAT_ASAMALARI.map(s => [s.key, { durum: 'bekliyor' }]));

    if (productToBuild.m_cover === 'AK') {
        imalatDurumu.kapakTaslama = { durum: 'hazir' };
    }

    const matchingBom = boms.find(bom => bom.targetSku === productToBuild.sku);
    
    if (matchingBom) {
        const categoryToStageMap: Partial<Record<ProductCategory, string[]>> = {
            sargiliPaket: ['bobinaj'], paketliGovde: ['govdeImalat'], taslanmisMil: ['milIsleme', 'rotorluMilIsleme', 'rotorluMilTaslama'],
            islenmisKapak: ['kapakIsleme'], taslanmisKapak: ['kapakTaslama'],
        };
        matchingBom.components.forEach(component => {
            const productInStock = stockProducts.find(p => p.id === component.productId);
            const requiredQuantity = workOrderQuantity * component.quantity;
            if (productInStock && productInStock.qty >= requiredQuantity) {
                 const stagesToSkip = categoryToStageMap[productInStock.category];
                 if (stagesToSkip) stagesToSkip.forEach(stageKey => { imalatDurumu[stageKey] = { durum: 'hazir' }; });
            }
        });
    }
    return imalatDurumu;
};

const Manufacturing: React.FC = () => {
    const { dataStore, pushData } = useData();
    const { showToast, showConfirmation } = useUI();
    const { user } = useAuth();
    const { handleUpdateStatus } = useManufacturingAutomation();

    const visibleTabs = useMemo(() => {
        return [
            { key: 'all', label: 'Tüm İşler', group: 'all' },
            ...IMALAT_ASAMALARI
        ];
    }, []);

    const [activeStageKey, setActiveStageKey] = useState('all');
    const [viewMode, setViewMode] = useState<'active' | 'completed' | 'analysis'>('active');
    const [stageForNewWorkOrder, setStageForNewWorkOrder] = useState<string | null>(null);
    
    useEffect(() => {
        // Safeguard: If the active stage is no longer visible, reset it.
        if (!visibleTabs.some(tab => tab.key === activeStageKey)) {
            setActiveStageKey('all');
        }
    }, [visibleTabs, activeStageKey]);
    
    const { orders, workOrders, products, getContactNameById, getProductById, logAction, boms, customers } = useMemo(() => {
        const contacts = dataStore.contacts || [];
        const customers = contacts.filter(c => c.type === 'customer');
        const products = dataStore['stokTakip-v1']?.products || [];
        const logAction = (no: string, islem: string) => {
            const newLog: OrderLog = { no, islem, user: user?.username || 'Bilinmiyor', tarih: new Date().toISOString() };
            pushData('siparisLog', (prev: OrderLog[] = []) => [newLog, ...prev]);
        };
        return {
            orders: dataStore.siparisler || [],
            workOrders: dataStore.workOrders || [],
            products: products,
            boms: dataStore.boms || [],
            getContactNameById: (id: string) => contacts.find(c => c.id === id)?.name || `<span class="italic text-slate-400">Bilinmeyen Firma</span>`,
            getProductById: (id: string) => products.find(p => p.id === id),
            logAction,
            customers
        };
    }, [dataStore, user, pushData]);
    
    const manufacturableProducts = useMemo(() => 
        products
            .filter(p => p.kind === 'mamul' || p.kind === 'yari')
            .map(p => ({ value: p.id, label: `${p.name} (${p.sku})`, product: p }))
            .sort((a,b) => a.label.localeCompare(b.label, 'tr')), 
        [products]
    );

    const filteredManufacturableProducts = useMemo(() => {
        if (activeStageKey === 'all') return manufacturableProducts;
        
        const activeStageGroup = IMALAT_ASAMALARI.find(s => s.key === activeStageKey)?.group;
        if (!activeStageGroup) return manufacturableProducts;

        const relevantCategories: Record<string, ProductCategory[]> = {
            bobinaj: ['sargiliPaket', 'paketliGovde', 'motor'],
            govdeImalat: ['paketliGovde', 'motor'],
            milIsleme: ['mil', 'rotorluMil', 'taslanmisMil', 'motor'],
            kapakIsleme: ['kapak', 'islenmisKapak', 'taslanmisKapak', 'motor'],
            montaj: ['motor'],
        };

        const categoriesForGroup = relevantCategories[activeStageGroup];
        if (!categoriesForGroup) return manufacturableProducts;

        return manufacturableProducts.filter(p => categoriesForGroup.includes(p.product.category));
    }, [activeStageKey, manufacturableProducts]);
    
    const handleUpdateTermin = useCallback(async (task: DisplayTask, newTermin: string) => {
        const { original, stageKey } = task;
        const isWorkOrder = 'productId' in original;
        const originalId = original.id;

        const updateItem = <T extends { id: string; imalatDurumu?: any; }>(item: T): T => {
            if (item.id !== originalId) {
                return item;
            }

            const newImalatDurumu = { ...(item.imalatDurumu || {}) };
            const newStageDetails = { ...(newImalatDurumu[stageKey] || { durum: 'bekliyor' }) };
            newStageDetails.termin = newTermin;
            newImalatDurumu[stageKey] = newStageDetails;

            return { ...item, imalatDurumu: newImalatDurumu };
        };
        
        try {
            if (isWorkOrder) {
                await pushData('workOrders', (list: WorkOrder[] = []) => list.map(updateItem));
            } else {
                await pushData('siparisler', (list: Order[] = []) => list.map(updateItem));
            }
            showToast("Aşama termini güncellendi.", "success");
        } catch(e) {
            showToast("Termin güncellenemedi.", "error");
            throw e;
        }

    }, [pushData, showToast]);
    
    const handleUpdateWorkOrder = useCallback(async (woId: string, field: keyof WorkOrder, value: any) => {
        if (field === 'quantity') {
            const numValue = parseLocaleNumber(value);
            if (numValue === null || numValue < 0) {
                showToast("Geçersiz miktar.", "error");
                throw new Error("Invalid quantity");
            }
            value = numValue;
        }
        try {
            await pushData('workOrders', (prev: WorkOrder[] = []) => 
                prev.map(w => w.id === woId ? { ...w, [field]: value } : w)
            );
            showToast("İş emri güncellendi.", "success");
        } catch(e) {
            showToast("İş emri güncellenemedi.", "error");
            throw e;
        }
    }, [pushData, showToast]);


    const handleSaveWorkOrder = useCallback((data: { productId: string; quantity: number; dueDate?: string }) => {
        const { productId, quantity, dueDate } = data;
        const product = getProductById(productId);
        if (!product) {
            showToast("Üretilecek ürün bulunamadı.", "error");
            return;
        }

        const stageKey = stageForNewWorkOrder;
        if (!stageKey || stageKey === 'all') {
            showToast("İş emri eklenecek geçerli bir aşama seçilmelidir.", "error");
            setStageForNewWorkOrder(null);
            return;
        }

        const now = new Date();
        const prefix = `ISE-${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}-`;
        
        pushData('workOrders', (prev: WorkOrder[] = []) => {
            const maxSeq = prev.filter(o => o.no?.startsWith(prefix)).reduce((max, o) => Math.max(max, parseInt(o.no.slice(prefix.length), 10) || 0), 0);
            const newWorkOrderNo = `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
    
            const newWorkOrder: WorkOrder = {
                id: crypto.randomUUID(),
                no: newWorkOrderNo,
                productId,
                quantity,
                dueDate,
                status: 'beklemede',
                createdAt: now.toISOString(),
                imalatDurumu: {
                    [stageKey]: { durum: 'bekliyor' }
                },
            };
            return [...prev, newWorkOrder];
        });
        
        showToast("Stoğa yeni iş emri eklendi.", "success");
        setStageForNewWorkOrder(null);

    }, [getProductById, pushData, showToast, stageForNewWorkOrder]);

    const handleDeleteWorkOrder = useCallback((wo: WorkOrder) => {
        showConfirmation({
            title: "İş Emrini Sil",
            message: `'${wo.no}' numaralı iş emri kalıcı olarak silinecektir. Bu işlem ilgili tüm imalat aşamalarını da iptal edecektir.`,
            confirmText: "Evet, Sil",
            requiresInput: null,
            onConfirm: () => {
                return pushData('workOrders', (prev: WorkOrder[] = []) => prev.filter(w => w.id !== wo.id)).then(() => {
                    showToast("İş emri silindi.", "success");
                });
            }
        });
    }, [pushData, showToast, showConfirmation]);

    const handlePermanentDeleteOrder = useCallback((orderToDelete: Order) => {
        showConfirmation({
            title: "Siparişi Kalıcı Olarak Sil",
            message: `'${orderToDelete.no}' numaralı sipariş ve tüm imalat verileri kalıcı olarak silinecektir. Bu işlem geri alınamaz.`,
            confirmText: "Evet, Kalıcı Olarak Sil",
            requiresInput: "SİL",
            onConfirm: () => {
                return pushData('siparisler', (prev: Order[] = []) => prev.filter(o => o.id !== orderToDelete.id)).then(() => {
                    logAction(orderToDelete.no, "Sipariş kalıcı olarak silindi (Admin)");
                    showToast("Sipariş kalıcı olarak silindi.", "success");
                });
            }
        });
    }, [pushData, showToast, showConfirmation, logAction]);

    const { activeTasksForView, completedTasks } = useMemo(() => {
        const allDisplayTasks: DisplayTask[] = [];
        const activeOrders = orders.filter(o => !o.sevkeHazir && !o.isCancelled);
        const activeWorkOrders = workOrders; 

        const allItems = [...activeOrders, ...activeWorkOrders];

        for (const item of allItems) {
            if (!item.imalatDurumu) continue;
            const isOrder = 'musteriId' in item;
            
            for(const stageKey in item.imalatDurumu) {
                if (Object.prototype.hasOwnProperty.call(item.imalatDurumu, stageKey)) {
                    const stageDetails = item.imalatDurumu[stageKey];
                    const productDetails = isOrder ? null : getProductById((item as WorkOrder).productId);

                    allDisplayTasks.push({
                        id: `${item.id}-${stageKey}`,
                        type: isOrder ? 'Sipariş' : 'Stok Emri',
                        taskNo: isOrder ? (item as Order).no : (item as WorkOrder).no,
                        customerOrTarget: isOrder ? getContactNameById((item as Order).musteriId) : 'Stok',
                        productName: isOrder ? (item as Order).urun : productDetails?.name || 'Bilinmeyen Ürün',
                        quantity: isOrder ? (item as Order).adet || 1 : (item as WorkOrder).quantity,
                        createdAt: formatDateTR(isOrder ? (item as Order).eklenmeTarihi : (item as WorkOrder).createdAt),
                        dueDate: formatDateTR(isOrder ? (item as Order).sevkTarihi : (item as WorkOrder).dueDate),
                        technicalDetails: (isOrder ? item as Order : productDetails) as Order | Product,
                        stageKey: stageKey,
                        stageDetails: stageDetails,
                        original: item
                    });
                }
            }
        }
        
        const activeTasks = allDisplayTasks.filter(t => t.stageDetails.durum !== 'hazir');
        const completedTasks = allDisplayTasks.filter(t => t.stageDetails.durum === 'hazir');

        const filteredActiveTasks = activeTasks.filter(task => {
            return activeStageKey === 'all' || task.stageKey === activeStageKey;
        });

        return {
            activeTasksForView: filteredActiveTasks.sort((a,b) => (parseAnyDate(a.dueDate)?.getTime() || Infinity) - (parseAnyDate(b.dueDate)?.getTime() || Infinity)),
            completedTasks
        };
    }, [orders, workOrders, activeStageKey, getContactNameById, getProductById]);

    return (
        <div className="p-3 md:p-4 space-y-4">
             <div className="flex flex-wrap justify-between items-center gap-4">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">İmalat Takip</h2>
                <div className="flex items-center gap-4 flex-wrap">
                    <ModuleDataManager
                        moduleName="İmalat Takip"
                        onExport={() => exportImalatData(dataStore)}
                        onImport={importImalatData}
                        onDelete={deleteImalatData}
                    />
                     <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl inline-flex border border-slate-200 dark:border-slate-700">
                        <nav className="flex space-x-1">
                            <button onClick={() => setViewMode('active')} className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${viewMode === 'active' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-700 dark:text-slate-300'}`}>Aktif İşler</button>
                            <button onClick={() => setViewMode('completed')} className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${viewMode === 'completed' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-700 dark:text-slate-300'}`}>Tamamlanan İşler</button>
                            <button onClick={() => setViewMode('analysis')} className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${viewMode === 'analysis' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-700 dark:text-slate-300'}`}>Analiz</button>
                        </nav>
                    </div>
                </div>
            </div>
            
            {viewMode === 'active' && (
                <div className="space-y-4">
                    {visibleTabs.length > 0 && (
                        <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 mobile-scroll-nav-container">
                            <nav className="flex flex-nowrap space-x-1 mobile-scroll-nav">
                                {visibleTabs.map(tab => (
                                    <button key={tab.key} onClick={() => setActiveStageKey(tab.key)}
                                        className={`py-2 px-4 border text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${activeStageKey === tab.key ? 'border-orange-500 text-orange-600 bg-white dark:bg-slate-700 shadow-sm' : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100'}`}>
                                        {tab.label}
                                    </button>
                                ))}
                            </nav>
                        </div>
                    )}
                    {activeStageKey !== 'all' && (
                      <div className="flex justify-end">
                        <button 
                          onClick={() => setStageForNewWorkOrder(activeStageKey)} 
                          disabled={stageForNewWorkOrder !== null}
                          className="px-3 py-2 rounded-xl btn-brand disabled:bg-orange-300 dark:disabled:bg-orange-800/50 disabled:cursor-not-allowed"
                        >
                          + Stoğa İş Emri Ekle
                        </button>
                      </div>
                    )}
                     <StageView 
                        tasks={activeTasksForView} 
                        stageKey={activeStageKey} 
                        onUpdateStatus={handleUpdateStatus} 
                        onUpdateTermin={handleUpdateTermin}
                        onUpdateWorkOrder={handleUpdateWorkOrder}
                        onDeleteWorkOrder={handleDeleteWorkOrder}
                        onPermanentDeleteOrder={handlePermanentDeleteOrder}
                        isAddingWorkOrder={stageForNewWorkOrder === activeStageKey}
                        onSaveWorkOrder={handleSaveWorkOrder}
                        onCancelAddWorkOrder={() => setStageForNewWorkOrder(null)}
                        manufacturableProducts={filteredManufacturableProducts}
                        getProductById={getProductById}
                    />
                </div>
            )}
            
            {viewMode === 'completed' && (
                <CompletedTasksView tasks={completedTasks} onUndoStatus={(task) => handleUpdateStatus(task, 'bekliyor')} />
            )}
            
            {viewMode === 'analysis' && (
                <ManufacturingAnalysis orders={orders} workOrders={workOrders} customers={customers} products={products} />
            )}
        </div>
    );
};

export default Manufacturing;