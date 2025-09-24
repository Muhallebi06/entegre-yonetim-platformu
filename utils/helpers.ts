
import { Order, Product, BOM, ImalatAsamaDetay, KapakType, RulmanType, ProductCategory } from './types';

export const formatNumber = (n: any): string => {
  if (n === null || n === undefined || n === '') return '-';
  const num = Number(n);
  if (isNaN(num)) return String(n);

  const options: Intl.NumberFormatOptions = {};
  if (num % 1 !== 0) {
    options.minimumFractionDigits = 2;
    options.maximumFractionDigits = 3;
  }

  return new Intl.NumberFormat('de-DE', options).format(num);
};

export const fmtCurrency = (n?: number): string => {
    const v = Number(n);
    return Number.isFinite(v) ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v) : '0,00 €';
};

export const parseDdMmYyyy = (str?: string): Date | null => {
  if (!str) return null;
  const m = String(str).match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (!m) return null;
  const dt = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return isNaN(dt.getTime()) ? null : dt;
};

export const parseAnyDate = (input?: string | Date): Date | null => {
    if (!input) return null;
    if (input instanceof Date) return input;
    let dt = parseDdMmYyyy(String(input).split(' ')[0]);
    if (dt) return dt;
    dt = new Date(input);
    return isNaN(dt.getTime()) ? null : dt;
};

export const formatDateTR = (input?: string | Date): string => {
  if (!input) return "";
  const dt = (input instanceof Date) ? input : parseAnyDate(input);
  if (!dt || isNaN(dt.getTime())) return "";
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
};

export const formatDateTimeTR = (input?: string | Date): string => {
    const dt = (input instanceof Date) ? input : new Date(input || '');
    if(!dt || isNaN(dt.getTime())) return "";
    return `${formatDateTR(dt)} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
};

export const atLocalMidnight = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());

export const parseLocaleNumber = (value: string | number | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
        return isNaN(value) ? null : value;
    }

    const str = String(value).trim();
    if (str === '') return null;
    
    // Assumes Turkish locale where ',' is decimal and '.' is thousands.
    // Also handles cases where '.' is used as a decimal separator if no comma is present.
    const hasComma = str.includes(',');
    
    let sanitizedStr = str;
    if (hasComma) {
        // If a comma exists, treat all dots as thousands separators.
        sanitizedStr = str.replace(/\./g, '').replace(',', '.');
    } else {
        // No comma. Check for "1.000" case vs "1.5"
        const lastDotIndex = str.lastIndexOf('.');
        // Check if there's a dot, it's not the first character, and what follows is 3 digits long.
        if (lastDotIndex > 0 && str.substring(lastDotIndex + 1).length === 3) {
             // It's likely a thousands separator, remove all dots.
             sanitizedStr = str.replace(/\./g, '');
        }
    }
    
    const num = parseFloat(sanitizedStr);
    return isNaN(num) ? null : num;
};

export const areNumbersEqual = (a: any, b: any): boolean => {
    const numA = parseLocaleNumber(a);
    const numB = parseLocaleNumber(b);
    if (numA === null && numB === null) return true;
    if (numA === null || numB === null) return false;
    return Math.abs(numA - numB) < 0.001;
};

export const findBestMatchingBom = (orderData: Partial<Order>, boms: BOM[]): BOM | undefined => {
    const bomMatches = (bom: BOM): boolean => {
        if (bom.musteriIds && bom.musteriIds.length > 0) {
            if (!orderData.musteriId || !bom.musteriIds.includes(orderData.musteriId)) {
                return false;
            }
        }
        if (bom.kw !== undefined && bom.kw !== null && bom.kw !== '' && !areNumbersEqual(bom.kw, orderData.kw)) return false;
        if (bom.rpm !== undefined && bom.rpm !== null && bom.rpm !== '' && !areNumbersEqual(bom.rpm, orderData.rpm)) return false;
        if (bom.volt !== undefined && bom.volt !== null && bom.volt !== '' && !areNumbersEqual(bom.volt, orderData.volt)) return false;
        if (bom.milKod && bom.milKod.trim() && bom.milKod.trim().toLowerCase() !== (orderData.milKod || '').trim().toLowerCase()) return false;
        if (bom.kapak && bom.kapak.trim() && bom.kapak.trim().toLowerCase() !== (orderData.kapak || '').trim().toLowerCase()) return false;
        return true;
    };
    
    const matchingBoms = boms.filter(bomMatches);
    // Prioritize customer-specific BOMs over generic ones
    return matchingBoms.find(b => b.musteriIds && b.musteriIds.length > 0) || matchingBoms[0];
};

export const calculateCommittedQuantities = (
    orders: Order[],
    boms: BOM[],
    excludeOrderId?: string
): { [productId: string]: number } => {
    const committed: { [productId: string]: number } = {};
    for (const order of orders) {
        if (excludeOrderId && order.id === excludeOrderId) continue;
        const orderBom = findBestMatchingBom(order, boms);
        if (orderBom) {
            for (const comp of orderBom.components) {
                committed[comp.productId] = (committed[comp.productId] || 0) + (order.adet * comp.quantity);
            }
        }
    }
    return committed;
};


export const calculateImalatDurumuForOrder = (
    orderData: Partial<Order>, 
    stockProducts: Product[],
    boms: BOM[],
    committedQuantities: { [productId: string]: number },
    selectedProduct?: Product,
): Record<string, ImalatAsamaDetay> => {
    
    const imalatDurumu: Record<string, ImalatAsamaDetay> = {
        bobinaj: { durum: 'bekliyor' },
        govdeImalat: { durum: 'bekliyor' },
        milIsleme: { durum: 'bekliyor' },
        rotorluMilIsleme: { durum: 'bekliyor' },
        rotorluMilTaslama: { durum: 'bekliyor' },
        kapakIsleme: { durum: 'bekliyor' },
        kapakTaslama: { durum: 'bekliyor' },
        montaj: { durum: 'bekliyor' },
    };

    if (orderData.kapak === 'AK') {
        imalatDurumu.kapakTaslama = { durum: 'hazir' };
    }

    let bestMatch: BOM | undefined;

    if (selectedProduct) {
        const candidateBoms = boms.filter(bom => bom.targetSku === selectedProduct.sku);
        bestMatch = candidateBoms.find(bom => bom.musteriIds && bom.musteriIds.includes(orderData.musteriId || ''));
        if (!bestMatch) {
            bestMatch = candidateBoms.find(bom => !bom.musteriIds || bom.musteriIds.length === 0);
        }
    } else {
        bestMatch = findBestMatchingBom(orderData, boms);
    }

    if (bestMatch) {
        const categoryToStageMap: Partial<Record<ProductCategory, string[]>> = {
            sargiliPaket: ['bobinaj'],
            paketliGovde: ['govdeImalat'],
            taslanmisMil: ['milIsleme', 'rotorluMilIsleme', 'rotorluMilTaslama'],
            islenmisKapak: ['kapakIsleme'],
            taslanmisKapak: ['kapakTaslama'],
        };
        
        bestMatch.components.forEach(component => {
            const productInStock = stockProducts.find(p => p.id === component.productId);
            if (!productInStock) return;

            const requiredQuantity = (orderData.adet || 1) * component.quantity;
            const committedQuantity = committedQuantities[component.productId] || 0;
            const availableStock = productInStock.qty - committedQuantity;
            
            if (availableStock >= requiredQuantity) {
                 const stagesToSkip = categoryToStageMap[productInStock.category];
                 if (stagesToSkip) {
                     stagesToSkip.forEach(stageKey => {
                         imalatDurumu[stageKey] = { durum: 'hazir' };
                     });
                 }
            }
        });
    }

    return imalatDurumu;
};
