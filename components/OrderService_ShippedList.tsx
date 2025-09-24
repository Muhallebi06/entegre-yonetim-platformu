import React, { useState, useMemo } from 'react';
import { ShippedOrder, ShippedServiceRecord } from '../types';
import { formatDateTR, formatDateTimeTR } from '../utils/helpers';
import { useAuth } from '../App';
import { TabButton } from './shared';

export const ShippedList: React.FC<{
    shippedOrders: ShippedOrder[];
    shippedServices: ShippedServiceRecord[];
    getContactNameById: (id: string) => string;
    onUndoOrderShip: (id: string) => void;
    onUndoServiceShip: (id: string) => void;
}> = ({ shippedOrders, shippedServices, getContactNameById, onUndoOrderShip, onUndoServiceShip }) => {
    const [activeList, setActiveList] = useState<'orders' | 'services'>('orders');
    const { checkPermission } = useAuth();

    const items = useMemo(() => {
        return activeList === 'orders' ? shippedOrders : shippedServices;
    }, [activeList, shippedOrders, shippedServices]);

    return (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
            <div className="flex justify-between items-center mb-3">
                 <div className="bg-slate-100 dark:bg-slate-7