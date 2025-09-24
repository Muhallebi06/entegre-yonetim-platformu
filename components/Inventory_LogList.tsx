import React, { useState, useCallback, useEffect } from 'react';
import { InventoryLog, Product } from '../types';
import { formatDateTimeTR } from '../utils/helpers';
import { fetchPaginatedData } from '../services/firebase';
import { Icon } from '../App';

const LOGS_PER_PAGE = 50;

export const InventoryLogList: React.FC<{
    products: Product[];
}> = ({ products }) => {
    const getProductName = useCallback((id: string) => products.find(p => p.id === id)?.name || id, [products]);
    
    const [logs, setLogs] = useState<InventoryLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);

    const loadMoreLogs = useCallback(async () => {
        if (!hasMore || isLoading) return;
        setIsLoading(true);
        try {
            const result = await fetchPaginatedData(
                'ls/stokTakip-v1/value/logs',
                LOGS_PER_PAGE,
                logs.length
            );
            setLogs(prev => [...prev, ...result.items]);
            setHasMore(result.hasMore);
        } catch (error) {
            console.error("Failed to load more inventory logs:", error);
        } finally {
            setIsLoading(false);
        }
    }, [hasMore, isLoading, logs.length]);

    useEffect(() => {
        // Initial load
        loadMoreLogs();
    }, []); // Runs only once on mount

    return (
         <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-lg border dark:border-slate-700">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Son Stok Hareketleri</h3>
            <div className="overflow-auto max-h-[60vh] rounded-xl border dark:border-slate-700">
                <table className="w-full text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 sticky top-0 z-10">
                        <tr>
                            <th className="text-left px-3 py-2">Tarih</th>
                            <th className="text-left px-3 py-2">Ürün</th>
                            <th className="text-left px-3 py-2">İşlem</th>
                            <th className="text-right px-3 py-2">Değişim</th>
                            <th className="text-right px-3 py-2">Son Stok</th>
                            <th className="text-left px-3 py-2">Not</th>
                            <th className="text-left px-3 py-2">Kullanıcı</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {logs.map(log => {
                            const typeMap = { 'in': 'Giriş', 'out': 'Çıkış', 'adjustment': 'Düzeltme', 'new': 'Yeni', 'edit': 'Düzenleme', 'delete': 'Silme' };
                            const typeColor = { 'in': 'text-green-600 dark:text-green-400', 'out': 'text-red-600 dark:text-red-400', 'adjustment': 'text-blue-600 dark:text-blue-400' };
                            return (
                                <tr key={log.id}>
                                    <td className="p-3 whitespace-nowrap">{formatDateTimeTR(log.ts)}</td>
                                    <td className="p-3 font-medium">{getProductName(log.productId)}</td>
                                    <td className={`p-3 font-semibold ${typeColor[log.type as keyof typeof typeColor] || ''}`}>{typeMap[log.type] || log.type}</td>
                                    <td className={`p-3 text-right font-semibold ${typeColor[log.type as keyof typeof typeColor] || ''}`}>
                                        {log.amount ? (log.type === 'in' ? `+${log.amount}` : `-${log.amount}`) : '-'}
                                    </td>
                                    <td className="p-3 text-right font-medium">{log.toQty}</td>
                                    <td className="p-3 text-slate-500 dark:text-slate-400">{log.note}</td>
                                    <td className="p-3 text-slate-500 dark:text-slate-400">{log.user}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                 {isLoading && logs.length === 0 && <div className="text-center p-4">Yükleniyor...</div>}
                 {!isLoading && logs.length === 0 && <div className="text-center p-4">Kayıt bulunamadı.</div>}
            </div>
             {hasMore && (
                <button onClick={loadMoreLogs} disabled={isLoading} className="w-full mt-3 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
                    {isLoading ? <><Icon name="loader-2" size={16} className="animate-spin" /> Yükleniyor...</> : 'Daha Fazla Yükle'}
                </button>
             )}
         </div>
    );
};