import { useCallback } from 'react';
import { useData, useUI, useAuth } from '../App';
import { DisplayTask } from '../components/Manufacturing';
import { ImalatAsamaDurum, WorkOrder, Order, Product, BOM, InventoryLog, ImalatAsamaDetay, DataStore } from '../types';
// Fix: Import StokTakipData from ../types instead of ../services/firebase to avoid circular dependencies.
import { StokTakipData } from '../types';
import { pushData, pushAtomicData } from '../services/firebase';
import { findBestMatchingBom } from '../utils/helpers';
import { useStockAutomation } from './useStockAutomation';

export const useManufacturingAutomation = () => {
    const { dataStore, pushData, boms, products } = useData();
    const { showToast } = useUI();
    const { user } = useAuth();
    const { triggerWorkOrderForLowStock } = useStockAutomation();

    const getProductById = useCallback((id: string) => products.find(p => p.id === id), [products]);

    const handleUpdateStatus = useCallback((task: DisplayTask, newStatus: ImalatAsamaDurum) => {
        const { original, stageKey } = task;
        const oldStatus = task.stageDetails.durum;
        const isWorkOrder = 'productId' in original;
        const originalId = original.id;

        const updateItem = <T extends {id: string; imalatDurumu?: any, status?: any}>(item: T): T => {
            if (item.id !== originalId) return item;

            const newImalatDurumu = { ...(item.imalatDurumu || {}) };
            const newStageDetails = { ...(newImalatDurumu[stageKey] || { durum: 'bekliyor' }) };
            
            newStageDetails.durum = newStatus;
            if (newStatus === 'imalatta') {
                newStageDetails.atananKullanici = user?.username;
                newStageDetails.baslamaTarihi = new Date().toISOString();
            } else if (newStatus === 'hazir') {
                newStageDetails.tamamlanmaTarihi = new Date().toISOString();
                if (!newStageDetails.atananKullanici) newStageDetails.atananKullanici = user?.username;
                if (!newStageDetails.baslamaTarihi) newStageDetails.baslamaTarihi = new Date().toISOString(); // Fallback if user skips 'imalatta'
            } else if (newStatus === 'bekliyor') {
                newStageDetails.atananKullanici = undefined;
                newStageDetails.tamamlanmaTarihi = undefined;
                newStageDetails.baslamaTarihi = undefined;
            }
            newImalatDurumu[stageKey] = newStageDetails;
            
            const updatedItem = { ...item, imalatDurumu: newImalatDurumu };

            if (isWorkOrder) {
                const allStages = Object.values(newImalatDurumu || {}) as ImalatAsamaDetay[];
                const isCompleted = allStages.length > 0 && allStages.every(s => s.durum === 'hazir');
                const isInProgress = allStages.some(s => s.durum === 'imalatta');
                
                let newOverallStatus: WorkOrder['status'] = 'beklemede';
                if (isCompleted) newOverallStatus = 'tamamlandi';
                else if (isInProgress) newOverallStatus = 'imalatta';
                
                if (item.status !== newOverallStatus) updatedItem.status = newOverallStatus;
            }
            return updatedItem;
        };

        const involvesStockChange = (newStatus === 'hazir') || (oldStatus === 'hazir' && newStatus === 'bekliyor');

        if (!involvesStockChange) {
            const updatePromise = isWorkOrder
                ? pushData('workOrders', (list: WorkOrder[] = []) => list.map(updateItem))
                : pushData('siparisler', (list: Order[] = []) => list.map(updateItem));
            
            updatePromise
                .then(() => showToast("Durum güncellendi.", "success"))
                .catch(() => showToast("Durum güncellenemedi.", "error"));
            return;
        }

        // --- ATOMIC OPERATION FOR STOCK-RELATED UPDATES ---
        const updaters: { [K in keyof DataStore]?: (prev: any) => any } = {};
        
        // 1. Calculate the new state for the primary item (order or workOrder) first.
        const orderKey = isWorkOrder ? 'workOrders' : 'siparisler';
        const originalList = isWorkOrder ? (dataStore.workOrders || []) : (dataStore.siparisler || []);
        const updatedList = originalList.map(updateItem as (item: any) => any);
        updaters[orderKey] = () => updatedList;
        
        let successToasts: { msg: string; type: 'success' | 'error' }[] = [];
        
        // 2. Define the stock updater, providing it with the fresh work orders list for automation.
        updaters['stokTakip-v1'] = (prevInventory: StokTakipData) => {
            const products = [...(prevInventory?.products || [])];
            const logs = [...(prevInventory?.logs || [])];
            const now = new Date().toISOString();
            const currentUsername = user?.username || 'otomatik';
            let insufficientStockWarnings: string[] = [];
            let changedComponentIds: string[] = [];

            if (newStatus === 'hazir') {
                if (isWorkOrder) {
                    const wo = original as WorkOrder;
                    const productToCredit = getProductById(wo.productId);
                    if (productToCredit) {
                        const matchingBom = boms.find(b => b.targetSku === productToCredit.sku);
                        if (productToCredit.kind === 'yari' || productToCredit.kind === 'mamul') {
                            const pIdx = products.findIndex(p => p.id === productToCredit.id);
                            if (pIdx > -1) {
                                const oldQty = products[pIdx].qty;
                                products[pIdx].qty += wo.quantity;
                                logs.unshift({ id: self.crypto.randomUUID(), ts: now, user: currentUsername, productId: productToCredit.id, type: 'in', amount: wo.quantity, fromQty: oldQty, toQty: products[pIdx].qty, note: `'${task.taskNo}' nolu iş emrinden otomatik stok girişi.` });
                                successToasts.push({ msg: `'${productToCredit.name}' için ${wo.quantity} adet stok girişi yapıldı.`, type: 'success' });
                            }
                        }
                        if (matchingBom) {
                            successToasts.push({ msg: `'${productToCredit.name}' reçetesinin bileşenleri stoktan düşüldü.`, type: 'success' });
                            for (const c of matchingBom.components) {
                                changedComponentIds.push(c.productId);
                                const cIdx = products.findIndex(p => p.id === c.productId);
                                if (cIdx > -1) {
                                    const qDeduct = c.quantity * wo.quantity;
                                    const oldQty = products[cIdx].qty;
                                    if (oldQty < qDeduct) insufficientStockWarnings.push(products[cIdx].name);
                                    products[cIdx].qty -= qDeduct;
                                    logs.unshift({ id: self.crypto.randomUUID(), ts: now, user: currentUsername, productId: c.productId, type: 'out', amount: qDeduct, fromQty: oldQty, toQty: products[cIdx].qty, note: `Otomatik stok düşümü: '${task.taskNo}' için hammadde kullanımı.` });
                                }
                            }
                        }
                    }
                } else if (stageKey === 'montaj') {
                    const order = original as Order;
                    const matchingBom = findBestMatchingBom(order, boms);
                    if (matchingBom) {
                        changedComponentIds = matchingBom.components.map(c => c.productId);
                        for (const c of matchingBom.components) {
                            const pIdx = products.findIndex(p => p.id === c.productId);
                            if (pIdx > -1) {
                                const qDeduct = c.quantity * order.adet;
                                if (products[pIdx].qty < qDeduct) insufficientStockWarnings.push(products[pIdx].name);
                                const oldQty = products[pIdx].qty;
                                products[pIdx].qty -= qDeduct;
                                logs.unshift({ id: self.crypto.randomUUID(), ts: now, user: currentUsername, productId: c.productId, type: 'out', amount: qDeduct, fromQty: oldQty, toQty: products[pIdx].qty, note: `Motor montajı için otomatik stok düşümü: ${task.taskNo}` });
                            }
                        }
                        successToasts.push({ msg: `'${task.taskNo}' için reçete bileşenleri stoktan düşüldü.`, type: 'success' });
                    } else {
                        successToasts.push({ msg: `'${task.taskNo}' için uygun reçete bulunamadı, otomatik stok düşümü yapılamadı.`, type: 'error' });
                    }
                }
            } else if (oldStatus === 'hazir' && newStatus === 'bekliyor') {
                if (isWorkOrder) {
                    const wo = original as WorkOrder;
                    const productProduced = getProductById(wo.productId);
                    if (productProduced) {
                        const matchingBom = boms.find(b => b.targetSku === productProduced.sku);
                        if (productProduced.kind === 'yari' || productProduced.kind === 'mamul') {
                            const pIdx = products.findIndex(p => p.id === productProduced.id);
                            if (pIdx > -1) {
                                const oldQty = products[pIdx].qty;
                                products[pIdx].qty -= wo.quantity;
                                logs.unshift({ id: self.crypto.randomUUID(), ts: now, user: currentUsername, productId: productProduced.id, type: 'out', amount: wo.quantity, fromQty: oldQty, toQty: products[pIdx].qty, note: `'${task.taskNo}' geri alındı (üretilen ürün iadesi).` });
                            }
                        }
                        if (matchingBom) {
                            for (const c of matchingBom.components) {
                                const cIdx = products.findIndex(p => p.id === c.productId);
                                if (cIdx > -1) {
                                    const qReturn = c.quantity * wo.quantity;
                                    const oldQty = products[cIdx].qty;
                                    products[cIdx].qty += qReturn;
                                    logs.unshift({ id: self.crypto.randomUUID(), ts: now, user: currentUsername, productId: c.productId, type: 'in', amount: qReturn, fromQty: oldQty, toQty: products[cIdx].qty, note: `'${task.taskNo}' geri alındı (hammadde iadesi).` });
                                }
                            }
                        }
                        successToasts.push({ msg: `Stok hareketleri geri alındı: '${productProduced.name}'`, type: 'success' });
                    }
                } else if (stageKey === 'montaj') {
                    const order = original as Order;
                    const matchingBom = findBestMatchingBom(order, boms);
                    if (matchingBom) {
                        for (const c of matchingBom.components) {
                            const pIdx = products.findIndex(p => p.id === c.productId);
                            if (pIdx > -1) {
                                const qReturn = c.quantity * order.adet;
                                const oldQty = products[pIdx].qty;
                                products[pIdx].qty += qReturn;
                                logs.unshift({ id: self.crypto.randomUUID(), ts: now, user: currentUsername, productId: c.productId, type: 'in', amount: qReturn, fromQty: oldQty, toQty: products[pIdx].qty, note: `Montaj geri alındı (hammadde iadesi): ${task.taskNo}` });
                            }
                        }
                        successToasts.push({ msg: `'${task.taskNo}' için kullanılan bileşenler stoğa iade edildi.`, type: 'success' });
                    }
                }
            }

            if (insufficientStockWarnings.length > 0) {
                successToasts.push({ msg: `Uyarı: '${insufficientStockWarnings.join(', ')}' stokları yetersizdi.`, type: 'error' });
            }
            if (changedComponentIds.length > 0) {
                 triggerWorkOrderForLowStock(products, changedComponentIds);
            }
            return { products, logs };
        };

        pushAtomicData(updaters)
            .then(() => {
                showToast("Durum ve stoklar başarıyla güncellendi.", "success");
                successToasts.forEach((t, i) => setTimeout(() => showToast(t.msg, t.type), (i + 1) * 600));
            })
            .catch(err => {
                console.error("Atomic status/stock update failed:", err);
                showToast("Durum ve stoklar güncellenemedi. İşlem geri alındı.", "error");
            });

    }, [user, pushData, showToast, boms, getProductById, products, triggerWorkOrderForLowStock, dataStore]);

    return { handleUpdateStatus };
};