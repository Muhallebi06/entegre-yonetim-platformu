import React, { useMemo, useState } from 'react';
import { ChartConfiguration } from 'chart.js';
import { Order, WorkOrder, Company, Product } from '../types';
import { ProductSelectionModal, Icon } from '../App';
import { ChartWrapper } from './shared';
import { parseAnyDate } from '../utils/helpers';

const IMALAT_ASAMALARI: { key: string; label: string; group: string }[] = [
    { key: 'bobinaj', label: 'Bobinaj', group: 'bobinaj' },
    { key: 'govdeImalat', label: 'Gövde İmalatı', group: 'govdeImalat' },
    { key: 'milIsleme', label: 'Mil İşleme', group: 'milIsleme' },
    { key: 'rotorluMilIsleme', label: 'Rotorlu Mil İşleme', group: 'milIsleme' },
    { key: 'rotorluMilTaslama', label: 'Rotorlu Mil Taşlama', group: 'milIsleme' },
    { key: 'kapakIsleme', label: 'Kapak İşleme', group: 'kapakIsleme' },
    { key: 'kapakTaslama', label: 'Çelik Kapak Taşlama', group: 'kapakIsleme' },
    { key: 'montaj', label: 'Motor Montajı', group: 'montaj' },
];

const AnalysisCard: React.FC<{ value: string | number; label: string; }> = ({ value, label }) => (
    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
);

export const ManufacturingAnalysis: React.FC<{
    orders: Order[];
    workOrders: WorkOrder[];
    customers: Company[];
    products: Product[];
}> = ({ orders, workOrders, customers, products }) => {
    const [productFilterId, setProductFilterId] = useState<string | null>(null);
    const [isProductModalOpen, setProductModalOpen] = useState(false);
    const [capacityDays, setCapacityDays] = useState(30);

    const analysisData = useMemo(() => {
        const allTasks = [...orders, ...workOrders];
        const completedStages: { stageKey: string, durationHours: number, onTime: boolean, user?: string }[] = [];
        const wipStages: { [key: string]: number } = {};
        IMALAT_ASAMALARI.forEach(s => wipStages[s.key] = 0);
        let totalActiveJobs = 0;

        // Product Lead Time Analysis
        const productLeadTimes: { [productName: string]: { totalHours: number; count: number } } = {};

        for (const task of allTasks) {
            if (!task.imalatDurumu) continue;
            
            const stages = Object.values(task.imalatDurumu);
            const isComplete = stages.length > 0 && stages.every(s => s.durum === 'hazir');
            let isActive = false;

            if (isComplete) {
                const startDates = stages.map(s => s.baslamaTarihi ? new Date(s.baslamaTarihi).getTime() : Infinity).filter(t => t !== Infinity);
                const endDates = stages.map(s => s.tamamlanmaTarihi ? new Date(s.tamamlanmaTarihi).getTime() : -Infinity).filter(t => t !== -Infinity);

                if (startDates.length > 0 && endDates.length > 0) {
                    const minStart = Math.min(...startDates);
                    const maxEnd = Math.max(...endDates);
                    const durationHours = (maxEnd - minStart) / (1000 * 60 * 60);

                    const productName = 'musteriId' in task 
                        ? (task as Order).urun 
                        : (products.find(p => p.id === (task as WorkOrder).productId)?.name || 'Bilinmeyen Ürün');

                    if (!productLeadTimes[productName]) {
                        productLeadTimes[productName] = { totalHours: 0, count: 0 };
                    }
                    productLeadTimes[productName].totalHours += durationHours;
                    productLeadTimes[productName].count++;
                }
            }
            
            for (const stageKey in task.imalatDurumu) {
                const stage = task.imalatDurumu[stageKey];
                if (stage.durum === 'bekliyor' || stage.durum === 'imalatta') {
                     wipStages[stageKey]++;
                     isActive = true;
                }
                if (stage.durum === 'hazir' && stage.baslamaTarihi && stage.tamamlanmaTarihi) {
                    const start = new Date(stage.baslamaTarihi);
                    const end = new Date(stage.tamamlanmaTarihi);
                    const durationMs = end.getTime() - start.getTime();
                    const durationHours = durationMs / (1000 * 60 * 60);

                    let onTime = true;
                    if (stage.termin) {
                        const termin = parseAnyDate(stage.termin);
                        if (termin && end.getTime() > termin.getTime() + 86399999) { // add 23:59:59 to termin
                            onTime = false;
                        }
                    }
                    completedStages.push({ stageKey, durationHours, onTime, user: stage.atananKullanici });
                }
            }
            if(isActive) totalActiveJobs++;
        }

        // Avg Completion Time
        const stageDurations: { [key: string]: { totalHours: number, count: number } } = {};
        completedStages.forEach(s => {
            if (!stageDurations[s.stageKey]) stageDurations[s.stageKey] = { totalHours: 0, count: 0 };
            stageDurations[s.stageKey].totalHours += s.durationHours;
            stageDurations[s.stageKey].count++;
        });

        const avgCompletionLabels = IMALAT_ASAMALARI.map(s => s.label);
        const avgCompletionData = IMALAT_ASAMALARI.map(s => {
            const data = stageDurations[s.key];
            return data ? (data.totalHours / data.count) : 0;
        });
        
        // On-Time Performance
        const onTimePerformance: { [key: string]: { onTime: number, late: number } } = {};
        completedStages.forEach(s => {
            if (!onTimePerformance[s.stageKey]) onTimePerformance[s.stageKey] = { onTime: 0, late: 0 };
            if (s.onTime) onTimePerformance[s.stageKey].onTime++;
            else onTimePerformance[s.stageKey].late++;
        });

        const onTimeLabels = IMALAT_ASAMALARI.map(s => s.label);
        const onTimeData = IMALAT_ASAMALARI.map(s => onTimePerformance[s.key]?.onTime || 0);
        const lateData = IMALAT_ASAMALARI.map(s => onTimePerformance[s.key]?.late || 0);
        
        const totalOnTime = completedStages.filter(s => s.onTime).length;
        const totalCompleted = completedStages.length;
        const overallOnTimeRate = totalCompleted > 0 ? ((totalOnTime / totalCompleted) * 100).toFixed(1) + '%' : 'N/A';

        // User Performance
        const userPerformance: { [user: string]: number } = {};
        completedStages.forEach(s => {
            if(s.user) userPerformance[s.user] = (userPerformance[s.user] || 0) + 1;
        });
        const sortedUsers = Object.entries(userPerformance).sort((a,b) => b[1] - a[1]);

        // Finalize Product Lead Time Chart Data
        let avgProductLeadTime = Object.entries(productLeadTimes)
            .map(([productName, data]) => ({
                productName,
                avgHours: data.totalHours / data.count,
            }))
            .sort((a, b) => b.avgHours - a.avgHours);

        if (productFilterId) {
            const selectedProduct = products.find(p => p.id === productFilterId);
            if (selectedProduct) {
                avgProductLeadTime = avgProductLeadTime.filter(p => p.productName === selectedProduct.name);
            }
        } else {
            avgProductLeadTime = avgProductLeadTime.slice(0, 15);
        }

        const productLeadTimeChart = {
            labels: avgProductLeadTime.map(p => p.productName),
            datasets: [{
                label: 'Ort. İmalat Süresi (saat)',
                data: avgProductLeadTime.map(p => Number(p.avgHours.toFixed(2))),
                backgroundColor: '#8b5cf6',
            }]
        };
        
        // --- Capacity Utilization Analysis (Corrected Logic) ---
        const now = new Date();
        const capacityThreshold = new Date();
        capacityThreshold.setDate(now.getDate() - capacityDays);

        const userCapacityHours: { [user: string]: number } = {};
        const stageCapacityHours: { [stageKey: string]: number } = {};

        for (const task of allTasks) {
            if (!task.imalatDurumu) continue;
            for (const stageKey in task.imalatDurumu) {
                const stage = task.imalatDurumu[stageKey];

                // Consider only stages that have actually started
                if (stage.baslamaTarihi) {
                    const start = new Date(stage.baslamaTarihi);
                    // If not completed, it's considered ongoing until now
                    const end = stage.tamamlanmaTarihi ? new Date(stage.tamamlanmaTarihi) : now;

                    // Check if the stage's active period overlaps with our analysis window
                    if (start < now && end > capacityThreshold) {
                        const overlapStart = Math.max(start.getTime(), capacityThreshold.getTime());
                        const overlapEnd = Math.min(end.getTime(), now.getTime());
                        const durationInPeriodMs = overlapEnd - overlapStart;

                        if (durationInPeriodMs > 0) {
                            const durationInPeriodHours = durationInPeriodMs / (1000 * 60 * 60);

                            // Add to stage capacity
                            stageCapacityHours[stageKey] = (stageCapacityHours[stageKey] || 0) + durationInPeriodHours;

                            // Add to user capacity
                            const user = stage.atananKullanici;
                            if (user) {
                                userCapacityHours[user] = (userCapacityHours[user] || 0) + durationInPeriodHours;
                            }
                        }
                    }
                }
            }
        }

        const sortedUserCapacity = Object.entries(userCapacityHours).sort((a,b) => b[1] - a[1]);
        const userCapacityChart = {
            labels: sortedUserCapacity.map(([user]) => user),
            datasets: [{
                label: 'Toplam Aktif Çalışma Süresi (saat)',
                data: sortedUserCapacity.map(([, hours]) => Number(hours.toFixed(2))),
                backgroundColor: '#22c55e',
            }]
        };

        const sortedStageCapacity = Object.entries(stageCapacityHours).sort((a,b) => b[1] - a[1]);
        const stageCapacityChart = {
            labels: sortedStageCapacity.map(([stageKey]) => IMALAT_ASAMALARI.find(s => s.key === stageKey)?.label || stageKey),
            datasets: [{
                label: 'Toplam Aktif Çalışma Süresi (saat)',
                data: sortedStageCapacity.map(([, hours]) => Number(hours.toFixed(2))),
                backgroundColor: '#ec4899',
            }]
        };


        return {
            totalActiveJobs,
            totalCompletedStages: totalCompleted,
            overallOnTimeRate,
            avgCompletionChart: { labels: avgCompletionLabels, datasets: [{ label: 'Ort. Süre (saat)', data: avgCompletionData, backgroundColor: '#f97316' }] },
            wipChart: { labels: IMALAT_ASAMALARI.map(s => s.label), datasets: [{ label: 'Aktif İş Sayısı', data: IMALAT_ASAMALARI.map(s => wipStages[s.key]), backgroundColor: '#3b82f6' }] },
            onTimeChart: { labels: onTimeLabels, datasets: [
                { label: 'Zamanında', data: onTimeData, backgroundColor: '#22c55e', stack: 'Stack 0' },
                { label: 'Geç', data: lateData, backgroundColor: '#ef4444', stack: 'Stack 0' }
            ]},
            userPerformance: sortedUsers,
            productLeadTimeChart,
            userCapacityChart,
            stageCapacityChart,
        };
    }, [orders, workOrders, customers, products, productFilterId, capacityDays]);

    const chartOptions: ChartConfiguration['options'] = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
    const horizontalChartOptions: ChartConfiguration['options'] = { ...chartOptions, indexAxis: 'y' };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <AnalysisCard value={analysisData.totalActiveJobs} label="Toplam Aktif İş Emri" />
                <AnalysisCard value={analysisData.totalCompletedStages} label="Tamamlanan Toplam Aşama" />
                <AnalysisCard value={analysisData.overallOnTimeRate} label="Genel Termin Başarı Oranı" />
            </div>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Kullanıcı Kapasite Kullanımı</h3>
                        <select value={capacityDays} onChange={e => setCapacityDays(Number(e.target.value))} className="text-sm rounded-lg border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700">
                            <option value="7">Son 7 Gün</option>
                            <option value="30">Son 30 Gün</option>
                            <option value="90">Son 90 Gün</option>
                        </select>
                    </div>
                    <ChartWrapper chartId="userCapacity" config={{ type: 'bar', data: analysisData.userCapacityChart, options: horizontalChartOptions }} data={analysisData.userCapacityChart.datasets[0].data} containerClass="h-72" />
                </div>
                 <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100">İş İstasyonu Kapasite Kullanımı</h3>
                         <select value={capacityDays} onChange={e => setCapacityDays(Number(e.target.value))} className="text-sm rounded-lg border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700">
                            <option value="7">Son 7 Gün</option>
                            <option value="30">Son 30 Gün</option>
                            <option value="90">Son 90 Gün</option>
                        </select>
                    </div>
                    <ChartWrapper chartId="stageCapacity" config={{ type: 'bar', data: analysisData.stageCapacityChart, options: horizontalChartOptions }} data={analysisData.stageCapacityChart.datasets[0].data} containerClass="h-72" />
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow"><h3 className="font-semibold mb-3 dark:text-slate-100">Ortalama Aşama Tamamlama Süresi (Saat)</h3><ChartWrapper chartId="avgTime" config={{ type: 'bar', data: analysisData.avgCompletionChart, options: chartOptions }} data={analysisData.avgCompletionChart.datasets[0].data} containerClass="h-72" /></div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow"><h3 className="font-semibold mb-3 dark:text-slate-100">Aşamalardaki Mevcut İş Yükü (WIP)</h3><ChartWrapper chartId="wip" config={{ type: 'bar', data: analysisData.wipChart, options: chartOptions }} data={analysisData.wipChart.datasets[0].data} containerClass="h-72" /></div>
            </div>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
                    <h3 className="font-semibold mb-3 dark:text-slate-100">Termin Başarı Analizi</h3>
                    <ChartWrapper chartId="onTime" config={{ type: 'bar', data: analysisData.onTimeChart, options: { ...chartOptions, scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { legend: { display: true, position: 'bottom' } } } }} data={analysisData.onTimeChart.datasets[0].data} containerClass="h-72" />
                </div>
                 <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
                    <h3 className="font-semibold mb-3 dark:text-slate-100">Kullanıcı Performansı (Tamamlanan Aşama Sayısı)</h3>
                    <div className="overflow-auto max-h-72">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-700/50">
                                <tr>
                                    <th className="text-left p-2 font-semibold text-slate-700 dark:text-slate-200">Kullanıcı</th>
                                    <th className="text-right p-2 font-semibold text-slate-700 dark:text-slate-200">Tamamlanan İş</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analysisData.userPerformance.map(([user, count]) => (
                                    <tr key={user} className="border-b border-slate-100 dark:border-slate-700">
                                        <td className="p-2 capitalize">{user}</td>
                                        <td className="p-2 text-right font-medium">{count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
                 <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">Ürün Bazlı Ortalama İmalat Süresi (Saat)</h3>
                    <div className="flex items-center gap-2">
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                            Filtre: <span className="font-semibold">{productFilterId ? products.find(p => p.id === productFilterId)?.name : 'Tümü'}</span>
                        </div>
                        <button onClick={() => setProductModalOpen(true)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">
                            Ürün Seç
                        </button>
                        {productFilterId && (
                            <button onClick={() => setProductFilterId(null)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300" title="Filtreyi Temizle">
                                <Icon name="x" size={16} />
                            </button>
                        )}
                    </div>
                </div>
                <ChartWrapper 
                    chartId="productLeadTime" 
                    config={{ 
                        type: 'bar', 
                        data: analysisData.productLeadTimeChart, 
                        options: { ...horizontalChartOptions } 
                    }} 
                    data={analysisData.productLeadTimeChart.datasets[0].data} 
                    containerClass="h-96" 
                />
            </div>

            <ProductSelectionModal
                isOpen={isProductModalOpen}
                onClose={() => setProductModalOpen(false)}
                onProductSelect={(product) => {
                    setProductFilterId(product.id);
                    setProductModalOpen(false);
                }}
                productFilter={(p) => p.kind === 'mamul' || p.kind === 'yari'}
                title="Analiz için Ürün Seç"
            />
        </div>
    );
};