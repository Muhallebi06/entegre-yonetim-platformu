import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useData, useUI, useAuth } from '../App';
import { Product, InventoryLog, WorkOrder, ProductCategory, DataStore } from '../types';
import { StokTakipData } from '../types';
import { parseLocaleNumber } from '../utils/helpers';
import { pushAtomicData } from '../services/firebase';

const BATCH_SIZE = 20;

const categoryToStageMap: Partial<Record<ProductCategory, string>> = {
    sargiliPaket: 'bobinaj',
    paketliGovde: 'govdeImalat',
    taslanmisMil: 'rotorluMilTaslama',
    islenmisKapak: 'kapakIsleme',
    taslanmisKapak: 'kapakTaslama',
    rotorluMil: 'rotorluMilIsleme',
    mil: 'milIsleme'
};

export const AdjustStockModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}> = ({ isOpen, onClose, product }) => {
  const { dataStore, pushData } = useData();
  const { showToast } = useUI();
  const { user } = useAuth();
  const [type, setType] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
        setAmount('');
        setNote('');
        setType('in');
    }
  }, [isOpen]);

  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && !dialog?.open) dialog?.showModal();
    else if (!isOpen && dialog?.open) dialog?.close();
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;

    const parsedAmount = parseLocaleNumber(amount);

    if (parsedAmount === null || parsedAmount <= 0) {
      showToast("Lütfen geçerli pozitif bir miktar girin.", "error");
      return;
    }

    setIsSubmitting(true);
    
    let needsWorkOrder = false;
    let finalProductState: Product | null = null;
    let workOrderCreated = false;

    const updaters: { [K in keyof DataStore]?: (prev: any) => any } = {};

    updaters['stokTakip-v1'] = (prev: StokTakipData) => {
        const products = [...(prev?.products || [])];
        const logs = [...(prev?.logs || [])];
        const productIndex = products.findIndex(p => p.id === product.id);
        
        if (productIndex > -1) {
            const oldQty = products[productIndex].qty;
            const newQty = type === 'in' ? oldQty + parsedAmount : oldQty - parsedAmount;

            if(newQty < 0) {
                // This will abort the transaction
                throw new Error("Stok eksiye düşürülemez.");
            }

            products[productIndex] = { ...products[productIndex], qty: newQty };
            finalProductState = products[productIndex]; // Capture state for next updater
            
            const newLog: InventoryLog = {
                id: self.crypto.randomUUID(), ts: new Date().toISOString(), user: user?.username || 'unknown',
                productId: product.id, type: type, amount: parsedAmount,
                fromQty: oldQty, toQty: newQty, note: note
            };
            logs.unshift(newLog);
            
            if (type === 'out' && finalProductState.kind === 'yari' && finalProductState.min !== undefined && finalProductState.qty < finalProductState.min) {
                needsWorkOrder = true;
            }
        }
        return { products, logs };
    };

    if (type === 'out') {
        updaters.workOrders = (prevWorkOrders: WorkOrder[] = []) => {
            if (!needsWorkOrder || !finalProductState) {
                return prevWorkOrders; // No change needed
            }
            
            const hasActiveWorkOrder = prevWorkOrders.some(
                wo => wo.productId === finalProductState!.id && wo.status !== 'tamamlandi'
            );
            
            if (hasActiveWorkOrder) {
                return prevWorkOrders; // Automation already handled
            }

            const stageKey = categoryToStageMap[finalProductState.category];
            if (!stageKey) return prevWorkOrders;

            const now = new Date();
            const prefix = `ISE-${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}-`;
            let maxSeq = prevWorkOrders
                .filter(o => o.no?.startsWith(prefix))
                .reduce((max, o) => Math.max(max, parseInt(o.no.slice(prefix.length), 10) || 0), 0);
            const newWorkOrderNo = `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
            
            const newWorkOrder: WorkOrder = {
                id: crypto.randomUUID(),
                no: newWorkOrderNo,
                productId: finalProductState.id,
                quantity: BATCH_SIZE,
                status: 'beklemede',
                createdAt: now.toISOString(),
                imalatDurumu: { [stageKey]: { durum: 'bekliyor' } },
            };
            workOrderCreated = true;
            return [...prevWorkOrders, newWorkOrder];
        };
    }
    
    try {
        await pushAtomicData(updaters);
        showToast("Stok güncellendi.", "success");
        if(workOrderCreated) {
            showToast(`'${finalProductState?.name}' için otomatik iş emri oluşturuldu.`, 'success');
        }
        onClose();
    } catch (error: any) {
        console.error("Failed to adjust stock atomically:", error);
        showToast(error.message || "Stok güncellenemedi.", "error");
    } finally {
        setIsSubmitting(false);
    }
  };

  const inputClass = "w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-orange-500 focus:border-orange-500";
  const labelClass = "text-sm text-slate-600 dark:text-slate-300";

  return (
    <dialog ref={dialogRef} onClose={onClose} className="rounded-2xl p-0 w-[96vw] max-w-lg bg-white dark:bg-slate-800">
        {isOpen && product && (
            <form onSubmit={handleSubmit} className="p-4 md:p-6" noValidate>
                <h3 className="text-lg font-semibold mb-1 text-slate-800 dark:text-slate-100">Stok Hareketi</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{product.name}</p>
                 <div className="space-y-3">
                    <div>
                        <label className={labelClass}>İşlem Türü</label>
                        <select value={type} onChange={e => setType(e.target.value as any)} className={inputClass}>
                            <option value="in">Giriş</option><option value="out">Çıkış</option>
                        </select>
                    </div>
                    <div><label className={labelClass}>Miktar ({product.unit})</label><input type="text" value={amount} onChange={e => setAmount(e.target.value)} required className={inputClass} /></div>
                    <div><label className={labelClass}>Not</label><input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="(Sipariş No, İrsaliye No, vb.)" className={inputClass} /></div>
                 </div>
                 <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600" disabled={isSubmitting}>Vazgeç</button>
                    <button type="submit" className="px-3 py-2 rounded-xl btn-brand min-w-[90px]" disabled={isSubmitting}>
                      {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                </div>
            </form>
        )}
    </dialog>
  );
};