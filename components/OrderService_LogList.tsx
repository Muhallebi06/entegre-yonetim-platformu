import React, { useState, useEffect, useCallback } from 'react';
import { OrderLog } from '../types';
import { formatDateTimeTR } from '../utils/helpers';
import { fetchPaginatedData } from '../services/firebase';
import { Icon } from '../App';

const LOGS_PER_PAGE = 100;

export const OrderLogList: React.FC<{}> = () => {
    const [logs, setLogs] = useState<OrderLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);

    const loadMoreLogs = useCallback(async () => {
        if (!hasMore || isLoading) return;
        setIsLoading(true);
        try {
            const result = await fetchPaginatedData(
                'ls/siparisLog/value',
                LOGS_PER_PAGE,
                logs.length
            );
            setLogs(prev => [...prev, ...result.items]);
            setHasMore(result.hasMore);
        } catch (error) {
            console.error("Failed to load more order logs:", error);
        } finally {
            setIsLoading(false);
        }
    }, [hasMore, isLoading, logs.length]);

    useEffect(() => {
        // Initial load
        loadMoreLogs();
    }, []); // Runs only once on mount

    return (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
            <h2 className="text-lg font-semibold mb-2 dark:text-slate-100">📜 Hareket Geçmişi</h2>
            <div className="overflow-auto max-h-64">
                <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-slate-600 dark:text-slate-300 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                            <th className="text-left px-2 py-1">Tarih</th>
                            <th className="text-left px-2 py-1">Sipariş No</th>
                            <th className="text-left px-2 py-1">İşlem</th>
                            <th className="text-left px-2 py-1">Kullanıcı</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {logs.map((log, index) => (
                            <tr key={index}>
                                <td className="px-2 py-1">{formatDateTimeTR(log.tarih)}</td>
                                <td className="px-2 py-1 font-medium">{log.no}</td>
                                <td className="px-2 py-1">{log.islem}</td>
                                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{log.user}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {isLoading && logs.length === 0 && <div className="text-center p-4">Yükleniyor...</div>}
                {!isLoading && logs.length === 0 && <div className="text-center p-4">Kayıt bulunamadı.</div>}
            </div>
            {hasMore && (
                <button 
                    onClick={loadMoreLogs} 
                    disabled={isLoading}
                    className="w-full mt-3 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {isLoading ? <><Icon name="loader-2" size={16} className="animate-spin" /> Yükleniyor...</> : 'Daha Fazla Yükle'}
                </button>
            )}
        </div>
    );
};