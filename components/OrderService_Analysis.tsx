import React, { useMemo, useState, useRef } from 'react';
import { ChartConfiguration } from 'chart.js';
import { Order, ShippedOrder, ServiceRecord, ShippedServiceRecord, Company } from '../types';
import { parseAnyDate, formatDateTR } from '../utils/helpers';
import { ChartWrapper } from './shared';

export const Analysis: React.FC<{
    orders: Order[];
    shippedOrders: ShippedOrder[];
    servisKayitlari: ServiceRecord[];
    shippedServiceRecords: ShippedServiceRecord[];
    customers: Company[];
}> = ({ orders, shippedOrders, servisKayitlari, shippedServiceRecords, customers }) => {
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const chartColors = ['#f97316', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];

    const customerConsumptionData = useMemo(() => {
        if (!selectedCustomerId) return [];
        const customerOrders = [...orders, ...shippedOrders].filter(o => o.musteriId === selectedCustomerId);
        if (customerOrders.length < 2) return [];

        const productIntervals: { [key: string]: number[] } = {};
        customerOrders.sort((a, b) => (parseAnyDate(a.eklenmeTarihi)?.getTime() || 0) - (parseAnyDate(b.eklenmeTarihi)?.getTime() || 0));

        customerOrders.forEach(order => {
            const orderDate = parseAnyDate(order.eklenmeTarihi);
            if (!orderDate) return;

            const existingIntervals = productIntervals[order.urun] || [];
            if (existingIntervals.length > 0) {
                const lastDate = new Date(existingIntervals[existingIntervals.length - 1]);
                const diffDays = (orderDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24);
                existingIntervals.push(diffDays);
            }
            productIntervals[order.urun] = [...existingIntervals, orderDate.getTime()];
        });

        const predictions = Object.entries(productIntervals)
            .map(([urun, datesAndIntervals]) => {
                const intervals = datesAndIntervals.slice(1);
                if (intervals.length < 1) return null;
                const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const lastOrderDate = new Date(datesAndIntervals[0]);
                const nextOrderDate = new Date(lastOrderDate.getTime() + avgInterval * (1000 * 3600 * 24));
                return { urun, nextOrderDate };
            })
            .filter(Boolean)
            .sort((a, b) => a!.nextOrderDate.getTime() - b!.nextOrderDate.getTime());

        return predictions as { urun: string; nextOrderDate: Date }[];
    }, [selectedCustomerId, orders, shippedOrders]);
    
    const topCustomersData = useMemo(() => {
        const customerCounts: { [id: string]: number } = {};
        [...orders, ...shippedOrders].forEach(o => {
            customerCounts[o.musteriId] = (customerCounts[o.musteriId] || 0) + 1;
        });
        const sorted = Object.entries(customerCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        return {
            labels: sorted.map(([id]) => customers.find(c => c.id === id)?.name || 'Bilinmeyen'),
            datasets: [{ label: 'Sipariş Sayısı', data: sorted.map(([, count]) => count), backgroundColor: chartColors }],
        };
    }, [orders, shippedOrders, customers]);

    const topProductsData = useMemo(() => {
        const productCounts: { [name: string]: number } = {};
        [...orders, ...shippedOrders].forEach(o => {
            productCounts[o.urun] = (productCounts[o.urun] || 0) + o.adet;
        });
        const sorted = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        return {
            labels: sorted.map(([name]) => name),
            datasets: [{ label: 'Sipariş Adedi', data: sorted.map(([, count]) => count), backgroundColor: chartColors }],
        };
    }, [orders, shippedOrders]);

    const terminPerformanceData = useMemo(() => {
        let onTime = 0, late = 0;
        shippedOrders.forEach(o => {
            const planned = parseAnyDate(o.sevkTarihi);
            const actual = parseAnyDate(o.sevkEdildi);
            if(planned && actual) {
                if (actual <= planned) onTime++; else late++;
            }
        });
        return { labels: ['Zamanında', 'Geç'], datasets: [{ data: [onTime, late], backgroundColor: ['#22c55e', '#ef4444'] }] };
    }, [shippedOrders]);

    const chartOptions: ChartConfiguration['options'] = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="md:col-span-2 lg:col-span-3 bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
                <h3 className="font-semibold mb-3 dark:text-slate-100">Müşteri Bazında Tüketim Tahminlemesi</h3>
                <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} className="w-full max-w-md px-3 py-2 rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 mb-4">
                    <option value="">-- Müşteri Seçin --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {selectedCustomerId && (
                    <div className="overflow-auto max-h-80">
                        {customerConsumptionData.length > 0 ? (
                            <ul className="space-y-2">{customerConsumptionData.map((p, i) => (
                                <li key={i} className="text-sm p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg flex justify-between"><span>{p.urun}</span><span className="font-semibold">{formatDateTR(p.nextOrderDate)}</span></li>
                            ))}</ul>
                        ) : <p className="text-sm text-slate-500">Tahminleme için yeterli veri yok.</p>}
                    </div>
                )}
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow"><h3 className="font-semibold mb-3 dark:text-slate-100">En Çok Sipariş Veren Müşteriler</h3><ChartWrapper chartId="topCustomers" config={{ type: 'bar', data: topCustomersData, options: chartOptions }} data={topCustomersData.datasets[0].data} containerClass="h-64" /></div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow"><h3 className="font-semibold mb-3 dark:text-slate-100">En Çok Sipariş Edilen Ürünler</h3><ChartWrapper chartId="topProducts" config={{ type: 'bar', data: topProductsData, options: chartOptions }} data={topProductsData.datasets[0].data} containerClass="h-64" /></div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow"><h3 className="font-semibold mb-3 dark:text-slate-100">Termin Performansı</h3><ChartWrapper chartId="terminPerformance" config={{ type: 'doughnut', data: terminPerformanceData, options: { ...chartOptions, plugins: { legend: { display: true, position: 'bottom' } } } }} data={terminPerformanceData.datasets[0].data} containerClass="h-64" /></div>
        </div>
    );
};
