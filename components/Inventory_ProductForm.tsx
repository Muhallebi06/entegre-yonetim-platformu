import React, { useState, useEffect, useMemo, useCallback } from 'react';
// Fix: Import useAuth to correctly access the current user.
import { useData, useUI, useAuth, ProductSelectionModal } from '../App';
// Fix: Import InventoryLog for creating log entries.
import { Product, Company, ProductCategory, ProductKind, InventoryLog } from '../types';
import { CATEGORY_PREFIX, CATEGORY_LABEL } from '../constants';
// Fix: Import StokTakipData from ../types instead of ../services/firebase to avoid circular dependencies.
import { StokTakipData } from '../types';
import { parseLocaleNumber } from '../utils/helpers';

export const ProductForm: React.FC<{
  onClose: () => void;
  product: Product | null;
  customers: Company[];
  products: Product[];
}> = ({ onClose, product, customers, products }) => {
  const { dataStore, pushData } = useData();
  const { showToast } = useUI();
  // Fix: The 'user' object is part of the authentication context, not the data context.
  const { user, checkPermission } = useAuth();
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [isMilSelectionModalOpen, setIsMilSelectionModalOpen] = useState(false);

  useEffect(() => {
    if (product) {
      setFormData(product);
    } else {
      setFormData({
        kind: 'ham',
        category: 'stator',
        unit: 'adet',
        qty: 0,
      });
    }
  }, [product]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleMilSelect = (selectedMil: Product) => {
    setFormData(prev => ({ ...prev, m_milProductId: selectedMil.id, milType: selectedMil.milCode }));
    setIsMilSelectionModalOpen(false);
  };
  
  const generateSku = useCallback((category: ProductCategory, allProducts: Product[]): string => {
      const prefix = CATEGORY_PREFIX[category];
      const categoryProducts = allProducts.filter(p => p.sku.startsWith(prefix));
      const maxNum = categoryProducts.reduce((max, p) => {
          const num = parseInt(p.sku.slice(prefix.length), 10);
          return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      showToast("Ürün adı zorunludur.", "error");
      return;
    }

    const allProducts = dataStore['stokTakip-v1']?.products || [];
    let sku = formData.sku?.trim() || '';
    const isSkuDuplicate = allProducts.some(p => p.sku === sku && p.id !== formData.id);

    if (!sku || isSkuDuplicate) {
        sku = generateSku(formData.category!, allProducts);
        showToast(isSkuDuplicate ? "Girilen SKU mevcut, yeni SKU oluşturuldu." : "Yeni SKU oluşturuldu.", "success");
    }
    
    const numericFields: (keyof Product)[] = ['qty', 'min', 'cost', 'kw', 'rpm', 'volt', 'pg_kw', 'pg_rpm', 'pg_volt', 'm_kw', 'm_rpm', 'm_volt'];
    const parsedFormData: Partial<Product> = { ...formData, sku };

    for (const field of numericFields) {
        const value = formData[field];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            const parsedValue = parseLocaleNumber(String(value));
            if (parsedValue === null) {
                showToast(`'${field}' alanı için girilen değer geçerli bir sayı değil.`, "error");
                return;
            }
            (parsedFormData as any)[field] = parsedValue;
        } else {
             // Firebase cannot store 'undefined'. Use 'null' instead, which will remove the key on save.
             (parsedFormData as any)[field] = null;
        }
    }

    try {
        if (formData.id) { // Edit
          // Fix: Add a log entry when a product is edited.
          await pushData('stokTakip-v1', (prev: StokTakipData | undefined) => {
            const logs = [...(prev?.logs || [])];
            const newLog: InventoryLog = {
                id: self.crypto.randomUUID(),
                ts: new Date().toISOString(),
                user: user?.username || 'unknown',
                productId: formData.id!,
                type: 'edit',
                note: 'Ürün bilgileri güncellendi.'
            };
            logs.unshift(newLog);
            return {
              products: (prev?.products || []).map(p => p.id === formData.id ? { ...p, ...parsedFormData } : p),
              logs: logs,
            };
          });
          showToast("Ürün güncellendi.", "success");
        } else { // Add
          // Fix: Explicitly include 'sku' to satisfy the 'Product' type, which requires it.
          const newProduct: Product = {
            ...parsedFormData,
            id: crypto.randomUUID(),
            name: formData.name,
            kind: formData.kind!,
            category: formData.category!,
            qty: parsedFormData.qty ?? 0,
            sku: sku,
          };
          // Fix: Add a log entry when a new product is created.
          await pushData('stokTakip-v1', (prev: StokTakipData | undefined) => {
            const logs = [...(prev?.logs || [])];
            const newLog: InventoryLog = {
                id: self.crypto.randomUUID(),
                ts: new Date().toISOString(),
                user: user?.username || 'unknown',
                productId: newProduct.id,
                type: 'new',
                toQty: newProduct.qty,
                note: `Yeni ürün eklendi.`
            };
            logs.unshift(newLog);
            return {
              products: [...(prev?.products || []), newProduct],
              logs: logs,
            };
          });
          showToast("Ürün eklendi.", "success");
        }
        onClose();
    } catch (error) {
        console.error("Failed to save product:", error);
        showToast("Ürün kaydedilemedi.", "error");
    }
  };

  const inputClass = "w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-orange-500 focus:border-orange-500";
  const labelClass = "text-sm text-slate-600 dark:text-slate-300";
  const canEditCost = checkPermission('hertz');

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border dark:border-slate-700 w-full max-w-4xl mx-auto my-4">
      <div className="p-4 md:p-6 border-b dark:border-slate-700">
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{product ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}</h3>
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <div className="p-4 md:p-6 space-y-6">
          <fieldset className="p-4 border rounded-2xl dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
            <legend className="px-2 text-base font-semibold text-slate-700 dark:text-slate-200">Temel Bilgiler</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className={labelClass}>Ürün Adı</label><input name="name" value={formData.name || ''} onChange={handleChange} required className={inputClass} /></div>
              <div><label className={labelClass}>SKU (Boş bırakılırsa otomatik)</label><input name="sku" value={formData.sku || ''} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Birim</label><input name="unit" value={formData.unit || 'adet'} onChange={handleChange} className={inputClass} /></div>
              <div><label className={labelClass}>Ürün Cinsi</label><select name="kind" value={formData.kind} onChange={handleChange} className={inputClass}><option value="ham">Hammadde</option><option value="yari">Yarı Mamül</option><option value="mamul">Mamül</option></select></div>
              <div><label className={labelClass}>Kategori</label><select name="category" value={formData.category} onChange={handleChange} className={inputClass}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className={labelClass}>Minimum Stok</label><input name="min" type="text" value={formData.min ?? ''} onChange={handleChange} className={inputClass} /></div>
              {canEditCost && (
                <div>
                  <label className={labelClass}>Birim Maliyet (€)</label>
                  <input name="cost" type="text" value={formData.cost ?? ''} onChange={handleChange} className={inputClass} />
                </div>
              )}
            </div>
          </fieldset>
          
          {formData.category === 'sargiliPaket' && (
              <fieldset className="p-4 border rounded-2xl dark:border-slate-700"><legend className="px-2 font-semibold">Sargılı Paket Özellikleri</legend><div className="grid grid-cols-3 gap-4">
                  <div><label className={labelClass}>kW</label><input name="kw" type="text" value={formData.kw ?? ''} onChange={handleChange} className={inputClass} /></div>
                  <div><label className={labelClass}>RPM</label><input name="rpm" type="text" value={formData.rpm ?? ''} onChange={handleChange} className={inputClass} /></div>
                  <div><label className={labelClass}>Voltaj</label><input name="volt" type="text" value={formData.volt ?? ''} onChange={handleChange} className={inputClass} /></div>
              </div></fieldset>
          )}

          {formData.category === 'paketliGovde' && (
              <fieldset className="p-4 border rounded-2xl dark:border-slate-700"><legend className="px-2 font-semibold">Paketli Gövde Özellikleri</legend><div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>kW</label><input name="pg_kw" type="text" value={formData.pg_kw ?? ''} onChange={handleChange} className={inputClass} /></div>
                  <div><label className={labelClass}>RPM</label><input name="pg_rpm" type="text" value={formData.pg_rpm ?? ''} onChange={handleChange} className={inputClass} /></div>
                  <div><label className={labelClass}>Voltaj</label><input name="pg_volt" type="text" value={formData.pg_volt ?? ''} onChange={handleChange} className={inputClass} /></div>
                  <div><label className={labelClass}>Müşteri</label><select name="pg_customerId" value={formData.pg_customerId || ''} onChange={handleChange} className={inputClass}><option value="">Genel</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div><label className={labelClass}>Klemens Yönü</label><select name="pg_klemensYonu" value={formData.pg_klemensYonu || ''} onChange={handleChange} className={inputClass}><option value="">Seçiniz</option><option value="ustten">Üstten</option><option value="alttan">Alttan</option></select></div>
                  <div><label className={labelClass}>Montaj Deliği</label><select name="pg_montajDeligi" value={formData.pg_montajDeligi || ''} onChange={handleChange} className={inputClass}><option value="">Seçiniz</option><option value="duz">Düz</option><option value="ters">Ters</option></select></div>
                  <div><label className={labelClass}>Bağlantı Tipi</label><select name="pg_baglantiTipi" value={formData.pg_baglantiTipi || ''} onChange={handleChange} className={inputClass}><option value="">Seçiniz</option><option value="klemensli">Klemensli</option><option value="soketli">Soketli</option></select></div>
              </div></fieldset>
          )}

          {(formData.category === 'mil' || formData.category === 'rotorluMil' || formData.category === 'taslanmisMil') && (
               <fieldset className="p-4 border rounded-2xl dark:border-slate-700"><legend className="px-2 font-semibold">Mil Özellikleri</legend><div className="grid grid-cols-2 gap-4">
                  <div><label className={labelClass}>Mil Kodu</label><input name="milCode" type="text" value={formData.milCode || ''} onChange={handleChange} className={inputClass} /></div>
                  <div><label className={labelClass}>Müşteri</label><select name="customerId" value={formData.customerId || ''} onChange={handleChange} className={inputClass}><option value="">Genel</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
               </div></fieldset>
          )}

          {formData.category === 'motor' && (
              <fieldset className="p-4 border rounded-2xl dark:border-slate-700"><legend className="px-2 font-semibold">Motor Özellikleri</legend><div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>kW</label><input name="m_kw" type="text" value={formData.m_kw ?? ''} onChange={handleChange} className={inputClass} /></div>
                  <div><label className={labelClass}>RPM</label><input name="m_rpm" type="text" value={formData.m_rpm ?? ''} onChange={handleChange} className={inputClass} /></div>
                  <div><label className={labelClass}>Voltaj</label><input name="m_volt" type="text" value={formData.m_volt ?? ''} onChange={handleChange} className={inputClass} /></div>
                  <div><label className={labelClass}>Müşteri</label><select name="m_customerId" value={formData.m_customerId || ''} onChange={handleChange} className={inputClass}><option value="">Genel</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div><label className={labelClass}>Kapak</label><select name="m_cover" value={formData.m_cover || ''} onChange={handleChange} className={inputClass}><option value="">Seçiniz</option><option value="AK">AK</option><option value="CK">CK</option></select></div>
                  <div><label className={labelClass}>Rulman</label><select name="m_rulman" value={formData.m_rulman || ''} onChange={handleChange} className={inputClass}><option value="">Seçiniz</option><option value="1R">1R</option><option value="2R">2R</option><option value="CR">CR</option></select></div>
                  <div><label className={labelClass}>Klemens Yönü</label><select name="m_klemensYonu" value={formData.m_klemensYonu || ''} onChange={handleChange} className={inputClass}><option value="">Seçiniz</option><option value="ustten">Üstten</option><option value="alttan">Alttan</option></select></div>
                  <div><label className={labelClass}>Montaj Deliği</label><select name="m_montajDeligi" value={formData.m_montajDeligi || ''} onChange={handleChange} className={inputClass}><option value="">Seçiniz</option><option value="duz">Düz</option><option value="ters">Ters</option></select></div>
                  <div><label className={labelClass}>Bağlantı Tipi</label><select name="m_baglantiTipi" value={formData.m_baglantiTipi || ''} onChange={handleChange} className={inputClass}><option value="">Seçiniz</option><option value="klemensli">Klemensli</option><option value="soketli">Soketli</option></select></div>
                  <div className="md:col-span-3">
                      <label className={labelClass}>Mil Kodu</label>
                      <div className="flex items-center gap-2 mt-1">
                          <div className="flex-grow h-11 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 flex items-center">
                              {formData.milType || <span className="text-slate-400">Mil seçin...</span>}
                          </div>
                          <button type="button" onClick={() => setIsMilSelectionModalOpen(true)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm whitespace-nowrap btn-textured">
                              Mil Seç
                          </button>
                      </div>
                  </div>
              </div></fieldset>
          )}
        </div>
        <div className="p-4 md:p-6 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800 border-t dark:border-slate-700 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">Vazgeç</button>
          <button type="submit" className="px-4 py-2 rounded-xl btn-brand">Kaydet</button>
        </div>
      </form>
       <ProductSelectionModal
          isOpen={isMilSelectionModalOpen}
          onClose={() => setIsMilSelectionModalOpen(false)}
          onProductSelect={handleMilSelect}
          productFilter={(p) => p.category === 'taslanmisMil'}
          title="Taşlanmış Mil Seç"
      />
    </div>
  );
};