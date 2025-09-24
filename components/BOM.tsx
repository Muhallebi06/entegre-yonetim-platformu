import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useData, useUI, useAuth, Icon, ModuleDataManager, ProductSelectionModal, ProductFeatures } from '../App';
import { BOM, BOMComponent, Product, Company, ProductCategory, Order, DataStore } from '../types';
import { calculateImalatDurumuForOrder, fmtCurrency, areNumbersEqual, parseLocaleNumber, findBestMatchingBom, calculateCommittedQuantities } from '../utils/helpers';
import { exportBomsData, importBomsData, deleteBomsData } from '../services/firebase';
import { pushAtomicData } from '../services/firebase';


// A type for managing component state within the form, allowing for string/null quantities during editing.
type FormComponent = Omit<BOMComponent, 'quantity'> & { quantity: string | number | null; _key: string; };

const BomForm: React.FC<{
  onClose: () => void;
  bom: BOM | null;
}> = ({ onClose, bom }) => {
  const { dataStore, pushData, products, customers } = useData();
  const { showToast, showUiLoading, hideUiLoading } = useUI();
  const { checkPermission } = useAuth();
  const [formData, setFormData] = useState<Omit<Partial<BOM>, 'components'> & { components: FormComponent[] }>({ components: [], musteriIds: [] });
  const [targetProductId, setTargetProductId] = useState<string>('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const [totalCost, setTotalCost] = useState(0);
  
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [editingComponentKey, setEditingComponentKey] = useState<string | null>(null);

  const [isTargetSelectionModalOpen, setIsTargetSelectionModalOpen] = useState(false);
  
  const getProductById = useCallback((id: string) => (products || []).find(p => p.id === id), [products]);

  const manufacturableProducts = useMemo(() => 
    (products || []).filter(p => p.kind === 'mamul' || p.kind === 'yari')
    .sort((a,b) => a.name.localeCompare(b.name, 'tr')), 
  [products]);

  const targetProduct = useMemo(() => (products || []).find(p => p.id === targetProductId), [targetProductId, products]);

  const visibleCriteria = useMemo(() => {
    if (!targetProduct) return new Set<string>();
    const category = targetProduct.category as ProductCategory;
    
    const categoryToCriteriaMap: Partial<Record<ProductCategory, string[]>> = {
        motor: ['electrical', 'mounting', 'milKod', 'kapak'],
        paketliGovde: ['electrical', 'mounting'],
        sargiliPaket: ['electrical'],
        mil: ['milKod'],
        rotorluMil: ['milKod'],
        taslanmisMil: ['milKod'],
        kapak: ['kapak'],
        islenmisKapak: ['kapak'],
        taslanmisKapak: ['kapak'],
    };

    return new Set(categoryToCriteriaMap[category] || []);
  }, [targetProduct]);
  
  const unselectedCustomers = useMemo(() => {
    const selectedIds = new Set(formData.musteriIds || []);
    return (customers || []).filter(c => !selectedIds.has(c.id));
  }, [customers, formData.musteriIds]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
      if (bom) {
        const targetProductFound = (products || []).find(p => p.sku === bom.targetSku);
        setTargetProductId(targetProductFound?.id || '');
        setFormData({
            ...bom,
            components: bom.components.map(c => ({...c, _key: crypto.randomUUID()}))
        });
      } else {
        setTargetProductId('');
        setFormData({ name: '', targetSku: '', kw: '', rpm: '', volt: '', milKod: '', kapak: '', components: [], musteriIds: [] });
      }
  }, [bom, products]);

  useEffect(() => {
    if (!targetProductId) {
      if (!bom) { // Only clear if it's a new BOM form
        setFormData(prev => ({ ...prev, name: '', targetSku: '', kw: '', rpm: '', volt: '', milKod: '', kapak: '', pg_klemensYonu: undefined, pg_montajDeligi: undefined, pg_baglantiTipi: undefined }));
      }
      return;
    }

    const product = (products || []).find(p => p.id === targetProductId);
    if (product) {
        const isPaketliGovde = product.category === 'paketliGovde';
        setFormData(prev => ({
            ...prev,
            name: product.name,
            targetSku: product.sku,
            kw: product.kw ?? product.m_kw ?? prev.kw ?? '',
            rpm: product.rpm ?? product.m_rpm ?? prev.rpm ?? '',
            volt: product.volt ?? product.m_volt ?? prev.volt ?? '',
            milKod: product.milCode ?? product.milType ?? prev.milKod ?? '',
            kapak: product.m_cover ?? prev.kapak ?? '',
            pg_klemensYonu: isPaketliGovde ? product.pg_klemensYonu : prev.pg_klemensYonu,
            pg_montajDeligi: isPaketliGovde ? product.pg_montajDeligi : prev.pg_montajDeligi,
            pg_baglantiTipi: isPaketliGovde ? product.pg_baglantiTipi : prev.pg_baglantiTipi,
        }));
    }
  }, [targetProductId, products, bom]);
  
  useEffect(() => {
    const cost = (formData.components || []).reduce((total, comp) => {
        const product = (products || []).find(p => p.id === comp.productId);
        const quantity = parseLocaleNumber(comp.quantity);
        return total + ((product?.cost || 0) * (quantity || 0));
    }, 0);
    setTotalCost(cost);
  }, [formData.components, products]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleComponentQuantityChange = useCallback((keyToUpdate: string, value: string) => {
    setFormData(prev => {
        const newComponents = [...(prev.components || [])];
        const index = newComponents.findIndex(c => c._key === keyToUpdate);
        if (index === -1) return prev;
       
        const componentToUpdate = newComponents[index];
        const updatedComponent: FormComponent = { ...componentToUpdate, quantity: value };
        newComponents[index] = updatedComponent;

        return { ...prev, components: newComponents };
    });
  }, []);
  
  const openSelectionModalForNew = () => {
      setEditingComponentKey(null);
      setIsSelectionModalOpen(true);
  };
  
  const openSelectionModalForEdit = (key: string) => {
      setEditingComponentKey(key);
      setIsSelectionModalOpen(true);
  };
  
  const removeComponent = (keyToRemove: string) => {
    setFormData(prev => ({...prev, components: (prev.components || []).filter((c) => c._key !== keyToRemove)}));
  };

  const addCustomerToBom = (customerId: string) => {
    setFormData(prev => ({...prev, musteriIds: [...(prev.musteriIds || []), customerId]}));
    setCustomerDropdownOpen(false);
  };
  const removeCustomerFromBom = (customerId: string) => {
    setFormData(prev => ({...prev, musteriIds: (prev.musteriIds || []).filter(id => id !== customerId)}));
  };
  
  const handleComponentProductSelected = useCallback((selectedProduct: Product) => {
    setFormData(prev => {
        const currentComponents = prev.components || [];
        const isDuplicate = currentComponents.some(c => c.productId === selectedProduct.id);

        if (isDuplicate) {
            showToast("Bu bileşen zaten reçetede mevcut.", "error");
            return prev;
        }

        const newComponents = [...currentComponents];
        if (editingComponentKey) { // Editing existing component
            const index = newComponents.findIndex(c => c._key === editingComponentKey);
            if (index > -1) {
                newComponents[index] = { ...newComponents[index], productId: selectedProduct.id };
            }
        } else { // Adding new component
            const newComponent: FormComponent = {
                productId: selectedProduct.id,
                quantity: 1,
                _key: crypto.randomUUID()
            };
            newComponents.push(newComponent);
        }
        return { ...prev, components: newComponents };
    });
    
    setIsSelectionModalOpen(false);
    setEditingComponentKey(null);
  }, [editingComponentKey, showToast]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim() || !formData.targetSku?.trim()) {
      showToast("Lütfen bir Hedef Ürün seçin. Reçete Adı ve Hedef SKU otomatik dolacaktır.", "error");
      return;
    }
    if(!formData.components || formData.components.length === 0 || formData.components.some(c => !c.productId)) {
        showToast("En az bir geçerli bileşen eklemelisiniz.", "error");
        return;
    }
    
    const parsedComponents: BOMComponent[] = [];
    for (const [index, component] of (formData.components || []).entries()) {
        const quantity = parseLocaleNumber(component.quantity);
        if (quantity === null || quantity <= 0) {
             const product = getProductById(component.productId);
             const productName = product ? `'${product.name}'` : `Bileşen #${index + 1}`;
             showToast(`${productName} için girilen miktar geçerli bir pozitif sayı değil.`, "error");
             return;
        }
        parsedComponents.push({ productId: component.productId, quantity });
    }

    const numericCriteria: { [key in 'kw' | 'rpm' | 'volt']?: number } = {};
    const numericFields: Array<keyof typeof numericCriteria> = ['kw', 'rpm', 'volt'];
    for(const field of numericFields) {
        const value = formData[field];
        const parsedValue = parseLocaleNumber(value);
        if (String(value || '').trim() !== '' && parsedValue === null) {
            showToast(`'${field}' alanı için girilen değer geçerli bir sayı değil.`, 'error');
            return;
        }
        if (parsedValue !== null) {
            numericCriteria[field] = parsedValue;
        }
    }

    const isEditing = !!formData.id;

    const finalBomPayload: Omit<BOM, 'id'> & { id?: string } = {
        name: formData.name!,
        targetSku: formData.targetSku!,
        components: parsedComponents,
        ...(formData.id && { id: formData.id }),
        ...(formData.musteriIds && formData.musteriIds.length > 0 && { musteriIds: formData.musteriIds }),
        ...numericCriteria,
        ...(formData.milKod && { milKod: formData.milKod }),
        ...(formData.kapak && { kapak: formData.kapak }),
        ...(formData.pg_klemensYonu && { pg_klemensYonu: formData.pg_klemensYonu }),
        ...(formData.pg_montajDeligi && { pg_montajDeligi: formData.pg_montajDeligi }),
        ...(formData.pg_baglantiTipi && { pg_baglantiTipi: formData.pg_baglantiTipi }),
    };

    if (isEditing) {
        showUiLoading("Reçete ve siparişler güncelleniyor...");
        const updatedBom = finalBomPayload as BOM;
        
        const updaters: { [K in keyof DataStore]?: (prev: any) => any } = {};
        let ordersUpdatedCount = 0;
        
        updaters.boms = (prevBoms: BOM[] = []) => prevBoms.map(b => b.id === updatedBom.id ? updatedBom : b);
        
        updaters.siparisler = (prevOrders: Order[] = []) => {
            const allStockProducts = dataStore['stokTakip-v1']?.products || [];
            const updatedBoms = (dataStore.boms || []).map(b => b.id === updatedBom.id ? updatedBom : b);
            
            return prevOrders.map(order => {
                if (order.sevkeHazir) return order;

                const committedQuantities = calculateCommittedQuantities(prevOrders, updatedBoms, order.id);
                const productForOrder = allStockProducts.find(p => p.name === order.urun);
                const newImalatDurumu = calculateImalatDurumuForOrder(order, allStockProducts, updatedBoms, committedQuantities, productForOrder);

                if (JSON.stringify(order.imalatDurumu) !== JSON.stringify(newImalatDurumu)) {
                    ordersUpdatedCount++;
                    return { ...order, imalatDurumu: newImalatDurumu };
                }
                return order;
            });
        };

        pushAtomicData(updaters)
            .then(() => {
                let successMessage = "Reçete başarıyla güncellendi.";
                if (ordersUpdatedCount > 0) {
                    successMessage += ` ${ordersUpdatedCount} siparişin imalat durumu yeniden hesaplandı.`;
                }
                showToast(successMessage, "success");
                onClose();
            })
            .catch(error => {
                console.error("Atomic BOM/Order update failed:", error);
                showToast("Güncelleme sırasında bir hata oluştu. Veri tutarsız olabilir, lütfen kontrol edin.", "error");
            })
            .finally(() => {
                hideUiLoading();
            });

    } else {
      const newBom: BOM = {
        id: crypto.randomUUID(),
        ...finalBomPayload,
      } as BOM;
      pushData('boms', (prevBoms: BOM[] = []) => [...prevBoms, newBom]);
      showToast("Reçete eklendi.", "success");
      onClose();
    }
  };
  
  const inputClass = "w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-orange-500 focus:border-orange-500";
  const labelClass = "text-sm text-slate-600 dark:text-slate-300";
  const targetProductIsPG = useMemo(() => (products || []).find(p => p.id === targetProductId)?.category === 'paketliGovde', [targetProductId, products]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border dark:border-slate-700 w-full max-w-5xl mx-auto my-4">
        <div className="p-4 md:p-6 border-b dark:border-slate-700">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{bom ? 'Reçete Düzenle' : 'Yeni Reçete Ekle'}</h3>
        </div>
        <form onSubmit={handleSubmit} noValidate>
            <div className="p-4 md:p-6 space-y-6">
                <fieldset className="p-4 border rounded-2xl dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                    <legend className="px-2 text-base font-semibold text-slate-700 dark:text-slate-200">Reçete Bilgileri</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Hedef Ürün (Mamül/Yarı Mamül)</label>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="flex-grow h-11 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 flex items-center">
                                    {targetProduct ? (
                                        <span className="truncate">{targetProduct.name} ({targetProduct.sku})</span>
                                    ) : (
                                        <span className="text-slate-400">Üretilecek ürünü seçin...</span>
                                    )}
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => setIsTargetSelectionModalOpen(true)} 
                                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm whitespace-nowrap btn-textured"
                                >
                                    {targetProduct ? 'Değiştir' : 'Seç'}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Reçete Adı (Otomatik Dolar)</label>
                            <input name="name" value={formData.name || ''} onChange={handleChange} required className={`${inputClass} bg-slate-100 dark:bg-slate-800`} readOnly/>
                        </div>
                    </div>
                </fieldset>

                 <fieldset className="p-4 border rounded-2xl dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                    <legend className="px-2 text-base font-semibold text-slate-700 dark:text-slate-200">Sipariş Eşleştirme Kriterleri</legend>
                    <div className="space-y-4">
                        <div>
                            <label className={labelClass}>Müşteriler (Boş bırakılırsa genel reçete olur)</label>
                            <div className="mt-1 p-2 border rounded-xl dark:border-slate-600 min-h-[44px] flex flex-wrap gap-2 items-center bg-white dark:bg-slate-900">
                                {(formData.musteriIds || []).map(id => {
                                    const customer = (customers || []).find(c => c.id === id);
                                    return (
                                        <span key={id} className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full dark:bg-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                                            {customer?.name || 'Bilinmeyen'}
                                            <button type="button" onClick={() => removeCustomerFromBom(id)} className="text-blue-600 dark:text-blue-200 hover:text-blue-800 dark:hover:text-blue-100"><Icon name="x" size={14}/></button>
                                        </span>
                                    );
                                })}
                                <div className="relative" ref={customerDropdownRef}>
                                    <button type="button" onClick={() => setCustomerDropdownOpen(prev => !prev)} className="px-3 py-1.5 text-xs rounded-lg border border-dashed border-slate-400 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                                        + Müşteri Ekle
                                    </button>
                                    {customerDropdownOpen && unselectedCustomers.length > 0 && (
                                        <div className="absolute z-10 top-full mt-1 w-64 bg-white dark:bg-slate-700 border dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                            {unselectedCustomers.map(c => (<div key={c.id} onClick={() => addCustomerToBom(c.id)} className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer text-sm">{c.name}</div>))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        {visibleCriteria.size > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {visibleCriteria.has('electrical') && (<>
                                        <div><label className={labelClass}>kW</label><input name="kw" type="text" value={formData.kw ?? ''} onChange={handleChange} className={inputClass} /></div>
                                        <div><label className={labelClass}>RPM</label><input name="rpm" type="text" value={formData.rpm ?? ''} onChange={handleChange} className={inputClass} /></div>
                                        <div><label className={labelClass}>Voltaj</label><input name="volt" type="text" value={formData.volt ?? ''} onChange={handleChange} className={inputClass} /></div>
                                </>)}
                                {visibleCriteria.has('milKod') && (<div><label className={labelClass}>Mil Kodu</label><input name="milKod" type="text" value={formData.milKod ?? ''} onChange={handleChange} className={inputClass} /></div>)}
                                {visibleCriteria.has('kapak') && (<div><label className={labelClass}>Kapak</label><select name="kapak" value={formData.kapak || ''} onChange={handleChange} className={inputClass}><option value="">Seçiniz</option><option value="AK">AK</option><option value="CK">CK</option></select></div>)}
                            </div>
                        )}

                        {visibleCriteria.has('mounting') && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t dark:border-slate-700 pt-4">
                                <div>
                                    <label className={labelClass}>Klemens Yönü</label>
                                    <select name="pg_klemensYonu" value={formData.pg_klemensYonu || ''} onChange={handleChange} className={targetProductIsPG ? `${inputClass} bg-slate-100 dark:bg-slate-700/50` : inputClass} disabled={targetProductIsPG}><option value="">Seçiniz</option><option value="ustten">Üstten Klemensli</option><option value="alttan">Alttan Klemensli</option></select>
                                </div>
                                <div>
                                    <label className={labelClass}>Ayak Montaj Deliği</label>
                                    <select name="pg_montajDeligi" value={formData.pg_montajDeligi || ''} onChange={handleChange} className={targetProductIsPG ? `${inputClass} bg-slate-100 dark:bg-slate-700/50` : inputClass} disabled={targetProductIsPG}><option value="">Seçiniz</option><option value="duz">Düz</option><option value="ters">Ters</option></select>
                                </div>
                                <div>
                                    <label className={labelClass}>Bağlantı Tipi</label>
                                    <select name="pg_baglantiTipi" value={formData.pg_baglantiTipi || ''} onChange={handleChange} className={targetProductIsPG ? `${inputClass} bg-slate-100 dark:bg-slate-700/50` : inputClass} disabled={targetProductIsPG}><option value="">Seçiniz</option><option value="klemensli">Klemensli</option><option value="soketli">Soketli</option></select>
                                </div>
                            </div>
                        )}
                    </div>
                </fieldset>

                <fieldset className="p-4 border rounded-2xl dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                    <legend className="px-2 text-base font-semibold text-slate-700 dark:text-slate-200">Bileşenler</legend>
                    <div className="space-y-2">
                        {(formData.components || []).map((comp) => {
                            const product = getProductById(comp.productId);
                            return (
                                <div key={comp._key} className="flex items-stretch gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-600">
                                    <div 
                                        onClick={() => openSelectionModalForEdit(comp._key)}
                                        className="flex-grow flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 border dark:border-slate-600 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
                                    >
                                        <Icon name="box" size={24} className="text-slate-500 flex-shrink-0" />
                                        <div className="flex-grow truncate">
                                            {product ? <>
                                                <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">{product.name}</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">{product.sku}</div>
                                            </> : <span className="text-slate-500">Bileşen seçmek için tıklayın...</span>}
                                        </div>
                                    </div>
                                    <input type="text" value={comp.quantity ?? ''} onChange={(e) => handleComponentQuantityChange(comp._key, e.target.value)} placeholder="Adet" required className={`${inputClass} w-28 text-right`} />
                                    <button type="button" onClick={() => removeComponent(comp._key)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full flex-shrink-0 self-center"><Icon name="trash-2" size={16}/></button>
                                </div>
                            );
                        })}
                    </div>
                    <button type="button" onClick={openSelectionModalForNew} className="mt-3 px-3 py-1.5 rounded-lg border border-dashed border-slate-400 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 w-full text-sm">
                        + Bileşen Ekle
                    </button>
                    {checkPermission('hertz') && (
                        <div className="text-right mt-2 font-semibold text-slate-700 dark:text-slate-200">
                            Toplam Reçete Maliyeti: {fmtCurrency(totalCost)}
                        </div>
                    )}
                </fieldset>
            </div>
             <div className="p-4 md:p-6 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800 border-t dark:border-slate-700 rounded-b-2xl">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">Vazgeç</button>
                <button type="submit" className="px-4 py-2 rounded-xl btn-brand">Kaydet</button>
            </div>
        </form>
        <ProductSelectionModal
            isOpen={isTargetSelectionModalOpen}
            onClose={() => setIsTargetSelectionModalOpen(false)}
            onProductSelect={(product) => {
                setTargetProductId(product.id);
                setIsTargetSelectionModalOpen(false);
            }}
            title="Hedef Ürün Seç"
            productFilter={(p) => p.kind === 'mamul' || p.kind === 'yari'}
        />
        <ProductSelectionModal
            isOpen={isSelectionModalOpen}
            onClose={() => setIsSelectionModalOpen(false)}
            onProductSelect={handleComponentProductSelected}
            title="Bileşen Seç"
            productFilter={(p) => {
                if(p.kind !== 'ham' && p.kind !== 'yari') return false;

                const targetProd = (products || []).find(prod => prod.id === targetProductId);
                if (targetProd?.category !== 'paketliGovde') {
                    return true;
                }
                if (p.category !== 'sargiliPaket') {
                    return true;
                }
                const targetKw = targetProd.pg_kw ?? targetProd.kw;
                const targetRpm = targetProd.pg_rpm ?? targetProd.rpm;
                const targetVolt = targetProd.pg_volt ?? targetProd.volt;
                return areNumbersEqual(p.kw, targetKw) && areNumbersEqual(p.rpm, targetRpm) && areNumbersEqual(p.volt, targetVolt);
            }}
        />
    </div>
  );
};


const BOMComponent: React.FC = () => {
    const { dataStore, pushData } = useData();
    const { showConfirmation, showToast } = useUI();
    const { checkPermission } = useAuth();
    const [view, setView] = useState<'list' | 'form'>('list');
    const [selectedBom, setSelectedBom] = useState<BOM | null>(null);

    if (!checkPermission('hertz')) {
        return (
            <div className="p-10 text-center text-slate-500 dark:text-slate-400">
                Bu sayfayı görüntüleme yetkiniz yok.
            </div>
        );
    }

    const { boms, products, customers } = useMemo(() => ({
        boms: dataStore.boms || [],
        products: dataStore['stokTakip-v1']?.products || [],
        customers: (dataStore.contacts || []).filter(c => c.type === 'customer'),
    }), [dataStore]);
    
    const getProductBySku = useCallback((sku: string) => (products || []).find(p => p.sku === sku), [products]);
    const getProductById = useCallback((id: string) => (products || []).find(p => p.id === id), [products]);
    const getCustomerNameById = useCallback((id: string) => (customers || []).find(c => c.id === id)?.name, [customers]);
    
    const calculateBomCost = useCallback((bom: BOM): number => {
        return (bom.components || []).reduce((total, component) => {
            const product = getProductById(component.productId);
            const cost = product?.cost || 0;
            return total + (cost * component.quantity);
        }, 0);
    }, [getProductById]);

    const handleAdd = () => {
        setSelectedBom(null);
        setView('form');
    };

    const handleEdit = (bom: BOM) => {
        setSelectedBom(bom);
        setView('form');
    };

    const handleDelete = (bom: BOM) => {
        showConfirmation({
            title: "Reçeteyi Sil",
            message: `'${bom.name}' adlı reçete kalıcı olarak silinecektir.`,
            confirmText: "Evet, Sil",
            requiresInput: null,
            onConfirm: () => {
                pushData('boms', (prevBoms: BOM[] = []) => prevBoms.filter(b => b.id !== bom.id)).then(() => {
                    showToast("Reçete silindi.", "success");
                });
            }
        });
    };
    
    if (view === 'form') {
        return <BomForm onClose={() => setView('list')} bom={selectedBom} />;
    }

    return (
        <div className="mx-auto max-w-7xl p-3 md:p-4">
            <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Ürün Reçeteleri (BOM)</h2>
                <div className="flex items-center gap-4">
                    <ModuleDataManager
                        moduleName="Ürün Reçeteleri"
                        onExport={() => exportBomsData(dataStore)}
                        onImport={importBomsData}
                        onDelete={deleteBomsData}
                    />
                    <button onClick={handleAdd} className="px-3 py-2 rounded-xl btn-brand">Yeni Reçete Ekle</button>
                </div>
            </div>
            
            <div className="overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <table className="w-full text-sm responsive-table">
                    <thead className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        <tr>
                            <th className="text-left px-3 py-2">Hedef Ürün / Reçete Adı</th>
                            <th className="text-left px-3 py-2">Müşteriler</th>
                            <th className="text-left px-3 py-2">Eşleştirme Kriterleri</th>
                            <th className="text-left px-3 py-2">Bileşenler</th>
                            {checkPermission('hertz') && <th className="text-right px-3 py-2">Toplam Maliyet</th>}
                            <th className="text-right px-3 py-2">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {boms.length > 0 ? boms.map(bom => {
                            const targetProduct = getProductBySku(bom.targetSku);
                            return (
                                <tr key={bom.id} className="dark:hover:bg-slate-700/50">
                                    <td data-label="Hedef Ürün" className="p-3">
                                        <div className="font-medium">{targetProduct?.name || bom.name}</div>
                                        <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{bom.targetSku}</div>
                                    </td>
                                    <td data-label="Müşteriler" className="p-3 text-xs">
                                        {(!bom.musteriIds || bom.musteriIds.length === 0) ? (
                                            <span className="italic text-slate-500">Genel Reçete</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {bom.musteriIds.map(id => (
                                                    <span key={id} className="bg-slate-200 dark:bg-slate-600 px-2 py-0.5 rounded-full">{getCustomerNameById(id) || 'Bilinmeyen'}</span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td data-label="Kriterler" className="p-3 text-xs">
                                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                                            {bom.kw != null && bom.kw !== '' && <span>kW: {bom.kw}</span>}
                                            {bom.rpm != null && bom.rpm !== '' && <span>RPM: {bom.rpm}</span>}
                                            {bom.volt != null && bom.volt !== '' && <span>Voltaj: {bom.volt}</span>}
                                            {bom.milKod && <span>Mil: {bom.milKod}</span>}
                                            {bom.kapak && <span>Kapak: {bom.kapak}</span>}
                                            {bom.pg_klemensYonu && <span className="capitalize">Klemens: {bom.pg_klemensYonu}</span>}
                                            {bom.pg_montajDeligi && <span className="capitalize">Montaj: {bom.pg_montajDeligi}</span>}
                                            {bom.pg_baglantiTipi && <span className="capitalize">Bağlantı: {bom.pg_baglantiTipi}</span>}
                                        </div>
                                    </td>
                                    <td data-label="Bileşenler" className="p-3 text-xs">
                                        <ul className="list-disc pl-4 space-y-1">
                                           {(bom.components || []).map((c, i) => {
                                               const product = getProductById(c.productId);
                                               return <li key={i}>{product?.name || 'Bilinmeyen Ürün'} <strong>({c.quantity} {product?.unit || 'adet'})</strong></li>
                                           })}
                                        </ul>
                                    </td>
                                    {checkPermission('hertz') && (
                                        <td data-label="Toplam Maliyet" className="p-3 text-right font-semibold">
                                            {fmtCurrency(calculateBomCost(bom))}
                                        </td>
                                    )}
                                    <td data-label="İşlemler" className="p-3 text-right">
                                        <div className="flex justify-end items-center gap-1">
                                            <button onClick={() => handleEdit(bom)} className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-xs">Düzenle</button>
                                            <button onClick={() => handleDelete(bom)} className="px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs">Sil</button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        }) : (
                            <tr><td colSpan={6} className="p-4 text-center text-slate-500">Kayıtlı ürün reçetesi yok.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BOMComponent;