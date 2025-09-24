
import React, { useState, useMemo, useCallback } from 'react';
import { useData, useUI, useAuth } from '../App';
import { ServiceRecord, ShippedServiceRecord, Company, Product, OrderLog } from '../types';
import { getServisRowBg } from './OrderService';
import { DatePicker, EditableCell } from './shared';

const ServiceFormModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (record: ServiceRecord) => void;
    customers: Company[];
    products: Product[];
    allRecords: (ServiceRecord | ShippedServiceRecord)[];
}> = ({ isOpen, onClose, onSave, customers, allRecords }) => {
    const [formData, setFormData] = useState<Partial<ServiceRecord>>({});
    const dialogRef = React.useRef<HTMLDialogElement>(null);

    React.useEffect(() => {
        if(isOpen) {
             const now = new Date();
             const prefix = `TS-${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
             const newNo = `${prefix}-${String(Date.now()).slice(-6)}`;
             setFormData({ no: newNo, adet: 1, durum: 'Beklemede' });
        }
    }, [isOpen]);

    React.useEffect(() => {
        const dialog = dialogRef.current;
        if (isOpen && !dialog?.open) dialog?.showModal();
        else if (!isOpen && dialog?.open) dialog?.close();
    }, [isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleDateChange = (dateStr: string) => {
        setFormData(prev => ({ ...prev, sevkTarihi: dateStr }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as ServiceRecord);
        onClose();
    };
    
    const inputClass = "w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900";

    return (
        <dialog ref={dialogRef} onClose={onClose} className="rounded-2xl p-0 w-[96vw] max-w-2xl">
            <form onSubmit={handleSubmit} className="p-6 bg-white dark:bg-slate-800 rounded-2xl">
                <h3 className="font-semibold text-lg mb-4 dark:text-slate-100">Yeni Servis Kaydı</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2"><label>Müşteri</label><select name="musteriId" value={formData.musteriId || ''} onChange={handleChange} required className={inputClass}><option value="">Seçiniz</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    <div><label>Ürün</label><input name="urun" value={formData.urun || ''} onChange={handleChange} required className={inputClass} /></div>
                    <div><label>Adet</label><input type="number" name="adet" value={formData.adet || ''} onChange={handleChange} className={inputClass} /></div>
                    <div className="col-span-2"><label>Arıza</label><input name="ariza" value={formData.ariza || ''} onChange={handleChange} className={inputClass} /></div>
                    <div><label>Mil Tipi</label><input name="milTipi" value={formData.milTipi || ''} onChange={handleChange} className={inputClass} /></div>
                    <div><label>Durum</label><select name="durum" value={formData.durum || ''} onChange={handleChange} className={inputClass}><option>Beklemede</option><option>İnceleniyor</option><option>Teklif Bekliyor</option><option>Hazır</option></select></div>
                    <div><label>Kargo Tipi</label><input name="kargoTipi" value={formData.kargoTipi || ''} onChange={handleChange} className={inputClass} /></div>
                    <div><label>Termin</label><DatePicker value={formData.sevkTarihi} onChange={handleDateChange} className={inputClass} /></div>
                    <div className="col-span-2"><label>Açıklama</label><textarea name="aciklama" value={formData.aciklama || ''} onChange={handleChange} className={inputClass}></textarea></div>
                </div>
                <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border dark:border-slate-600">Vazgeç</button><button type="submit" className="btn-brand px-4 py-2 rounded-xl">Kaydet</button></div>
            </form>
        </dialog>
    );
};


export const ServiceRecords: React.FC<{
    servisKayitlari: ServiceRecord[];
    servisSevkEdilenler: ShippedServiceRecord[];
    customers: Company[];
    products: Product[];
    getContactNameById: (id: string) => string;
    onUpdate: (record: ServiceRecord) => Promise<void>;
    onDelete: (recordId: string) => void;
    onSevk: (recordId: string) => void;
    onAdd: (record: ServiceRecord) => void;
    logAction: (no: string, islem: string) => void;
    today: Date;
}> = ({ servisKayitlari, servisSevkEdilenler, customers, products, getContactNameById, onUpdate, onDelete, onSevk, onAdd, logAction, today }) => {
    const [isModalOpen, setModalOpen] = useState(false);
    const { checkPermission } = useAuth();
    
    const handleUpdateField = useCallback(async (record: ServiceRecord, field: keyof ServiceRecord, value: any) => {
        await onUpdate({ ...record, [field]: value });
        logAction(record.no, `'${String(field)}' güncellendi.`);
    }, [onUpdate, logAction]);

    const durumOptions = useMemo(() => [
        { value: 'Beklemede', label: 'Beklemede' },
        { value: 'İnceleniyor', label: 'İnceleniyor' },
        { value: 'Teklif Bekliyor', label: 'Teklif Bekliyor' },
        { value: 'Hazır', label: 'Hazır' }
    ], []);

    return (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-bold dark:text-slate-100">Teknik Servis Kayıtları</h2>
                <button onClick={() => setModalOpen(true)} className="btn-brand px-4 py-2 rounded-xl">Yeni Kayıt</button>
            </div>
            <div className="overflow-auto"><table className="w-full text-sm responsive-table">
                <thead className="bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300"><tr>
                    <th className="text-left px-2 py-2">Servis No</th>
                    <th className="text-left px-2 py-2">Müşteri</th>
                    <th className="text-left px-2 py-2">Ürün</th>
                    <th className="text-left px-2 py-2">Arıza</th>
                    <th className="text-left px-2 py-2">Durum</th>
                    <th className="text-left px-2 py-2">Termin</th>
                    <th className="text-left px-2 py-2">Açıklama</th>
                    <th className="text-right px-2 py-2">İşlemler</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {servisKayitlari.map(s => (
                        <tr key={s.id} className={getServisRowBg(s, today)}>
                            <td data-label="Servis No" className="p-1 font-semibold">{s.no}</td>
                            <td data-label="Müşteri" className="p-1" dangerouslySetInnerHTML={{ __html: getContactNameById(s.musteriId) }}></td>
                            <td data-label="Ürün" className="p-1">{s.urun}</td>
                            <td data-label="Arıza" className="p-1"><EditableCell recordId={s.id} value={s.ariza} onSave={val => handleUpdateField(s, 'ariza', val)} /></td>
                            <td data-label="Durum" className="p-1"><EditableCell recordId={s.id} value={s.durum} onSave={val => handleUpdateField(s, 'durum', val)} type="select" options={durumOptions} /></td>
                            <td data-label="Termin" className="p-1"><EditableCell recordId={s.id} value={s.sevkTarihi} onSave={val => handleUpdateField(s, 'sevkTarihi', val)} type="date" /></td>
                            <td data-label="Açıklama" className="p-1"><EditableCell recordId={s.id} value={s.aciklama} onSave={val => handleUpdateField(s, 'aciklama', val)} /></td>
                            <td data-label="İşlemler" className="p-1 text-right"><div className="flex justify-end gap-1">
                                <button onClick={() => onSevk(s.id)} disabled={(s.durum || '').toUpperCase() !== 'HAZIR'} className="p-1.5 rounded-lg bg-green-100 text-green-700 disabled:opacity-50 dark:bg-green-900/50 dark:text-green-200">Sevk</button>
                                <button onClick={() => onDelete(s.id)} disabled={!checkPermission('hertz')} className="p-1.5 rounded-lg bg-red-100 text-red-700 disabled:opacity-50 dark:bg-red-900/50 dark:text-red-200">Sil</button>
                            </div></td>
                        </tr>
                    ))}
                </tbody>
            </table></div>
            <ServiceFormModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} onSave={onAdd} customers={customers} products={products} allRecords={[...servisKayitlari, ...servisSevkEdilenler]}/>
        </div>
    );
};
