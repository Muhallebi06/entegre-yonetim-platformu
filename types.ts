

export type UserRole = 'admin' | 'user';

export interface User {
  username: string;
  role: UserRole;
}

export interface AppUser {
  id: string;
  username: string;
  pass: string; // base64 encoded
  role: UserRole;
}

export interface Company {
  id: string;
  type: 'customer' | 'supplier';
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export type KapakType = 'AK' | 'CK';
export type RulmanType = '1R' | '2R' | 'CR';

export type ImalatAsamaDurum = 'bekliyor' | 'imalatta' | 'hazir';

export interface ImalatAsamaDetay {
  durum: ImalatAsamaDurum;
  atananKullanici?: string;
  termin?: string;
  baslamaTarihi?: string;
  tamamlanmaTarihi?: string; // ISO date string
}

export interface Order {
  id: string;
  no: string;
  musteriId: string;
  urun: string;
  adet: number;
  milKod: string;
  kapak?: KapakType | string;
  rulman?: RulmanType | string;
  kw?: number | string;
  rpm?: number | string;
  volt?: number | string;
  sevkTarihi?: string;
  aciklama?: string;
  hazir: boolean;
  sevkeHazir: boolean;
  eklenmeTarihi?: string;
  isCancelled?: boolean;
  imalatDurumu?: Record<string, ImalatAsamaDetay>;
}

export interface WorkOrder {
  id: string;
  no: string; // e.g., ISE-2405-001
  productId: string; // from Product list
  quantity: number;
  status: 'beklemede' | 'imalatta' | 'tamamlandi'; // overall status
  dueDate?: string;
  createdAt: string; // ISO date
  imalatDurumu: Record<string, ImalatAsamaDetay>;
}

export interface ShippedOrder extends Order {
  sevkEdildi: string; // ISO date string
  kullanici: string;
}

export interface ServiceRecord {
  id: string;
  no: string;
  musteriId:string;
  urun: string;
  adet?: number | string;
  ariza?: string;
  milTipi?: string;
  durum?: string;
  not?: string;
  iletisim?: string;
  kargoTipi?: string;
  sevkTarihi?: string;
  aciklama?: string;
}

export interface ShippedServiceRecord extends ServiceRecord {
  sevkEdildi: string; // ISO date string
  kullanici: string;
}

export interface OrderLog {
  no: string;
  islem: string;
  user: string;
  tarih: string; // ISO date string
}

export type ProductCategory =
  | 'stator' | 'rotor' | 'mil' | 'rotorluMil' | 'taslanmisMil'
  | 'sargiliPaket' | 'paketliGovde' | 'motor' | 'bakir_tel'
  | 'yardimci_parcalar' | 'aluminyum_govde' | 'rulman' | 'kapak'
  | 'islenmisKapak' | 'taslanmisKapak';

export type ProductKind = 'mamul' | 'yari' | 'ham';

export interface Product {
  id: string;
  sku: string;
  name: string;
  kind: ProductKind;
  category: ProductCategory;
  unit?: string;
  qty: number;
  min?: number;
  cost?: number;
  supplierId?: string;
  note?: string;
  
  // sargiliPaket
  kw?: number;
  rpm?: number;
  volt?: number;
  
  // paketliGovde
  pg_rpm?: number;
  pg_kw?: number;
  pg_volt?: number;
  pg_customerId?: string;
  pg_conn?: 'soketli' | 'duz' | 'ters' | 'ykr' | 'ykl';
  pg_klemensYonu?: 'ustten' | 'alttan';
  pg_montajDeligi?: 'duz' | 'ters';
  pg_baglantiTipi?: 'klemensli' | 'soketli';

  // mil
  milCode?: string;
  customerId?: string;

  // motor
  m_customerId?: string;
  m_rpm?: number;
  m_kw?: number;
  m_volt?: number;
  m_conn?: 'soketli' | 'duz' | 'ters' | 'ykr' | 'ykl';
  milType?: string;
  m_cover?: KapakType;
  m_rulman?: RulmanType;
  m_klemensYonu?: 'ustten' | 'alttan';
  m_montajDeligi?: 'duz' | 'ters';
  m_baglantiTipi?: 'klemensli' | 'soketli';
  m_milProductId?: string; // ID of a taslanmisMil product
}

export interface InventoryLog {
  id: string;
  ts: string; // ISO date string
  user: string;
  productId: string;
  type: 'in' | 'out' | 'adjustment' | 'new' | 'edit' | 'delete';
  amount?: number;
  fromQty?: number;
  toQty?: number;
  note?: string;
}

export interface BOMComponent {
  productId: string; // id of the product from inventory
  quantity: number;
}

export interface BOM {
  id: string;
  name: string; // e.g., "HMA 56 B4 Motor"
  targetSku: string; // SKU for the final product this BOM builds
  
  // Fields for matching with an Order
  musteriIds?: string[]; // New: list of customer IDs this BOM applies to
  kw?: number | string;
  rpm?: number | string;
  volt?: number | string;
  milKod?: string;
  kapak?: KapakType | string;
  pg_klemensYonu?: 'ustten' | 'alttan';
  pg_montajDeligi?: 'duz' | 'ters';
  pg_baglantiTipi?: 'klemensli' | 'soketli';

  components: BOMComponent[];
}

export interface StokTakipData {
    products: Product[];
    logs: InventoryLog[];
}

export interface DataStore {
    users?: AppUser[];
    contacts?: Company[];
    siparisler?: Order[];
    siparisLog?: OrderLog[];
    sevkEdilenler?: ShippedOrder[];
    servisKayitlari?: ServiceRecord[];
    servisSevkEdilenler?: ShippedServiceRecord[];
    'stokTakip-v1'?: StokTakipData;
    boms?: BOM[];
    workOrders?: WorkOrder[];
    // For migration
    musteriler?: any[];
}