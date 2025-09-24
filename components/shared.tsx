

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChartConfiguration, Chart } from 'chart.js';
import flatpickr from 'flatpickr';
import { Turkish } from 'flatpickr/dist/l10n/tr';
import { useUI, useAuth, useEditingState, Icon } from '../App';
import { formatNumber, parseLocaleNumber, parseDdMmYyyy, formatDateTR } from '../utils/helpers';

// Debounce hook to improve search performance
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
}

export const PaginationControls: React.FC<{
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}> = ({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }) => {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Fix: Define handlePrev and handleNext functions to handle pagination button clicks.
  const handlePrev = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  return (
    <div className="flex items-center justify-between mt-4 px-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">
            {totalItems} sonuçtan {startItem}-{endItem} arası gösteriliyor.
        </span>
        <div className="flex items-center gap-4">
             <span className="font-semibold text-slate-700 dark:text-slate-200">
                Sayfa {currentPage} / {totalPages}
            </span>
            <div className="flex items-center gap-2">
                <button 
                    onClick={handlePrev} 
                    disabled={currentPage === 1} 
                    className="px-3 py-1.5 rounded-lg border bg-white dark:bg-slate-700 dark:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Önceki
                </button>
                <button 
                    onClick={handleNext} 
                    disabled={currentPage === totalPages} 
                    className="px-3 py-1.5 rounded-lg border bg-white dark:bg-slate-700 dark:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Sonraki
                </button>
            </div>
      </div>
    </div>
  );
};

export const TabButton: React.FC<{ tabId: string, activeTab: string, onClick: () => void, children: React.ReactNode }> = 
({ tabId, activeTab, onClick, children }) => (
    <button 
        onClick={onClick}
        className={`px-3 py-2 rounded-xl border text-sm whitespace-nowrap transition-colors ${activeTab === tabId ? 'bg-white dark:bg-slate-700 font-medium shadow-sm border-slate-200 dark:border-slate-600' : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
    >
        {children}
    </button>
);

export const ChartWrapper: React.FC<{ chartId: string, config: ChartConfiguration, data: any[], containerClass?: string }> = ({ chartId, config, data, containerClass="" }) => {
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

export const DatePicker: React.FC<{ value?: string, onChange: (dateStr: string) => void, placeholder?: string, className?: string }> = ({ value, onChange, placeholder, className }) => {
    const ref = useRef<HTMLInputElement>(null);
    const fpRef = useRef<flatpickr.Instance | null>(null);
    const onChangeRef = useRef(onChange);

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        if (ref.current) {
            fpRef.current = flatpickr(ref.current, {
                dateFormat: "d/m/Y",
                locale: Turkish,
                onChange: (selectedDates, dateStr) => {
                    onChangeRef.current(dateStr);
                },
            });
        }
        return () => {
            fpRef.current?.destroy();
            fpRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (fpRef.current) {
            const newDate = value ? parseDdMmYyyy(value) : null;
            const currentSelectedDate = fpRef.current.selectedDates[0];
            if (newDate?.getTime() !== currentSelectedDate?.getTime()) {
                fpRef.current.setDate(newDate, false);
            }
        }
    }, [value]);
    
    return <input ref={ref} placeholder={placeholder} className={className} />;
};

export const DescriptionModal: React.FC<{ isOpen: boolean, onClose: () => void, initialValue?: string, onSave: (value: string) => void }> = 
({ isOpen, onClose, initialValue = '', onSave }) => {
    const [value, setValue] = useState(initialValue);
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        if (isOpen) {
            setValue(initialValue);
            dialogRef.current?.showModal();
        } else {
            dialogRef.current?.close();
        }
    }, [isOpen, initialValue]);

    const handleSave = () => {
      onSave(value);
      onClose();
    }

    return (
        <dialog ref={dialogRef} onClose={onClose} className="rounded-2xl p-0 w-[96vw] max-w-2xl backdrop:bg-black/50">
            {isOpen && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl">
                    <div className="px-4 py-3 border-b dark:border-slate-700 flex items-center justify-between"><h3 className="font-semibold text-slate-800 dark:text-slate-100">Açıklama</h3><button onClick={onClose} className="px-3 py-1 border dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">Kapat</button></div>
                    <div className="p-4"><textarea value={value} onChange={e => setValue(e.target.value)} className="w-full h-72 p-3 border dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900" placeholder="Açıklama yazın..."></textarea></div>
                    <div className="px-4 py-3 border-t dark:border-slate-700 flex gap-2 justify-end"><button onClick={handleSave} className="btn-brand px-4 py-2 rounded-xl">Kaydet</button></div>
                </div>
            )}
        </dialog>
    );
};

export const SortableHeader: React.FC<{ label: string, sortKey: string, currentSort: any, setSort: (s: any) => void, className?: string }> = ({ label, sortKey, currentSort, setSort, className="" }) => {
    const isSorted = currentSort?.key === sortKey;
    const direction = isSorted ? currentSort.direction : '';
    const handleClick = () => {
        const newDirection = isSorted && direction === 'asc' ? 'desc' : 'asc';
        setSort({ key: sortKey, direction: newDirection });
    };
    return (
        <th onClick={handleClick} className={`sortable ${direction} ${className}`}>
            {label}
            <span className="sort-indicator"></span>
        </th>
    );
};

export const EditableCell: React.FC<{
  recordId: string;
  value: any;
  onSave: (newValue: any) => void | Promise<void>;
  type?: 'text' | 'number' | 'date' | 'select';
  options?: { value: string; label: string }[];
  className?: string;
  disabled?: boolean;
}> = ({ recordId, value, onSave, type = 'text', options = [], className = "", disabled = false }) => {
    const { showToast } = useUI();
    const { editingRecord, setEditingRecord } = useEditingState();
    const { user } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [currentValue, setCurrentValue] = useState(value);
    const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
    const componentId = useMemo(() => `edit-${recordId}-${Math.random()}`, [recordId]);

    const handleStartEditing = () => {
        if (disabled || isSaving) return;
        const editorId = user?.username || componentId;
        const now = Date.now();
        const LOCK_TIMEOUT_MS = 15000; // 15 seconds

        if (editingRecord.recordId === recordId && editingRecord.editorId !== editorId) {
            const isLockStale = editingRecord.timestamp ? (now - editingRecord.timestamp > LOCK_TIMEOUT_MS) : false;
            
            if (!isLockStale) {
                const timeLeft = Math.round((LOCK_TIMEOUT_MS - (now - (editingRecord.timestamp || now))) / 1000);
                showToast(`Bu alan '${editingRecord.editorId}' tarafından düzenleniyor. Kilit ${timeLeft} saniye içinde açılacak.`, "error");
                return;
            }
            showToast(`'${editingRecord.editorId}' kullanıcısının kilidi zaman aşımına uğradı. Düzenleme devralındı.`, "success");
        }
        setIsEditing(true);
        setEditingRecord({ recordId, editorId, timestamp: now });
    };

    const handleStopEditing = () => {
        const editorId = user?.username || componentId;
        setIsEditing(false);
        if (editingRecord.recordId === recordId && editingRecord.editorId === editorId) {
            setEditingRecord({ recordId: null, editorId: null, timestamp: null });
        }
    };

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);
    
    useEffect(() => {
        setCurrentValue(value);
    }, [value]);

    const handleSave = async () => {
        let processedValue = currentValue;
        if (type === 'number') {
            const numValue = parseLocaleNumber(currentValue);
            if (String(currentValue).trim() !== '' && (numValue === null || numValue < 0)) {
                showToast("Lütfen geçerli pozitif bir sayı girin.", "error");
                setCurrentValue(value);
                handleStopEditing();
                return;
            }
            processedValue = numValue;
        }

        if (processedValue === value) {
            handleStopEditing();
            return;
        }

        setIsSaving(true);
        try {
            await onSave(processedValue);
        } catch (error) {
            console.error("EditableCell save failed:", error);
            setCurrentValue(value);
        } finally {
            setIsSaving(false);
            handleStopEditing();
        }
    };

    const handleCancel = () => {
        setCurrentValue(value);
        handleStopEditing();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') handleCancel();
    };
    
    const handleDateChange = async (dateStr: string) => {
        setIsSaving(true);
        try {
            await onSave(dateStr);
        } finally {
            setIsSaving(false);
            handleStopEditing();
        }
    }
    
    if (isEditing) {
        if (type === 'date') {
            return <DatePicker value={formatDateTR(String(value ?? ''))} onChange={handleDateChange} placeholder="gg/aa/yyyy" className="w-full px-1 py-0.5 border rounded-md bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600" />;
        }

        const inputClass = "w-full pl-1 pr-20 py-0.5 border rounded-md bg-white dark:bg-slate-900 border-orange-400 dark:border-orange-500 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100 dark:disabled:bg-slate-800";
        
        let inputElement;
        switch (type) {
            case 'select':
                inputElement = <select ref={inputRef as React.RefObject<HTMLSelectElement>} value={currentValue || ''} onChange={e => setCurrentValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleCancel} className={inputClass} disabled={isSaving}>
                    {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>;
                break;
            default:
                inputElement = <input ref={inputRef as React.RefObject<HTMLInputElement>} type={'text'} value={currentValue ?? ''} onChange={e => setCurrentValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSave} className={inputClass} disabled={isSaving}/>;
                break;
        }

        return (
            <div className="relative">
                {inputElement}
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center bg-white dark:bg-slate-900 h-[calc(100%-4px)] rounded-r-md">
                   {isSaving ? (
                        <Icon name="loader-2" size={16} className="animate-spin text-slate-500 mx-2" />
                    ) : (
                        <>
                            <button onClick={handleSave} className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-md" title="Kaydet (Enter)"><Icon name="check" size={16} /></button>
                            <button onClick={handleCancel} className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-md" title="İptal (Esc)"><Icon name="x" size={16} /></button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    let displayValue: React.ReactNode = value;
    if (type === 'select') displayValue = options.find(o => o.value === value)?.label || value;
    if (type === 'date') displayValue = formatDateTR(String(value ?? ''));
    if (type === 'number') {
        const valueToParse = (typeof value === 'string' || typeof value === 'number') ? String(value) : "";
        displayValue = formatNumber(parseLocaleNumber(valueToParse));
    }
    
    return (
        <div onClick={handleStartEditing} className={`group relative w-full block min-h-[28px] p-1 rounded-md ${!disabled ? 'cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-700/50 hover:border hover:border-dashed hover:border-slate-400 dark:hover:border-slate-500 hover:-m-px' : ''} ${className}`}>
            {displayValue || <i className="text-slate-400 dark:text-slate-500"> boş </i>}
            {!disabled && <Icon name="pencil" size={12} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />}
        </div>
    );
};