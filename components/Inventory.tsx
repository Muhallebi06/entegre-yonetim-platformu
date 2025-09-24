


import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useData, useUI, useAuth, ModuleDataManager, ProductSelectionModal } from '../App';
import { Product } from '../types';
import { CATEGORY_LABEL } from '../constants';
import { InventoryAnalysis } from './InventoryAnalysis';
// Fix: Import StokTakipData from ../types instead of ../services/firebase to avoid circular dependencies.
import { StokTakipData } from '../types';
import { exportStokTakipData, importStokTakipData, deleteStokTakipData } from '../services/firebase';
import { useDebounce, PaginationControls } from './shared';
import { ProductForm } from './Inventory_ProductForm';
import { ProductList } from './Inventory_ProductList';
import { InventoryLogList } from './Inventory_LogList';
import { AdjustStockModal } from './Inventory_AdjustStockModal';
import { fmtCurrency } from '../utils/helpers';

const Inventory: React.FC = () => {
    const { dataStore, pushData, customers, products: allProducts, boms } = useData();
    const { showConfirmation, showToast } = useUI();
    const { checkPermission } = useAuth();
    
    const [pageView, setPageView] = useState<'list' | 'form'>('list');
    const [activeTab, setActiveTab] = useState<'list' | 'logs' | 'analysis'>('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [adjustModalState, setAdjustModalState] = useState<{ isOpen: boolean; product: Product | null }>({ isOpen: false, product: null });
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

// Fix: The `InventoryLogList` component fetches its own logs for pagination and does not accept a `logs` prop. The unused `logs` variable has been removed.
    const { products } = useMemo(() => ({
        products: dataStore['stokTakip-v1']?.products || [],
    }), [dataStore]);

    const totalInventoryCost = useMemo(() => {
        return products.reduce((total, product) => {
            return total + ((product.qty || 0) * (product.cost || 0));
        }, 0);
    }, [products]);
    
    const filteredProducts = useMemo(() => {
        return products
            .filter(p => {
                if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
                if (debouncedSearchTerm) {
                    const search = debouncedSearchTerm.toLowerCase();
                    return p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search);
                }
                return true;
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }, [products, categoryFilter, debouncedSearchTerm]);

    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm, categoryFilter]);
    
    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    const paginatedProducts = filteredProducts.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const handleAdd = () => { setEditingProduct(null); setPageView('form'); };
    const handleEdit = (p: Product) => { setEditingProduct(p); setPageView('form'); };
    const handleAdjust = (p: Product) => setAdjustModalState({ isOpen: true, product: p });
    const handleCloseForm = () => { setEditingProduct(null); setPageView('list'); };
    
    const handleDelete = useCallback((product: Product) => {
        const isUsedInBom = boms.some(b => b.components.some(c => c.productId === product.id));
        if (isUsedInBom) {
          showToast(`'${product.name}' bir veya daha fazla reçetede kullanıldığı için silinemez.`, 'error');
          return;
        }

        showConfirmation({
            title: "Ürünü Sil",
            message: `'${product.name}' adlı ürün kalıcı olarak silinecektir. Bu işlem geri alınamaz.`,
            confirmText: "Evet, Sil",
            requiresInput: null,
            onConfirm: () => {
                return pushData('stokTakip-v1', (prev: StokTakipData) => ({
                    products: (prev?.products || []).filter(p => p.id !== product.id),
                    logs: prev?.logs || [],
                })).then(() => {
                    showToast("Ürün silindi.", "success");
                });
            }
        });
    }, [boms, pushData, showConfirmation, showToast]);

    const inputClass = "px-3 py-2 border rounded-xl w-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100";

    return (
        <div className="mx-auto max-w-screen-2xl p-3 md:p-4">
            {pageView === 'form' ? (
                 <ProductForm 
                    onClose={handleCloseForm}
                    product={editingProduct}
                    customers={customers}
                    products={allProducts}
                />
            ) : (
                <>
                    <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                        <div className="flex items-center gap-4 flex-wrap">
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Stok Yönetimi</h2>
                            {checkPermission('hertz') && (
                                <div className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200 px-3 py-1.5 rounded-full text-sm font-semibold">
                                  Toplam Stok Maliyeti: {fmtCurrency(totalInventoryCost)}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <ModuleDataManager
                                moduleName="Stok Yönetimi"
                                onExport={() => exportStokTakipData(dataStore)}
                                onImport={importStokTakipData}
                                onDelete={deleteStokTakipData}
                            />
                            <button onClick={handleAdd} className="px-3 py-2 rounded-xl btn-brand">Yeni Ürün Ekle</button>
                        </div>
                    </div>
                    
                    <div className="mb-4">
                        <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 mobile-scroll-nav-container">
                            <nav className="flex flex-nowrap space-x-1 mobile-scroll-nav">
                                <button onClick={() => setActiveTab('list')} className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${activeTab === 'list' ? 'bg-white dark:bg-slate-700 shadow' : ''}`}>Ürün Listesi</button>
                                <button onClick={() => setActiveTab('logs')} className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${activeTab === 'logs' ? 'bg-white dark:bg-slate-700 shadow' : ''}`}>Stok Hareketleri</button>
                                <button onClick={() => setActiveTab('analysis')} className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${activeTab === 'analysis' ? 'bg-white dark:bg-slate-700 shadow' : ''}`}>Analiz</button>
                            </nav>
                        </div>
                    </div>
                    
                    {activeTab === 'list' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                <input type="search" placeholder="Ara (Ürün Adı, SKU...)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={inputClass}/>
                                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={inputClass}>
                                    <option value="all">Tüm Kategoriler</option>
                                    {Object.entries(CATEGORY_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                </select>
                            </div>
                            <ProductList
                                products={paginatedProducts}
                                onEdit={handleEdit}
                                onAdjust={handleAdjust}
                                onDelete={handleDelete}
                                customers={customers}
                                allProducts={allProducts}
                            />
                            <PaginationControls 
                                currentPage={currentPage} 
                                totalPages={totalPages} 
                                onPageChange={setCurrentPage}
                                totalItems={filteredProducts.length}
                                itemsPerPage={ITEMS_PER_PAGE}
                            />
                        </>
                    )}

{/* Fix: The `InventoryLogList` component fetches its own data and does not accept a `logs` prop. The prop has been removed to fix the type error. */}
                    {activeTab === 'logs' && <InventoryLogList products={products} />}
                    {activeTab === 'analysis' && <InventoryAnalysis />}
                </>
            )}

            <AdjustStockModal 
                isOpen={adjustModalState.isOpen}
                onClose={() => setAdjustModalState({ isOpen: false, product: null })}
                product={adjustModalState.product}
            />
        </div>
    );
};
export default Inventory;