import React, { useState, useMemo, useCallback } from 'react';
import { useData, useUI, useAuth, ModuleDataManager } from '../App';
import { Company } from '../types';
import { exportFirmalarData, importFirmalarData, deleteFirmalarData } from '../services/firebase';
import { SortableHeader, PaginationControls } from './shared';

const CompanyFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  company: Company | null;
}> = ({ isOpen, onClose, company }) => {
  const { dataStore, pushData } = useData();
  const { showToast } = useUI();
  const [formData, setFormData] = useState<Partial<Company>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (company) {
      setFormData(company);
    } else {
      setFormData({ type: 'customer' });
    }
  }, [company, isOpen]);

  const dialogRef = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && !dialog?.open) dialog?.showModal();
    else if (!isOpen && dialog?.open) dialog?.close();
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      showToast("Firma ünvanı zorunludur.", "error");
      return;
    }
    
    setIsSubmitting(true);
    try {
        if (formData.id) { // Edit
          const companyPatch: Partial<Company> = {
            type: formData.type,
            name: formData.name,
            contactPerson: formData.contactPerson,
            phone: formData.phone,
            email: formData.email,
            address: formData.address,
          };
          await pushData('contacts', (prevContacts: Company[] = []) =>
            prevContacts.map(c => c.id === formData.id ? { ...c, ...companyPatch } : c)
          );
          showToast("Firma güncellendi.", "success");
        } else { // Add
          const newCompany: Company = {
            ...formData,
            id: crypto.randomUUID(),
            name: formData.name,
            type: formData.type || 'customer',
          };
          await pushData('contacts', (prevContacts: Company[] = []) => [...prevContacts, newCompany]);
          showToast("Firma eklendi.", "success");
        }
        onClose();
    } catch (error) {
        console.error("Failed to save company:", error);
        showToast("Firma kaydedilemedi.", "error");
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const inputClass = "w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-orange-500 focus:border-orange-500";
  const labelClass = "text-sm text-slate-600 dark:text-slate-300";

  return (
    <dialog ref={dialogRef} onClose={onClose} className="rounded-2xl p-0 w-[96vw] max-w-lg bg-white dark:bg-slate-800">
      {isOpen && (
        <form onSubmit={handleSubmit} className="p-4 md:p-6" noValidate>
          <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100">{company ? 'Firma Düzenle' : 'Yeni Firma Ekle'}</h3>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Firma Türü</label>
              <select name="type" value={formData.type || 'customer'} onChange={handleChange} required className={inputClass}>
                <option value="customer">Müşteri</option>
                <option value="supplier">Tedarikçi</option>
              </select>
            </div>
            <div><label className={labelClass}>Firma Ünvanı</label><input name="name" type="text" value={formData.name || ''} onChange={handleChange} required className={inputClass} /></div>
            <div><label className={labelClass}>Yetkili Kişi</label><input name="contactPerson" type="text" value={formData.contactPerson || ''} onChange={handleChange} className={inputClass} /></div>
            <div><label className={labelClass}>Telefon</label><input name="phone" type="tel" value={formData.phone || ''} onChange={handleChange} className={inputClass} /></div>
            <div><label className={labelClass}>E-posta</label><input name="email" type="email" value={formData.email || ''} onChange={handleChange} className={inputClass} /></div>
            {formData.type === 'customer' && (
              <div><label className={labelClass}>Adres</label><textarea name="address" value={formData.address || ''} onChange={handleChange} className={`${inputClass} h-24`}></textarea></div>
            )}
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

const CompanyRow = React.memo(({ company, onEdit, onDelete }: { company: Company, onEdit: (c: Company) => void, onDelete: (c: Company) => void }) => {
    const { checkPermission } = useAuth();
    const hasDeletePermission = checkPermission('hertz');

    return (
        <tr className="dark:hover:bg-slate-700/50">
            <td data-label="Firma" className="p-3 font-medium">{company.name || '-'}</td>
            <td data-label="Tür" className="p-3">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${company.type === 'customer' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200' : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'}`}>
                    {company.type === 'customer' ? 'Müşteri' : 'Tedarikçi'}
                </span>
            </td>
            <td data-label="Yetkili" className="p-3">{company.contactPerson || '-'}</td>
            <td data-label="İletişim" className="p-3">
                {company.phone && <div className="text-xs">{company.phone}</div>}
                {company.email && <div className="text-xs text-blue-600 dark:text-blue-400">{company.email}</div>}
            </td>
            <td data-label="Adres" className="p-3 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line">{company.address || '-'}</td>
            <td data-label="İşlemler" className="p-3 text-right">
                <button onClick={() => onEdit(company)} className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-xs">Düzenle</button>
                <button
                  onClick={() => hasDeletePermission && onDelete(company)}
                  disabled={!hasDeletePermission}
                  title={!hasDeletePermission ? 'Silme yetkiniz yok.' : 'Firmayı sil'}
                  className="px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs ml-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200"
                >
                  Sil
                </button>
            </td>
        </tr>
    );
});

const Companies: React.FC = () => {
    const { dataStore, pushData } = useData();
    const { showConfirmation, showToast } = useUI();
    const { checkPermission } = useAuth();
    const [filter, setFilter] = useState<'all' | 'customer' | 'supplier'>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: keyof Company; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    const sortedCompanies = useMemo(() => {
        const companies = dataStore.contacts || [];
        const filtered = filter === 'all' ? companies : companies.filter(c => c.type === filter);
        
        return [...filtered].sort((a, b) => {
            const key = sortConfig.key;
            const valA = a[key] || '';
            const valB = b[key] || '';
            const comparison = String(valA).localeCompare(String(valB), 'tr');
            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
    }, [dataStore.contacts, filter, sortConfig]);

    React.useEffect(() => {
        setCurrentPage(1);
    }, [filter, sortConfig]);

    const totalPages = Math.ceil(sortedCompanies.length / ITEMS_PER_PAGE);
    const paginatedCompanies = sortedCompanies.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );
    
    const handleAdd = () => {
        setSelectedCompany(null);
        setIsModalOpen(true);
    };

    const handleEdit = useCallback((company: Company) => {
        setSelectedCompany(company);
        setIsModalOpen(true);
    }, []);

    const handleDelete = useCallback((company: Company) => {
        const isUsedAsCustomer = (dataStore.siparisler || []).some(o => o.musteriId === company.id);
        const isUsedAsSupplier = (dataStore['stokTakip-v1']?.products || []).some(p => p.supplierId === company.id);
        if (isUsedAsCustomer || isUsedAsSupplier) {
          showToast(`Bu firma aktif siparişlerde veya stok ürünlerinde kullanıldığı için silinemez.`, 'error');
          return;
        }
        showConfirmation({
            title: "Firmayı Sil",
            message: `'${company.name}' adlı firma kalıcı olarak silinecektir. Bu işlem geri alınamaz.`,
            confirmText: "Evet, Sil",
            requiresInput: null,
            onConfirm: () => {
                // Fix: Added explicit type for prevContacts to ensure type safety.
                return pushData('contacts', (prevContacts: Company[] = []) => 
                    prevContacts.filter(c => c.id !== company.id)
                ).then(() => {
                    showToast("Firma silindi.", "success");
                });
            }
        });
    }, [dataStore, pushData, showConfirmation, showToast]);

    const TabButton: React.FC<{ tabId: 'all' | 'customer' | 'supplier', children: React.ReactNode, permission?: boolean }> = ({ tabId, children, permission = true }) => {
        const hasPermission = permission;
        return (
            <button onClick={() => hasPermission && setFilter(tabId)}
                disabled={!hasPermission}
                title={!hasPermission ? "Bu bölümü görüntüleme yetkiniz yok." : undefined}
                className={`firma-tab whitespace-nowrap py-2 px-4 border text-sm font-semibold rounded-lg transition-colors ${filter === tabId ? 'border-orange-500 text-orange-600 bg-white dark:bg-slate-700 shadow-sm' : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100'} ${!hasPermission ? 'cursor-not-allowed opacity-50' : ''}`}>
                {children}
            </button>
        );
    };

    return (
        <div className="mx-auto max-w-7xl p-3 md:p-4">
            <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Firmalar</h2>
                <ModuleDataManager
                    moduleName="Firmalar"
                    onExport={() => exportFirmalarData(dataStore)}
                    onImport={importFirmalarData}
                    onDelete={deleteFirmalarData}
                />
            </div>

            <div className="grid grid-cols-1 gap-2 mb-4 md:hidden">
                <button onClick={handleAdd} className="w-full px-3 py-2 rounded-xl btn-brand">Yeni Firma Ekle</button>
            </div>

            <div className="mb-4 flex flex-wrap justify-between items-center">
                <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 mobile-scroll-nav-container">
                    <nav className="flex flex-nowrap space-x-1 mobile-scroll-nav">
                        <TabButton tabId="all">Tümü</TabButton>
                        <TabButton tabId="customer">Müşteriler</TabButton>
                        <TabButton tabId="supplier" permission={checkPermission('hertzMuhasebe')}>Tedarikçiler</TabButton>
                    </nav>
                </div>
                <div className="hidden md:block">
                     <button onClick={handleAdd} className="px-3 py-2 rounded-xl btn-brand">Yeni Firma Ekle</button>
                </div>
            </div>

            <div className="overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <table className="w-full text-sm responsive-table">
                    <thead className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        <tr>
                            <SortableHeader label="Firma Ünvanı" sortKey="name" currentSort={sortConfig} setSort={setSortConfig} className="text-left px-3 py-2" />
                            <SortableHeader label="Tür" sortKey="type" currentSort={sortConfig} setSort={setSortConfig} className="text-left px-3 py-2" />
                            <SortableHeader label="Yetkili Kişi" sortKey="contactPerson" currentSort={sortConfig} setSort={setSortConfig} className="text-left px-3 py-2" />
                            <th className="text-left px-3 py-2">İletişim</th>
                            <th className="text-left px-3 py-2">Adres</th>
                            <th className="text-right px-3 py-2">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {paginatedCompanies.length > 0 ? paginatedCompanies.map(c => (
                            <CompanyRow key={c.id} company={c} onEdit={handleEdit} onDelete={handleDelete} />
                        )) : (
                            <tr><td colSpan={6} className="p-4 text-center text-slate-500">Bu filtreye uygun kayıtlı firma yok.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
             <PaginationControls 
                currentPage={currentPage} 
                totalPages={totalPages} 
                onPageChange={setCurrentPage}
                totalItems={sortedCompanies.length}
                itemsPerPage={ITEMS_PER_PAGE}
            />
            <CompanyFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} company={selectedCompany} />
        </div>
    );
};

export default Companies;