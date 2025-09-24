import { useCallback } from 'react';
import { useData, useUI } from '../App';
import { Product, WorkOrder, ProductCategory } from '../types';

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

export const useStockAutomation = () => {
    const { pushData } = useData();
    const { showToast } = useUI();

    const triggerWorkOrderForLowStock = useCallback(
        (updatedProducts: Product[], checkedProductIds: string[]) => {
            const productsToReorder: Product[] = [];

            for (const productId of checkedProductIds) {
                const product = updatedProducts.find(p => p.id === productId);

                if (
                    product &&
                    product.kind === 'yari' && // Only for semi-finished goods
                    product.min !== undefined &&
                    product.qty < product.min
                ) {
                    // The check for an existing active work order will now happen inside the transaction
                    productsToReorder.push(product);
                }
            }

            if (productsToReorder.length > 0) {
                const now = new Date();
                const prefix = `ISE-${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}-`;
                
                pushData('workOrders', (prevWorkOrders: WorkOrder[] = []) => {
                    // Inside the transaction, check which products STILL need reordering against the LATEST data.
                    const productsThatStillNeedReordering = productsToReorder.filter(p => {
                        const hasActiveWorkOrder = prevWorkOrders.some(
                           wo => wo.productId === p.id && wo.status !== 'tamamlandi'
                       );
                       return !hasActiveWorkOrder;
                   });

                   if (productsThatStillNeedReordering.length === 0) {
                        return prevWorkOrders; // Abort if other users already created the necessary work orders.
                   }

                    let maxSeq = prevWorkOrders
                        .filter(o => o.no?.startsWith(prefix))
                        .reduce((max, o) => Math.max(max, parseInt(o.no.slice(prefix.length), 10) || 0), 0);
                    
                    const newWorkOrders: WorkOrder[] = [];

                    for (const product of productsThatStillNeedReordering) {
                        const stageKey = categoryToStageMap[product.category];
                        if (!stageKey) {
                            console.warn(`No manufacturing stage mapping for category: ${product.category}`);
                            continue;
                        }

                        maxSeq++;
                        const newWorkOrderNo = `${prefix}${String(maxSeq).padStart(3, '0')}`;
                        
                        const newWorkOrder: WorkOrder = {
                            id: crypto.randomUUID(),
                            no: newWorkOrderNo,
                            productId: product.id,
                            quantity: BATCH_SIZE, // Default batch size
                            status: 'beklemede',
                            createdAt: now.toISOString(),
                            imalatDurumu: {
                                [stageKey]: { durum: 'bekliyor' }
                            },
                        };
                        newWorkOrders.push(newWorkOrder);
                    }

                    if (newWorkOrders.length > 0) {
                        // The actual toast will be shown in the .then() block after the push succeeds.
                        return [...prevWorkOrders, ...newWorkOrders];
                    }

                    return prevWorkOrders; // Return original state if no changes
                }).then(() => {
                    const createdNames = productsToReorder.map(p => p.name).join(', ');
                    showToast(`'${createdNames}' için otomatik iş emri(leri) oluşturuldu.`, 'success');
                }).catch(err => {
                    console.error("Failed to create automatic work orders:", err);
                    showToast("Otomatik iş emri oluşturulamadı.", "error");
                });
            }
        },
        [pushData, showToast]
    );
    
    return { triggerWorkOrderForLowStock };
};