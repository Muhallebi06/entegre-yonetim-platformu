
import React, { useMemo, useRef, useEffect } from 'react';
import { useData } from '../App';
import { Order, Product, ShippedOrder } from '../types';
import { Chart, registerables } from 'chart.js';
import { formatNumber, parseAnyDate } from '../utils/helpers';

Chart.register(...registerables);

const DashboardCard: React.FC<{ icon: string; value: number | string; label: string; color: string; }> = ({ icon, value, label, color }) => (
    <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow border border-slate-200 dark:border-slate-700 flex items-start gap-4">
        <div className={`bg-${color}-100 text-${color}-600 rounded-full p-3 grid place-items-center w-12 h-12 text-xl dark:bg-${color}-900/50 dark:text-${color}-300`}>
            {icon}
        </div>
        <div>
            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{formatNumber(value)}</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        </div>
    </div>
);

const Dashboard: React.FC = () => {
    const { dataStore } = useData();
    const terminChartRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<Chart | null>(null);
    
    const stats = useMemo(() => {
        const orders = dataStore.siparisler || [];
        const products = dataStore['stokTakip-v1']?.products || [];
        const sevkEdilenler = dataStore.sevkEdilenler || [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(today.getDate() + 7);

        const terminYaklasan: Order[] = [];
        const terminGecmis: Order[] = [];
        let aktifSiparis = 0;

        orders.forEach(o => {
            if (!o.sevkeHazir) {
                aktifSiparis++;
                const dueDate = parseAnyDate(o.sevkTarihi);
                if (dueDate) {
                    dueDate.setHours(0, 0, 0, 0);
                    if (dueDate < today) terminGecmis.push(o);
                    else if (dueDate <= sevenDaysFromNow) terminYaklasan.push(o);
                }
            }
        });

        const kritikStok = products.filter(p => p.qty < (p.min ?? 0));

        const allOrdersForNewCount: (Order | ShippedOrder)[] = [...orders, ...sevkEdilenler];
        const yeniSiparisBugun = allOrdersForNewCount.filter(o => {
            const eklenme = parseAnyDate(o.eklenmeTarihi);
            return eklenme && eklenme.setHours(0,0,0,0) === today.getTime();
        }).length;

        const sevkEdilenBugun = sevkEdilenler.filter(s => {
            const sevk = parseAnyDate(s.sevkEdildi);
            return sevk && sevk.setHours(0,0,0,0) === today.getTime();
        }).length;
        
        let terminZamaninda = 0;
        let terminGec = 0;
        sevkEdilenler.forEach(o => {
            const plan = parseAnyDate(o.sevkTarihi);
            const actual = parseAnyDate(o.sevkEdildi);
            if (plan && actual) {
                plan.setHours(0, 0, 0, 0);
                actual.setHours(0, 0, 0, 0);
                if (actual.getTime() <= plan.getTime()) terminZamaninda++;
                else terminGec++;
            }
        });

        return {
            aktifSiparis,
            terminYaklasan,
            terminGecmis,
            kritikStok,
            yeniSiparisBugun,
            sevkEdilenBugun,
            terminZamaninda,
            terminGec,
        };
    }, [dataStore]);
    
    useEffect(() => {
        if (!terminChartRef.current) return;
        const total = stats.terminZamaninda + stats.terminGec;
        const getPercentage = (value: number) => total > 0 ? ((value / total) * 100).toFixed(0) : 0;
        const labels = [`Zamanında (%${getPercentage(stats.terminZamaninda)})`, `Geç (%${getPercentage(stats.terminGec)})`];
        const data = [stats.terminZamaninda, stats.terminGec];
        
        if (chartInstanceRef.current) {
            // Update existing chart
            chartInstanceRef.current.data.labels = labels;
            chartInstanceRef.current.data.datasets[0].data = data;
            chartInstanceRef.current.update();
        } else if (total > 0) {
            // Create new chart if it doesn't exist and there's data
            const textColor = document.documentElement.classList.contains('dark') ? 'rgb(203 213 225)' : 'rgb(51 65 85)';
            const borderColor = document.documentElement.classList.contains('dark') ? 'rgb(30 41 59)' : 'rgb(255 255 255)';

            chartInstanceRef.current = new Chart(terminChartRef.current, {
                type: 'doughnut',
                data: { labels, datasets: [{ data, backgroundColor: ['#22c55e', '#ef4444'], borderColor: borderColor, borderWidth: 4 }] },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: { position: 'bottom', labels: { color: textColor } },
                        tooltip: { callbacks: { label: (c) => `${c.label}: ${formatNumber(c.raw)} sipariş` } }
                    }
                }
            });
        }
        
        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
                chartInstanceRef.current = null;
            }
        };
    }, [stats.terminZamaninda, stats.terminGec]);
    
    const getContactNameById = (id: string) => {
        const contact = (dataStore.contacts || []).find(c => c.id === id);
        return contact ? contact.name : `<span class="italic text-slate-400">Bilinmeyen Firma</span>`;
    };

    return (
        <div className="p-4 md:p-6">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4">Ana Panel</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                <DashboardCard icon="📦" value={stats.aktifSiparis} label="Aktif Sipariş" color="blue" />
                <DashboardCard icon="🕒" value={stats.terminYaklasan.length} label="Termini Yaklaşan (7 gün)" color="yellow" />
                <DashboardCard icon="⚠️" value={stats.terminGecmis.length} label="Termini Geçmiş Sipariş" color="red" />
                <DashboardCard icon="🗄️" value={stats.kritikStok.length} label="Kritik Seviyedeki Stok" color="orange" />
                <DashboardCard icon="✨" value={stats.yeniSiparisBugun} label="Yeni Sipariş (Bugün)" color="green" />
                <DashboardCard icon="🚚" value={stats.sevkEdilenBugun} label="Sevk Edilen (Bugün)" color="indigo" />
            </div>
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow border border-slate-200 dark:border-slate-700 lg:col-span-1">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 text-center">Genel Termin Performansı</h3>
                    <div className="relative h-64">
                         {(stats.terminZamaninda + stats.terminGec > 0) ? (
                            <canvas ref={terminChartRef}></canvas>
                         ) : (
                            <div className="chart-placeholder h-full">Sevk edilmiş sipariş verisi yok.</div>
                         )}
                    </div>
                </div>
                 <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow border border-slate-200 dark:border-slate-700 lg:col-span-1">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Yaklaşan Terminler</h3>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {stats.terminYaklasan.length > 0 ? (
                            stats.terminYaklasan
                                .sort((a, b) => (parseAnyDate(a.sevkTarihi)?.getTime() || 0) - (parseAnyDate(b.sevkTarihi)?.getTime() || 0))
                                .map(o => (
                                    <div key={o.id} className="text-sm p-2 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                        <div>
                                            <span className="font-semibold">{o.no}</span> - <span dangerouslySetInnerHTML={{ __html: getContactNameById(o.musteriId) }}></span>
                                        </div>
                                        <div className="text-xs font-medium text-white px-2 py-1 rounded-full bg-yellow-500">{o.sevkTarihi}</div>
                                    </div>
                                ))
                        ) : (
                            <p className="text-sm text-slate-400 text-center py-4">Yaklaşan sipariş bulunmuyor.</p>
                        )}
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow border border-slate-200 dark:border-slate-700 lg:col-span-1">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Kritik Stok Seviyesindeki Ürünler</h3>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {stats.kritikStok.length > 0 ? (
                            stats.kritikStok.map(p => (
                                <div key={p.id} className="text-sm p-2 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                    <div>
                                        <span className="font-semibold">{p.name}</span> <span className="text-slate-500">({p.sku})</span>
                                    </div>
                                    <div className="text-xs font-medium text-white px-2 py-1 rounded-full bg-red-500">Stok: {formatNumber(p.qty)} / Min: {formatNumber(p.min)}</div>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-400 text-center py-4">Kritik seviyede ürün bulunmuyor.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
