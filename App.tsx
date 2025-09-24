
import React, { useState, useEffect, useCallback, createContext, useContext, useRef, useMemo, lazy, Suspense, ComponentType } from 'react';
import { USERS, PERMISSIONS, AppName } from './constants';
// Fix: Import DataStore from './types' instead of './services/firebase' to fix circular dependency issues.
import { UserRole, User, Product, Company, ProductCategory, BOM, AppUser, RulmanType, DataStore } from './types';
import { fetchInitialData, pushData as firebasePushData, exportAllData, importAllData, fetchModuleData, listenOnModuleData } from './services/firebase';
import { CATEGORY_LABEL } from './constants';
import { formatNumber } from './utils/helpers';

// Fix: Declare the global 'lucide' object provided by the script in index.html
declare var lucide: any;

// --- SHARED COMPONENTS ---

interface IconProps {
  name: string;
  className?: string;
  size?: number;
  title?: string;
}
export const Icon: React.FC<IconProps> = ({ name, className = "inline-block", size = 24, title }) => {
  return React.createElement('i', {
    'data-lucide': name,
    className,
    width: size,
    height: size,
    title,
  });
};


const LoadingOverlay: React.FC<{ isLoading: boolean; message?: string }> = ({ isLoading, message = "Veriler Yükleniyor..." }) => {
  if (!isLoading) return null;
  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center text-white text-lg">
      <span>{message}</span>
    </div>
  );
};

interface ToastState {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
}
const Toast: React.FC<{ toast: ToastState; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (toast.visible) {
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, onDismiss]);

  const baseClasses = "fixed top-6 right-6 z-[10001] px-6 py-3 rounded-lg text-white font-medium transition-transform duration-300 ease-in-out";
  const typeClasses = toast.type === 'success' ? 'bg-green-500' : 'bg-red-500';
  const visibilityClasses = toast.visible ? 'translate-x-0' : 'translate-x-[200%]';

  return (
    <div className={`${baseClasses} ${typeClasses} ${visibilityClasses}`}>
      {toast.message}
    </div>
  );
};

interface ConfirmationDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void | Promise<void>;
  requiresInput: string | null;
}
const ConfirmationDialog: React.FC<{
  dialogState: ConfirmationDialogState;
  setDialogState: React.Dispatch<React.SetStateAction<ConfirmationDialogState>>;
}> = ({ dialogState, setDialogState }) => {
  const [inputValue, setInputValue] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialogState.isOpen && !dialog?.open) {
      setInputValue("");
      setIsConfirming(false);
      dialog?.showModal();
    } else if (!dialogState.isOpen && dialog?.open) {
      dialog?.close();
    }
  }, [dialogState.isOpen]);

  const handleClose = () => {
    if (isConfirming) return;
    setDialogState(prev => ({ ...prev, isOpen: false }));
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
        await dialogState.onConfirm();
        handleClose();
    } catch (error) {
        console.error("Confirmation action failed:", error);
        // The onConfirm function is expected to handle its own user feedback (toasts).
        // We still close the dialog even if the action failed.
        handleClose();
    } finally {
        setIsConfirming(false);
    }
  };

  const isConfirmDisabled = dialogState.requiresInput ? inputValue.trim().toLowerCase() !== dialogState.requiresInput.toLowerCase() : false;

  return (
    <dialog ref={dialogRef} onClose={handleClose} className="rounded-2xl p-0 w-[96vw] max-w-md bg-white dark:bg-slate-800">
      {dialogState.isOpen && (
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-2 text-slate-800 dark:text-slate-100">{dialogState.title}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-6" dangerouslySetInnerHTML={{ __html: dialogState.message }}></p>
          {dialogState.requiresInput && (
            <div className="mb-4">
              <label htmlFor="confirmation-input" className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                Onaylamak için '<span className="font-bold">{dialogState.requiresInput}</span>' yazın:
              </label>
              <input
                id="confirmation-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={handleClose} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 btn-textured" disabled={isConfirming}>Vazgeç</button>
            <button
              onClick={handleConfirm}
              disabled={isConfirmDisabled || isConfirming}
              className="px-4 py-2 rounded-xl text-white bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed btn-textured min-w-[100px]"
            >
              {isConfirming ? 'İşleniyor...' : dialogState.confirmText}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
};

export const ModuleDataManager: React.FC<{
    moduleName: string;
    onExport: () => void;
    onImport: (file: File) => Promise<void>;
    onDelete: () => Promise<void>;
}> = ({ moduleName, onExport, onImport, onDelete }) => {
    const { checkPermission } = useAuth();
    const { showConfirmation, showToast } = useUI();
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!checkPermission('hertz')) return null;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        showConfirmation({
            title: `${moduleName} Verilerini Değiştir`,
            message: `<b>'${file.name}'</b> adlı yedek dosyasındaki verilerle mevcut <b>${moduleName}</b> verilerinin üzerine yazılacaktır. Bu işlem geri alınamaz.`,
            confirmText: "Evet, Yükle",
            requiresInput: "YÜKLE",
            onConfirm: async () => {
                try {
                    await onImport(file);
                    showToast(`${moduleName} verileri başarıyla yüklendi.`, "success");
                } catch (err: any) {
                    showToast(err.message, "error");
                }
            }
        });
        if(e.target) e.target.value = ''; // Reset file input
    };

    const handleDeleteClick = () => {
        showConfirmation({
            title: `${moduleName} Verilerini Sil`,
            message: `Bu modüle ait tüm veriler (<b>${moduleName}</b>) kalıcı olarak silinecektir. Bu işlem geri alınamaz.`,
            confirmText: "Evet, Tümünü Sil",
            requiresInput: "SİL",
            onConfirm: async () => {
                try {
                    await onDelete();
                    showToast(`${moduleName} verileri silindi.`, "success");
                } catch (err: any) {
                    showToast(err.message || 'Veri silinirken bir hata oluştu.', "error");
                }
            }
        });
    };
    
    const buttonClass = "px-2 py-2 lg:px-3 flex items-center rounded-xl border text-sm whitespace-nowrap btn-textured";

    return (
        <div className="flex items-center gap-2">
            <button onClick={onExport} className={`${buttonClass} border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-900`}>
                <Icon name="download" size={18} />
                <span className="hidden lg:inline ml-2">Yedekle</span>
            </button>
            <button onClick={() => fileInputRef.current?.click()} className={`${buttonClass} border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-900`}>
                <Icon name="upload" size={18} />
                <span className="hidden lg:inline ml-2">Yedekten Yükle</span>
            </button>
             <button onClick={handleDeleteClick} className={`${buttonClass} border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:border-rose-700 dark:text-rose-200 dark:hover:bg-rose-900`}>
                <Icon name="trash-2" size={18} />
                <span className="hidden lg:inline ml-2">Verileri Sil</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="application/json" />
        </div>
    );
};

// --- REUSABLE HOOKS & COMPONENTS FOR NEW FEATURES ---
import { useDebounce } from './components/shared';

export const ProductFeatures: React.FC<{ product: Product; customers: Company[]; products: Product[] }> = ({ product, customers, products }) => {
    const features: { label: string; value: string | number }[] = [];
    const getCustomerName = (id?: string) => customers.find(c => c.id === id)?.name;
    const getMilName = (id?: string) => products.find(p => p.id === id)?.name;

    const addFeat = (label: string, value: any) => {
        if (value !== undefined && value !== null && value !== '') {
            features.push({ label, value: String(value) });
        }
    };

    switch (product.category) {
        case 'sargiliPaket':
            addFeat('kW', product.kw);
            addFeat('RPM', product.rpm);
            addFeat('Volt', product.volt);
            break;
        case 'paketliGovde':
            addFeat('kW', product.pg_kw ?? product.kw);
            addFeat('RPM', product.pg_rpm ?? product.rpm);
            addFeat('Volt', product.pg_volt ?? product.volt);
            addFeat('Klemens', product.pg_klemensYonu);
            addFeat('Montaj', product.pg_montajDeligi);
            addFeat('Bağlantı', product.pg_baglantiTipi);
            if (product.pg_customerId) {
                const customerName = getCustomerName(product.pg_customerId);
                if (customerName) addFeat('Müşteri', customerName);
            }
            break;
        case 'mil':
        case 'rotorluMil':
        case 'taslanmisMil':
            addFeat('Mil Kodu', product.milCode);
            if (product.customerId) {
                const customerName = getCustomerName(product.customerId);
                if (customerName) addFeat('Müşteri', customerName);
            }
            break;
        case 'motor':
            addFeat('kW', product.m_kw ?? product.kw);
            addFeat('RPM', product.m_rpm ?? product.rpm);
            addFeat('Volt', product.m_volt ?? product.volt);
            if (product.m_milProductId) {
                const milName = getMilName(product.m_milProductId);
                if (milName) addFeat('Mil', milName);
            }
            addFeat('Kapak', product.m_cover);
            addFeat('Rulman', product.m_rulman);
            addFeat('Klemens', product.m_klemensYonu);
            addFeat('Montaj', product.m_montajDeligi);
            addFeat('Bağlantı', product.m_baglantiTipi);
            if (product.m_customerId) {
                const customerName = getCustomerName(product.m_customerId);
                if (customerName) addFeat('Müşteri', customerName);
            }
            break;
    }

    if (features.length === 0) {
        return <span className="text-slate-400">-</span>;
    }

    return (
        <div className="flex flex-col gap-0.5">
            {features.map((f, i) => (
                <div key={i} className="text-xs whitespace-nowrap">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">{f.label}: </span>
                    <span className="text-slate-700 dark:text-slate-200 capitalize">{f.value}</span>
                </div>
            ))}
        </div>
    );
};

export const ProductSelectionModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onProductSelect: (product: Product) => void;
    productFilter?: (product: Product) => boolean;
    title?: string;
}> = ({ isOpen, onClose, onProductSelect, productFilter, title = "Ürün Seç" }) => {
    const { dataStore } = useData();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (isOpen && !dialog?.open) {
            setSearchTerm('');
            setCategoryFilter('all');
            dialog?.showModal();
        } else if (!isOpen && dialog?.open) {
            dialog?.close();
        }
    }, [isOpen]);

    const { products, customers } = useMemo(() => ({
        products: dataStore['stokTakip-v1']?.products || [],
        customers: (dataStore.contacts || []).filter(c => c.type === 'customer'),
    }), [dataStore]);

    const filteredProducts = useMemo(() => {
        return products
            .filter(p => {
                if (productFilter && !productFilter(p)) return false;
                if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
                if (debouncedSearchTerm) {
                    const search = debouncedSearchTerm.toLowerCase();
                    return p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search);
                }
                return true;
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }, [products, productFilter, categoryFilter, debouncedSearchTerm]);

    const handleSelect = (product: Product) => {
        onProductSelect(product);
    };

    const inputClass = "px-3 py-2 border rounded-xl w-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600";

    return (
        <dialog ref={dialogRef} onClose={onClose} className="rounded-2xl p-0 w-[96vw] max-w-3xl bg-white dark:bg-slate-800">
            {isOpen && (
                <div className="flex flex-col h-[85vh]">
                    <header className="p-4 border-b dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
                        <h3 className="text-lg font-semibold mb-3 text-slate-800 dark:text-slate-100">{title}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input type="search" placeholder="Ara (Ürün Adı, SKU...)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={inputClass}/>
                            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={inputClass}>
                                <option value="all">Tüm Kategoriler</option>
                                {Object.entries(CATEGORY_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </select>
                        </div>
                    </header>
                    <main className="flex-1 overflow-y-auto p-4">
                         <div className="overflow-auto rounded-xl border dark:border-slate-700">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 sticky top-0">
                                    <tr>
                                        <th className="text-left px-3 py-2">Ürün Adı / SKU</th>
                                        <th className="text-left px-3 py-2">Özellikler</th>
                                        <th className="text-right px-3 py-2">Stok</th>
                                        <th className="text-center px-3 py-2">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {filteredProducts.length > 0 ? filteredProducts.map(p => (
                                        <tr key={p.id} className="dark:hover:bg-slate-700/50">
                                            <td data-label="Ürün Adı / SKU" className="p-3">
                                                <div className="font-medium">{p.name}</div>
                                                <div className="text-xs text-slate-500 font-mono">{p.sku}</div>
                                            </td>
                                            <td data-label="Özellikler" className="p-3">
                                                <ProductFeatures product={p} customers={customers} products={products} />
                                            </td>
                                            <td data-label="Stok" className="p-3 text-right">{formatNumber(p.qty)} {p.unit}</td>
                                            <td data-label="İşlem" className="text-center px-3 py-2">
                                                <button 
                                                    type="button"
                                                    onClick={() => handleSelect(p)} 
                                                    className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 btn-textured"
                                                >
                                                    Seç
                                                </button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={4} className="text-center py-8 text-slate-500">Bu kriterlere uygun ürün bulunamadı.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </main>
                    <footer className="p-4 border-t dark:border-slate-700">
                        <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">Kapat</button>
                    </footer>
                </div>
            )}
        </dialog>
    );
};

// --- APP CONTEXTS ---

// Data Context
interface DataContextType {
    dataStore: DataStore;
    pushData: <T>(key: keyof DataStore, updater: (prev: T) => T) => Promise<void>;
    customers: Company[];
    products: Product[];
    boms: BOM[];
}
const DataContext = createContext<DataContextType | null>(null);
export const useData = () => {
    const context = useContext(DataContext);
    if (!context) throw new Error("useData must be used within a DataProvider");
    return context;
};

// UI Context
interface UIContextType {
    showToast: (message: string, type: 'success' | 'error') => void;
    showConfirmation: (state: Omit<ConfirmationDialogState, 'isOpen' | 'onConfirm'> & { onConfirm: () => void | Promise<void> }) => void;
    showUiLoading: (message: string) => void;
    hideUiLoading: () => void;
}
const UIContext = createContext<UIContextType | null>(null);
export const useUI = () => {
    const context = useContext(UIContext);
    if (!context) throw new Error("useUI must be used within a UIProvider");
    return context;
};

// Auth Context
interface AuthContextType {
    user: User | null;
    checkPermission: (key: keyof typeof PERMISSIONS) => boolean;
}
const AuthContext = createContext<AuthContextType | null>(null);
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};

// Editing State Context (for preventing concurrent edits)
interface EditingStateContextType {
    editingRecord: { recordId: string | null, editorId: string | null, timestamp: number | null };
    setEditingRecord: React.Dispatch<React.SetStateAction<{ recordId: string | null, editorId: string | null, timestamp: number | null }>>;
}
const EditingStateContext = createContext<EditingStateContextType | null>(null);
export const useEditingState = () => {
    const context = useContext(EditingStateContext);
    if (!context) throw new Error("useEditingState must be used within an EditingStateProvider");
    return context;
};

// --- LAZY LOADED MODULES ---
const Dashboard = lazy(() => import('./components/Dashboard'));
const OrderService = lazy(() => import('./components/OrderService'));
const Manufacturing = lazy(() => import('./components/Manufacturing'));
const BOMComponent = lazy(() => import('./components/BOM'));
// Fix: Add a type assertion to fix the lazy import type error for the Inventory component.
const Inventory = lazy(() => import('./components/Inventory') as Promise<{ default: ComponentType<any> }>);
const Companies = lazy(() => import('./components/Companies'));
const UserManagement = lazy(() => import('./components/UserManagement'));

const modules: { [key in AppName]: { component: ComponentType<any>; icon: string; label: string; permission?: keyof typeof PERMISSIONS } } = {
    dashboard: { component: Dashboard, icon: 'layout-dashboard', label: 'Ana Panel' },
    siparis: { component: OrderService, icon: 'truck', label: 'Sipariş & Servis', permission: 'siparisServis' },
    imalat: { component: Manufacturing, icon: 'factory', label: 'İmalat Takip' },
    bom: { component: BOMComponent, icon: 'clipboard-list', label: 'Reçeteler', permission: 'hertz' },
    stok: { component: Inventory, icon: 'boxes', label: 'Stok Yönetimi' },
    firmalar: { component: Companies, icon: 'building-2', label: 'Firmalar' },
    kullanicilar: { component: UserManagement, icon: 'users', label: 'Kullanıcılar', permission: 'hertz' },
};

// --- LOGIN COMPONENT ---
const Login: React.FC<{ onLogin: (user: User) => void; allUsers: AppUser[] }> = ({ onLogin, allUsers }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const usernameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        usernameRef.current?.focus();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setTimeout(() => { // Simulate network delay
            const user = (allUsers || []).find(u => u.username.toLowerCase() === username.toLowerCase());
            if (user && btoa(password) === user.pass) {
                onLogin({ username: user.username, role: user.role });
            } else {
                setError('Kullanıcı adı veya şifre hatalı.');
                setIsLoading(false);
            }
        }, 500);
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
            <div className="w-full max-w-sm p-8 space-y-6 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Hertz Motor Yönetim</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Giriş Yap</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Kullanıcı Adı</label>
                        <input ref={usernameRef} type="text" value={username} onChange={e => setUsername(e.target.value)} required className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Şifre</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                    {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                    <button type="submit" disabled={isLoading} className="w-full btn-brand py-2.5 rounded-xl disabled:bg-orange-300">{isLoading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}</button>
                </form>
            </div>
        </div>
    );
};


// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [dataStore, setDataStore] = useState<DataStore>({});
    const [isLoading, setIsLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState("Veritabanına bağlanılıyor...");
    const [error, setError] = useState<string | null>(null);
    const [activeApp, setActiveApp] = useState<AppName>('dashboard');
    const [toast, setToast] = useState<ToastState>({ message: '', type: 'success', visible: false });
    const [dialog, setDialog] = useState<ConfirmationDialogState>({ isOpen: false, title: '', message: '', confirmText: '', onConfirm: () => {}, requiresInput: null });
    const [uiLoading, setUiLoading] = useState<{ isLoading: boolean; message: string }>({ isLoading: false, message: '' });
    const [editingRecord, setEditingRecord] = useState<{ recordId: string | null; editorId: string | null; timestamp: number | null }>({ recordId: null, editorId: null, timestamp: null });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [loadedModules, setLoadedModules] = useState<Set<keyof DataStore>>(new Set(['users', 'contacts']));
    const [isModuleLoading, setIsModuleLoading] = useState(false);
    const activeListeners = useRef<Record<string, () => void>>({});

    const checkPermission = useCallback((key: keyof typeof PERMISSIONS) => {
        if (!user) return false;
        if (user.role === 'admin') return true;
        return PERMISSIONS[key]?.includes(user.username);
    }, [user]);

    // --- UI Methods ---
    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type, visible: true });
    };

    const showConfirmation = (state: Omit<ConfirmationDialogState, 'isOpen'>) => {
        setDialog({ ...state, isOpen: true });
    };

    const showUiLoading = (message = "İşleniyor...") => setUiLoading({ isLoading: true, message });
    const hideUiLoading = () => setUiLoading({ isLoading: false, message: '' });

    useEffect(() => {
        let isMounted = true;
        const loadEssentialData = async () => {
            try {
                const initialData = await fetchInitialData();
                if (isMounted) {
                    setDataStore(initialData);

                    const authUser = sessionStorage.getItem("auth_user");
                    const authRole = sessionStorage.getItem("auth_role") as UserRole;
                    if (authUser && authRole) {
                        const userExists = (initialData.users || []).some(u => u.username === authUser && u.role === authRole);
                        if (userExists) {
                           setUser({ username: authUser, role: authRole });
                        } else {
                           sessionStorage.clear(); // Stale session data
                        }
                    }
                }
            } catch (err: any) {
                if (isMounted) {
                    setError(err.message || "Bilinmeyen bir veritabanı hatası oluştu.");
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadEssentialData();
        return () => { 
            isMounted = false;
            Object.values(activeListeners.current).forEach(unsubscribe => unsubscribe());
            activeListeners.current = {};
        };
    }, []);

    useEffect(() => {
        const moduleDataRequirements: Record<AppName, (keyof DataStore)[]> = {
            dashboard: ['siparisler', 'sevkEdilenler', 'stokTakip-v1'],
// Fix: Add 'siparisLog' to ensure order logs are fetched for the "Sipariş & Servis" module.
            siparis: ['siparisler', 'sevkEdilenler', 'servisKayitlari', 'servisSevkEdilenler', 'stokTakip-v1', 'boms', 'siparisLog'],
            imalat: ['siparisler', 'workOrders', 'stokTakip-v1', 'boms'],
            bom: ['siparisler', 'stokTakip-v1', 'boms'],
            stok: ['stokTakip-v1', 'boms'],
            firmalar: [], // Already loaded
            kullanicilar: [], // Already loaded
        };

        const loadModuleData = async () => {
            if (!user) return;
            
            const requiredKeys = moduleDataRequirements[activeApp];
            const keysToLoad = requiredKeys.filter(key => !loadedModules.has(key));

            if (keysToLoad.length === 0) return;

            setIsModuleLoading(true);
            try {
                const fetchPromises = keysToLoad.map(key => fetchModuleData<any>(key));
                const results = await Promise.all(fetchPromises);

                setDataStore(prevDataStore => {
                    const newDataStore = { ...prevDataStore };
                    keysToLoad.forEach((key, index) => {
                        newDataStore[key] = results[index];
                    });
                    return newDataStore;
                });

                keysToLoad.forEach(key => {
                    if (!activeListeners.current[key]) {
                        const unsubscribe = listenOnModuleData(key, (value) => {
                            setDataStore(prev => ({...prev, [key]: value}));
                            showToast("Veriler güncellendi.", "success");
                        });
                        activeListeners.current[key] = unsubscribe;
                    }
                });
                
                setLoadedModules(prev => new Set([...prev, ...keysToLoad]));

            } catch (error: any) {
                showToast(error.message || "Modül verileri yüklenirken bir hata oluştu.", "error");
            } finally {
                setIsModuleLoading(false);
            }
        };

        loadModuleData();
    }, [activeApp, user, loadedModules]);

    useEffect(() => {
        lucide.createIcons();
    }, [activeApp, isLoading, dataStore]);

    const handleLogin = (loggedInUser: User) => {
        sessionStorage.setItem("auth_user", loggedInUser.username);
        sessionStorage.setItem("auth_role", loggedInUser.role);
        setUser(loggedInUser);
    };

    const handleLogout = () => {
        sessionStorage.clear();
        setUser(null);
        setActiveApp('dashboard');
    };
    
    // --- Data Methods ---
    // The new transactional pushData
    // Fix: Added a trailing comma inside the generic <T,> to prevent TSX parser from misinterpreting it as a JSX tag.
    const pushDataWithOptimisticUpdate = async <T,>(key: keyof DataStore, updater: (prev: T) => T): Promise<void> => {
        // Fix: Correctly cast the default value to ensure type safety for the updater function.
        const defaultValues: { [key in keyof DataStore]?: any } = {
            'stokTakip-v1': { products: [], logs: [] },
            'users': [], 'contacts': [], 'siparisler': [], 'siparisLog': [], 'sevkEdilenler': [],
            'servisKayitlari': [], 'servisSevkEdilenler': [], 'boms': [], 'workOrders': []
        };
        const currentState = (dataStore[key] ?? defaultValues[key]) as T;

        const newState = updater(currentState);
        
        // Optimistic UI update
        setDataStore(prev => ({...prev, [key]: newState}));
        
        try {
            await firebasePushData(key, () => newState);
        } catch (error) {
            // Rollback on failure
            setDataStore(prev => ({...prev, [key]: currentState}));
            showToast("Veri kaydedilemedi. Değişiklikler geri alındı.", "error");
            console.error("Firebase push failed, rolling back:", error);
            // Rethrow so caller can handle if needed
            throw error;
        }
    };
    
    // Data passed to contexts
    const dataContextValue = useMemo(() => ({
      dataStore,
      pushData: pushDataWithOptimisticUpdate,
      customers: (dataStore.contacts || []).filter(c => c.type === 'customer'),
      products: dataStore['stokTakip-v1']?.products || [],
      boms: dataStore.boms || [],
    }), [dataStore]);
    
    const uiContextValue = useMemo(() => ({ showToast, showConfirmation, showUiLoading, hideUiLoading }), []);
    const authContextValue = useMemo(() => ({ user, checkPermission }), [user, checkPermission]);
    const editingStateContextValue = useMemo(() => ({ editingRecord, setEditingRecord }), [editingRecord]);

    const handleImportAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        showConfirmation({
            title: "Tüm Verileri Değiştir",
            message: `<b>TÜM SİSTEM VERİLERİ</b>, '${file.name}' adlı yedek dosyasındaki verilerle değiştirilecektir. Bu işlem geri alınamaz.`,
            confirmText: "Evet, Hepsini Değiştir",
            requiresInput: "YÜKLE",
            onConfirm: async () => {
                showUiLoading("Tüm veriler yükleniyor...");
                try {
                    await importAllData(file);
                    showToast("Tüm veriler başarıyla yüklendi. Sayfa yenilenecek.", "success");
                    setTimeout(() => window.location.reload(), 2000);
                } catch(err: any) { showToast(err.message, "error"); } finally { hideUiLoading(); }
            }
        });
        if(e.target) e.target.value = ''; // Reset file input
    };

    if (isLoading) return <LoadingOverlay isLoading={true} message={loadingMessage} />;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!user) return <Login onLogin={handleLogin} allUsers={dataStore.users || []} />;
    
    // --- RENDER LOGIC ---
    const ActiveComponent = modules[activeApp].component;

    return (
        <AuthContext.Provider value={authContextValue}>
            <DataContext.Provider value={dataContextValue}>
                <UIContext.Provider value={uiContextValue}>
                <EditingStateContext.Provider value={editingStateContextValue}>
                    <div className="flex flex-col h-screen">
                        <header className="flex-shrink-0 bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 p-3 flex justify-between items-center z-50">
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-lg text-slate-800 dark:text-slate-100">Hertz Motor</span>
                                <span className="hidden sm:inline text-sm text-slate-500 dark:text-slate-400">Entegre Yönetim Platformu</span>
                            </div>
                            <div className="flex items-center gap-3">
                                {checkPermission('hertz') && (
                                    <>
                                        <button onClick={exportAllData} className="px-2 py-2 lg:px-3 flex items-center rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-900 text-sm whitespace-nowrap btn-textured"><Icon name="download" size={18} /><span className="hidden lg:inline ml-2">Tam Yedek Al</span></button>
                                        <button onClick={() => fileInputRef.current?.click()} className="px-2 py-2 lg:px-3 flex items-center rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-900 text-sm whitespace-nowrap btn-textured"><Icon name="upload" size={18} /><span className="hidden lg:inline ml-2">Yedekten Yükle</span></button>
                                        <input type="file" ref={fileInputRef} onChange={handleImportAll} className="hidden" accept="application/json" />
                                    </>
                                )}
                                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-full">
                                    <Icon name="user" size={16} className="text-slate-600 dark:text-slate-300" />
                                    <span className="text-sm font-medium capitalize">{user.username}</span>
                                </div>
                                <button onClick={handleLogout} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" title="Çıkış Yap"><Icon name="log-out" size={18}/></button>
                            </div>
                        </header>
                        <div className="flex flex-1 overflow-hidden">
                            <aside className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 p-4 hidden lg:block">
                                <nav className="space-y-2">
                                    {Object.entries(modules).map(([key, mod]) => {
                                        const hasPermission = !mod.permission || checkPermission(mod.permission);
                                        if (!hasPermission) return null;
                                        return (
                                            <a key={key} href="#" onClick={(e) => { e.preventDefault(); setActiveApp(key as AppName); }} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeApp === key ? 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                                                <Icon name={mod.icon as any} size={20} />
                                                <span>{mod.label}</span>
                                            </a>
                                        );
                                    })}
                                </nav>
                            </aside>
                            <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900">
                                <Suspense fallback={<LoadingOverlay isLoading={true} message="Modül Yükleniyor..." />}>
                                    <ActiveComponent />
                                </Suspense>
                            </main>
                        </div>
                        {/* Mobile Navigation */}
                        <div className="lg:hidden bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-2">
                             <nav className="flex justify-around items-center">
                                {Object.entries(modules).map(([key, mod]) => {
                                    const hasPermission = !mod.permission || checkPermission(mod.permission);
                                    if (!hasPermission) return null;
                                    return (
                                        <a key={key} href="#" onClick={(e) => { e.preventDefault(); setActiveApp(key as AppName); }} className={`flex flex-col items-center justify-center p-2 rounded-lg w-20 h-16 transition-colors ${activeApp === key ? 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                            <Icon name={mod.icon as any} size={24} />
                                            <span className="text-[10px] mt-1 text-center">{mod.label}</span>
                                        </a>
                                    );
                                })}
                            </nav>
                        </div>
                    </div>
                    
                    <Toast toast={toast} onDismiss={() => setToast({ ...toast, visible: false })} />
                    <ConfirmationDialog dialogState={dialog} setDialogState={setDialog} />
                    <LoadingOverlay isLoading={uiLoading.isLoading} message={uiLoading.message} />
                    <LoadingOverlay isLoading={isModuleLoading} message="Modül Verileri Yükleniyor..." />
                </EditingStateContext.Provider>
                </UIContext.Provider>
            </DataContext.Provider>
        </AuthContext.Provider>
    );
};
export default App;