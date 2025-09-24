import React, { useState } from 'react';
import { OrderLog } from '../types';
import { formatDateTimeTR } from '../utils/helpers';

export const OrderLogList: React.FC<{logs: OrderLog[]}> = ({ logs }) => {
    const [visibleLogs, setVisibleLogs] = useState(100);

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
                        {logs.slice(0, visibleLogs).map((log, index) => (
                            <tr key={index}>
                                <td className="px-2 py-1">{formatDateTimeTR(log.tarih)}</td>
                                <td className="px-2 py-1 font-medium">{log.no}</td>
                                <td className="px-2 py-1">{log.islem}</td>
                                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{log.user}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {visibleLogs < logs.length && (
                <button 
                    onClick={() => setVisibleLogs(v => v + 100)} 
                    className="w-full mt-3 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                    Daha Fazla Yükle ({logs.length - visibleLogs} daha)
                </button>
            )}
        </div>
    );
};