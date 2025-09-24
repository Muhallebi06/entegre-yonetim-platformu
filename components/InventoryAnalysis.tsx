import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Chart, registerables, ChartConfiguration } from 'chart.js';
import { useData, useAuth } from '../App';
import { Product, InventoryLog } from '../types';
import { formatNumber, fmtCurrency } from '../utils/helpers';

Chart.register(...registerables);

const ChartWrapper: React.FC<{ chartId: string, config: ChartConfiguration, data: any[], containerClass?: string }> = ({ chartId, config, data, containerClass="" }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (!canvasRef.current) return;
        const chart = Chart.getChart(canvasRef.current);
        if(chart) chart.destroy();
        
        if (data.length === 0) return;
        
        const newChart = new Chart(canvasRef.current, config);
        return () => newChart.destroy();
    }, [config, data, chartId]);

    return (
        <div className={`relative ${containerClass}`}>
            {data.length > 0 ? (
                <canvas ref={canvasRef} id={chartId}></canvas>
            ) : (
                <div className="chart-placeholder">Gösterilecek veri bulunamadı.</div>
            )}
        </div>
    );
};


export const InventoryAnalysis: React.FC = () => {
    const { dataStore } = useData();
    const { checkPermission } = useAuth();

    const { products, logs } = useMemo(() => ({
        products: dataStore['stokTakip-v1']?.products || [],
        logs: dataStore['stokTakip-v1']?.logs || [],
    }), [dataStore]);
    
    const [activeDays, setActiveDays] = useState(30);
    const [inactiveDays, setInactiveDays] = useState(90);
    const [turnoverDays, setTurnoverDays] = useState(90);
    const [trendProduct, setTrendProduct] = useState('');

    const analysisData = useMemo(() => {
        // Most Active Products
        const activeThreshold = new Date();
        activeThreshold.setDate(activeThreshold.getDate() - activeDays);
        const hareketler: { [key: string]: number } = {};
        logs.forEach(log => {
            if (new Date(log.ts) > activeThreshold && log.productId) {
                hareketler[log.productId] = (hareketler[log.productId] || 0) + 1;
            }
        });
        const mostActive = Object.entries(hareketler)
            .map(([productId, count]) => ({ product: products.find(p => p.id === productId), count }))
            .filter(item => item.product)
            .sort((a, b) => b.count - a.count)
            .slice(0, 20);

        // Inactive Products
        const inactiveThreshold = new Date();
        inactiveThreshold.setDate(inactiveThreshold.getDate() - inactiveDays);
        const sonHareket: { [key: string]: Date } = {};
        logs.forEach(log => {
            if (log.productId && (!sonHareket[log.productId] || new Date(log.ts) > sonHareket[log.productId])) {
                sonHareket[log.productId] = new Date(log.ts);
            }
        });
        const inactive = products
            .map(p => ({ product: p, lastActivity: sonHareket[p.id] }))
            .filter(item => !item.lastActivity || item.lastActivity < inactiveThreshold)
            .sort((a, b) => (a.lastActivity?.getTime() || 0) - (b.lastActivity?.getTime() || 0));

        // User Activity
        const userActivity: { [key: string]: number } = {};
        logs.forEach(log => {
            if (log.user) userActivity[log.user] = (userActivity[log.user] || 0) + 1;
        });
        const mostActiveUsers = Object.entries(userActivity).sort((a, b) => b[1] - a[1]);
        
        // Inventory Turnover
        const turnoverThreshold = new Date();
        turnoverThreshold.setDate(turnoverThreshold.getDate() - turnoverDays);
        const cogs = logs.filter(l => l.type === 'out' && new Date(l.ts) > turnoverThreshold)
            .reduce((sum, l) => {
                const p = products.find(prod => prod.id === l.productId);
                return sum + ((l.amount || 0) * (p?.cost || 0));
            }, 0);
        const totalInventoryValue = products.reduce((sum, p) => sum + (p.qty * (p.cost || 0)), 0);
        const turnoverRate = totalInventoryValue > 0 ? (cogs / totalInventoryValue) * (365 / turnoverDays) : 0; // Annualized
        const daysInStock = turnoverRate > 0 ? 365 / turnoverRate : 0;
        
        // ABC Analysis
        const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const consumption: { [key: string]: number } = {};
        logs.forEach(log => {
            if (log.type === 'out' && new Date(log.ts) > oneYearAgo && log.productId) {
                consumption[log.productId] = (consumption[log.productId] || 0) + (log.amount || 0);
            }
        });
        const productsWithValue = products
            .map(p => ({ ...p, annualConsumption: consumption[p.id] || 0, annualValue: (consumption[p.id] || 0) * (p.cost || 0) }))
            .filter(p => p.annualValue > 0)
            .sort((a, b) => b.annualValue - a.annualValue);
        const totalAnnualValue = productsWithValue.reduce((sum, p) => sum + p.annualValue, 0);
        let cumulativeValue = 0;
        const abcResults = productsWithValue.map(p => {
            cumulativeValue += p.annualValue;
            const cumulativePercent = totalAnnualValue > 0 ? (cumulativeValue / totalAnnualValue) * 100 : 0;
            let group = 'C';
            if (cumulativePercent <= 80) group = 'A';
            else if (cumulativePercent <= 95) group = 'B';
            return { product: p, group, cumulativePercent };
        });

        return { mostActive, inactive, mostActiveUsers, turnoverRate, daysInStock, abcResults };
    }, [products, logs, activeDays, inactiveDays, turnoverDays]);

    const consumptionTrendData = useMemo(() => {
        const labels: string[] = [];
        const data: number[] = [];
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
        
        for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i, 1);
            labels.push(d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }));
        }

        if (trendProduct) {
            const monthlyConsumption = Array(12).fill(0);
            logs.forEach(log => {
                const logDate = new Date(log.ts);
                if (log.type === 'out' && log.productId === trendProduct && logDate > twelveMonthsAgo) {
                    const monthDiff = (new Date().getFullYear() - logDate.getFullYear()) * 12 + (new Date().getMonth() - logDate.getMonth());
                    if (monthDiff >= 0 && monthDiff < 12) {
                        monthlyConsumption[11 - monthDiff] += (log.amount || 0);
                    }
                }
            });
            data.push(...monthlyConsumption);
        }
        
        return { labels, datasets: [{
            label: 'Aylık Tüketim', data,
            borderColor: 'rgb(var(--brand-rgb))', backgroundColor: 'rgba(var(--brand-rgb), 0.1)',
            fill: true, tension: 0.3
        }]};
    }, [logs, trendProduct]);

    const trendChartConfig: ChartConfiguration = {
        type: 'line', data: consumptionTrendData,
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">En Aktif Ürünler</h3>
                <div className="mb-3">
                    <select value={activeDays} onChange={e => setActiveDays(Number(e.target.value))} className="text-sm rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-700">
                        <option value="30">Son 30 Gün</option><option value="7">Son 7 Gün</option><option value="90">Son 90 Gün</option>
                    </select>
                </div>
                <div className="overflow-auto max-h-80"><table className="w-full text-xs">
                    <thead><tr className="text-left text-slate-600 dark:text-slate-300"><th className="p-2">Ürün</th><th className="p-2 text-right">İşlem Sayısı</th></tr></thead>
                    <tbody>{analysisData.mostActive.map(item => <tr key={item.product!.id}><td className="p-2 border-t border-slate-100 dark:border-slate-700">{item.product!.name}</td><td className="p-2 border-t border-slate-100 dark:border-slate-700 text-right">{item.count}</td></tr>)}</tbody>
                </table></div>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Hareketsiz Ürünler (Ölü Stok)</h3>
                <div className="mb-3">
                    <select value={inactiveDays} onChange={e => setInactiveDays(Number(e.target.value))} className="text-sm rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-700">
                        <option value="90">90+ gündür hareketsiz</option><option value="180">180+ gündür hareketsiz</option><option value="365">365+ gündür hareketsiz</option>
                    </select>
                </div>
                <div className="overflow-auto max-h-80"><table className="w-full text-xs">
                    <thead><tr className="text-left text-slate-600 dark:text-slate-300"><th className="p-2">Ürün</th><th className="p-2">Son Hareket</th><th className="p-2 text-right">Stok</th></tr></thead>
                    <tbody>{analysisData.inactive.map(item => <tr key={item.product.id}><td className="p-2 border-t border-slate-100 dark:border-slate-700">{item.product.name}</td><td className="p-2 border-t border-slate-100 dark:border-slate-700">{item.lastActivity ? item.lastActivity.toLocaleDateString('tr-TR') : 'Hiç'}</td><td className="p-2 border-t border-slate-100 dark:border-slate-700 text-right">{formatNumber(item.product.qty)}</td></tr>)}</tbody>
                </table></div>
            </div>
             {checkPermission('hertz') && <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">Stok Devir Hızı (Yıllıklandırılmış)</h3>
                    <select value={turnoverDays} onChange={e => setTurnoverDays(Number(e.target.value))} className="text-sm rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-700">
                        <option value="365">Son 1 Yıl</option><option value="90">Son 90 Gün</option><option value="30">Son 30 Gün</option>
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center">
                    <div><div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{analysisData.turnoverRate.toFixed(2)}</div><div className="text-xs text-slate-500 dark:text-slate-400">Yıllık Stok Devir Hızı</div></div>
                    <div><div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{analysisData.daysInStock.toFixed(1)} gün</div><div className="text-xs text-slate-500 dark:text-slate-400">Ort. Stokta Kalma Süresi</div></div>
                </div>
            </div>}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                 <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Kullanıcı Aktivitesi</h3>
                 <div className="overflow-auto max-h-80"><table className="w-full text-xs">
                    <thead><tr className="text-left text-slate-600 dark:text-slate-300"><th className="p-2">Kullanıcı</th><th className="p-2 text-right">Toplam İşlem Sayısı</th></tr></thead>
                    <tbody>{analysisData.mostActiveUsers.map(([user, count]) => <tr key={user}><td className="p-2 border-t border-slate-100 dark:border-slate-700">{user}</td><td className="p-2 border-t border-slate-100 dark:border-slate-700 text-right">{count}</td></tr>)}</tbody>
                </table></div>
            </div>
            {checkPermission('hertz') && <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm lg:col-span-2">
                <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">Tüketim Trendleri (Son 12 Ay)</h3>
                    <select value={trendProduct} onChange={e => setTrendProduct(e.target.value)} className="text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 w-full md:w-auto max-w-xs">
                        <option value="">-- Ürün Seç --</option>
                        {products.sort((a,b) => a.name.localeCompare(b.name)).map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                </div>
                <ChartWrapper chartId="tuketimChart" config={trendChartConfig} data={consumptionTrendData.datasets[0].data} containerClass="min-h-[250px]" />
            </div>}
            {checkPermission('hertz') && <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm lg:col-span-2">
                 <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">ABC Analizi (Yıllık Tüketim Değerine Göre)</h3>
                 <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 px-2">Not: Bu analiz, yalnızca birim maliyeti girilmiş olan ürünlerin tüketim verilerine dayanmaktadır.</p>
                 <div className="overflow-auto max-h-96"><table className="w-full text-xs">
                    <thead><tr className="text-left text-slate-600 dark:text-slate-300"><th className="p-2">Ürün</th><th className="p-2">Grup</th><th className="p-2 text-right">Yıllık Değer</th><th className="p-2 text-right">Kümülatif Pay</th></tr></thead>
                    <tbody>{analysisData.abcResults.map(r => {
                        const groupColor = r.group === 'A' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' : (r.group === 'B' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200' : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200');
                        return (<tr key={r.product.id}><td className="p-2 border-t border-slate-100 dark:border-slate-700">{r.product.name} <span className="text-slate-500">({r.product.sku})</span></td><td className="p-2 border-t border-slate-100 dark:border-slate-700 text-center"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${groupColor}`}>{r.group}</span></td><td className="p-2 border-t border-slate-100 dark:border-slate-700 text-right">{fmtCurrency(r.product.annualValue)}</td><td className="p-2 border-t border-slate-100 dark:border-slate-700 text-right">{r.cumulativePercent.toFixed(2)}%</td></tr>);
                    })}</tbody>
                </table></div>
            </div>}
        </div>
    );
};
