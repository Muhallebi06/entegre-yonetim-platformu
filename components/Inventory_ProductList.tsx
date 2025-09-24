import React from 'react';
import { Product, Company } from '../types';
import { ProductFeatures, useAuth } from '../App';
import { formatNumber, fmtCurrency } from '../utils/helpers';
import { CATEGORY_LABEL } from '../constants';

export const ProductList: React.FC<{
  products: Product[];
  onEdit: (product: Product) => void;
  onAdjust: (product: Product) => void;
  onDelete: (product: Product) => void;
  customers: Company[];
  allProducts: Product[];
}> = ({ products, onEdit, onAdjust, onDelete, customers, allProducts }) => {
    const { checkPermission } = useAuth();
    const hasDeletePermission = checkPermission('hertz');

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <table className="w-full text-sm responsive-table">
        <thead className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
          <tr>
            <th className="text-left px-3 py-2">Ürün Adı / SKU</th>
            <th className="text-left px-3 py-2">Kategori</th>
            <th className="text-left px-3 py-2">Özellikler</th>
            <th className="text-right px-3 py-2">Mevcut Stok</th>
            <th className="text-right px-3 py-2">Min. Stok</th>
            {checkPermission('hertz') && <th className="text-right px-3 py-2">Maliyet</th>}
            <th className="text-center px-3 py-2">İşlemler</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {products.length > 0 ? products.map(p => (
            <tr key={p.id} className={`dark:hover:bg-slate-700/50 ${(p.min !== undefined && p.qty < p.min) ? 'bg-red-50 dark:bg-red-500/10' : ''}`}>
              <td data-label="Ürün Adı / SKU" className="p-3">
                <div className="font-medium text-slate-800 dark:text-slate-100">{p.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">{p.sku}</div>
              </td>
              <td data-label="Kategori" className="p-3">{CATEGORY_LABEL[p.category] || p.category}</td>
              <td data-label="Özellikler" className="p-3">
                <ProductFeatures product={p} customers={customers} products={allProducts} />
              </td>
              <td data-label="Mevcut Stok" className="p-3 text-right font-semibold">{formatNumber(p.qty)} {p.unit}</td>
              <td data-label="Min. Stok" className="p-3 text-right">{formatNumber(p.min)} {p.unit}</td>
              {checkPermission('hertz') && <td data-label="Maliyet" className="p-3 text-right">{fmtCurrency(p.cost)}</td>}
              <td data-label="İşlemler" className="text-center px-3 py-2">
                <div className="flex justify-center items-center gap-1">
                  <button onClick={() => onEdit(p)} className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-xs">Düzenle</button>
                  <button onClick={() => onAdjust(p)} className="px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-700/50 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs">Hareket</button>
                  <button
                    onClick={() => hasDeletePermission && onDelete(p)}
                    disabled={!hasDeletePermission}
                    title={!hasDeletePermission ? 'Silme yetkiniz yok.' : 'Ürünü sil'}
                    className="px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Sil
                  </button>
                </div>
              </td>
            </tr>
          )) : (
            <tr><td colSpan={checkPermission('hertz') ? 7 : 6} className="text-center py-8 text-slate-500">Bu kriterlere uygun ürün bulunamadı.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
