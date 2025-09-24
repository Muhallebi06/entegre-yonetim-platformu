
// Fix: The project uses Firebase v12, but the code was written with the older v8 namespaced API.
// The original imports ('firebase/app') point to the new modular API which doesn't have a default export, causing a syntax error.
// The imports have been updated to use the v9+ compatibility libraries ('firebase/compat/*') to bridge the gap and allow the v8-style code to work.
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';
import { Company, Order, OrderLog, ShippedOrder, ServiceRecord, ShippedServiceRecord, Product, InventoryLog, BOM, WorkOrder, AppUser, DataStore, StokTakipData } from '../types';
import { USERS } from '../constants';


const firebaseConfig = {
    apiKey: "AIzaSyAyx_HVYwckqw2bYl_sdu57XPUP_tdDsxA",
    authDomain: "hertz-stok-takip.firebaseapp.com",
    databaseURL: "https://hertz-stok-takip-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "hertz-stok-takip",
    storageBucket: "hertz-stok-takip.appspot.com",
    messagingSenderId: "512663727455",
    appId: "1:512663727455:web:99e15a20f7ae9b77a39aea",
};

const CLIENT_ID = 'client-' + Math.random().toString(36).slice(2);

// --- Robust, singleton initialization of Firebase ---
type Database = firebase.database.Database;
let dbInstance: Database | undefined;

function getDb(): Database {
    if (dbInstance) {
        return dbInstance;
    }

    try {
        const app = firebase.apps.length === 0 ? firebase.initializeApp(firebaseConfig) : firebase.app();
        // Fix: The compat version of `firebase.database()` only takes an optional app instance.
        // The databaseURL is already part of the firebaseConfig used to initialize the app.
        dbInstance = firebase.database(app);
        return dbInstance;
    } catch (error) {
        console.error("Firebase initialization failed:", error);
        // Reset instance on failure to allow retries on subsequent calls
        dbInstance = undefined;
        throw new Error("Veritabanı bağlantısı kurulamadı. Lütfen internet bağlantınızı kontrol edin ve sayfayı yenileyin.");
    }
}


const LAZY_KEYS: (keyof DataStore)[] = ["siparisler", "sevkEdilenler", "servisKayitlari", "servisSevkEdilenler", "stokTakip-v1", "boms", "workOrders", "siparisLog"];
const ESSENTIAL_KEYS: (keyof DataStore)[] = ["users", "contacts"];

const ensureArray = (data: any): any[] => {
    if (Array.isArray(data)) return data.filter(Boolean);
    if (data && typeof data === 'object') return Object.values(data).filter(Boolean);
    return [];
};

// Renamed from pushData to setData to reflect its "overwrite" nature. Used for imports.
const setData = async (key: keyof DataStore, data: any): Promise<void> => {
    const database = getDb();
    const payload = {
        value: data,
        updatedAt: Date.now(),
        user: sessionStorage.getItem("auth_user") || "unknown",
        updatedBy: CLIENT_ID,
    };
    await database.ref(`ls/${encodeURIComponent(key)}`).set(payload);
};


export const fetchInitialData = async (): Promise<DataStore> => {
    const database = getDb(); // This can throw, which is caught by App.tsx
    let dataStore: DataStore = {};
    
    const loadPromises = ESSENTIAL_KEYS.map(key =>
        database.ref(`ls/${encodeURIComponent(key)}`).get().then(snap => {
            if (snap.exists()) {
                (dataStore as any)[key] = ensureArray(snap.val().value);
            } else {
                (dataStore as any)[key] = [];
            }
        }).catch(error => {
            console.error(`Firebase fetch failed for essential key ${key}:`, error);
        })
    );
    await Promise.all(loadPromises);
    
    // Check for and run user migration from constants.ts if no users exist in DB
    if (!dataStore.users || dataStore.users.length === 0) {
        console.log("Running user data migration from constants...");
        const migratedUsers: AppUser[] = Object.entries(USERS).map(([username, details]) => ({
            id: crypto.randomUUID(),
            username: username.toLowerCase(),
            pass: details.pass, // It's already base64
            role: details.role,
        }));
        
        await setData('users', migratedUsers);
        dataStore.users = migratedUsers;
        console.log("User migration complete.");
    }
    
    return dataStore;
};

// New function to fetch data for a specific module on demand
export const fetchModuleData = async <T,>(key: keyof DataStore): Promise<T> => {
    const database = getDb();
    try {
        const snap = await database.ref(`ls/${encodeURIComponent(key)}`).get();
        if (snap.exists()) {
            const remoteData = snap.val().value;
            if (key === 'stokTakip-v1') {
                // For StokTakip, we exclude logs as they will be paginated separately.
                const value = remoteData || { products: [], logs: [] };
                return { ...value, logs: [] } as T;
            }
            // Fix: This block prevented order logs from being loaded. It has been removed to allow the log list component to display data.
            // if(key === 'siparisLog') {
            //      return [] as T; // Logs are handled by fetchPaginatedData
            // }
            return ensureArray(remoteData) as T;
        }
        // Return default empty state if not found in DB
        if (key === 'stokTakip-v1') {
            return { products: [], logs: [] } as T;
        }
        return [] as T;
    } catch (error) {
        console.error(`Failed to fetch module data for key '${key}':`, error);
        throw new Error(`'${key}' verileri yüklenemedi.`);
    }
};

export const fetchPaginatedData = async (
    path: string, 
    limit: number, 
    startAfterIndex?: number
): Promise<{ items: any[], hasMore: boolean }> => {
    const database = getDb();
    let query = database.ref(path).orderByKey().limitToFirst(limit + 1);
    if(startAfterIndex !== undefined) {
        query = query.startAt(String(startAfterIndex));
    }

    try {
        const snap = await query.get();
        if (snap.exists()) {
            const items = ensureArray(snap.val());
            const hasMore = items.length > limit;
            if (hasMore) {
                items.pop(); // Remove the extra item used for 'hasMore' check
            }
            return { items, hasMore };
        }
        return { items: [], hasMore: false };
    } catch (error) {
        console.error(`Failed to fetch paginated data from path '${path}':`, error);
        throw new Error(`Veriler yüklenemedi.`);
    }
};


// New function to listen for updates on a specific module's data
export const listenOnModuleData = (key: keyof DataStore, callback: (value: any) => void) => {
    try {
        const database = getDb();
        const ref = database.ref(`ls/${encodeURIComponent(key)}`);
        
        ref.on('value', (snap) => {
            const data = snap.val();
            if (!data || data.updatedBy === CLIENT_ID) return;
            
            // Fix: This block prevented real-time updates for order logs. It has been removed.
            // if (key === 'siparisLog') return; // Logs are handled separately now
            
            const value = key === 'stokTakip-v1' 
                ? (data.value || {products: [], logs:[]}) 
                : ensureArray(data.value);

            if(key === 'stokTakip-v1') {
                value.logs = []; // Don't push all logs through listener
            }

            callback(value);
        });

        // Return a function to unsubscribe
        return () => ref.off('value');
    } catch(e) {
        console.error(`Firebase listener for '${key}' could not be set up.`, e);
        return () => {}; // Return a no-op unsubscribe function
    }
};

// New transactional pushData to ensure atomic updates and prevent race conditions.
export const pushData = async <T,>(key: keyof DataStore, updater: (prev: T) => T): Promise<void> => {
    const database = getDb();
    const ref = database.ref(`ls/${encodeURIComponent(key)}`);

    try {
        // Fix: Update transaction payload type to include all properties.
        const { committed } = await ref.transaction((currentPayload: { value: T; updatedAt: number; user: string; updatedBy: string; } | null) => {
            // Handle the case where the node doesn't exist yet. Provide a sensible default.
            const defaultValue = key === 'stokTakip-v1' ? { products: [], logs: [] } : [];
            const currentValue = currentPayload?.value ?? defaultValue;
            
            // Execute the provided updater function to get the new state.
            const newValue = updater(currentValue as T);
            
            // The Firebase SDK is smart enough to abort the transaction if we return `undefined`.
            if (newValue === currentValue) {
                return; // Abort transaction if data is unchanged.
            }
            
            // Wrap the new value in our standard payload structure.
            return {
                value: newValue,
                updatedAt: Date.now(),
                user: sessionStorage.getItem("auth_user") || "unknown",
                updatedBy: CLIENT_ID,
            };
        });

        if (!committed) {
            console.log(`Transaction for key '${key}' was aborted (likely no changes were made).`);
        }
    } catch (error) {
        console.error(`Firebase transaction for key '${key}' failed:`, error);
        // Re-throw the error so the calling function in App.tsx can handle it (e.g., show a toast and roll back state).
        throw error;
    }
};

// For performing atomic multi-path updates
type Updaters = {
    [K in keyof DataStore]?: (prev: DataStore[K]) => DataStore[K];
}

export const pushAtomicData = async (updaters: Updaters): Promise<void> => {
    const database = getDb();
    const ref = database.ref('ls'); // transaction on the parent node 'ls'

    try {
        // Fix: Update transaction payload type to include all properties for each key.
        const { committed } = await ref.transaction((currentLSData: { [key: string]: { value: any; updatedAt: number; user: string; updatedBy: string; } } | null) => {
            if (currentLSData === null) {
                // If the 'ls' node doesn't exist, we can't proceed. Should not happen.
                console.error("Root 'ls' node is null, aborting transaction.");
                return; 
            }
            
            const newLSData = { ...currentLSData };
            let hasChanges = false;
            
            for (const key of Object.keys(updaters)) {
                const dataStoreKey = key as keyof DataStore;
                const updater = updaters[dataStoreKey];
                if (!updater) continue;

                const defaultValues: { [key in keyof DataStore]?: any } = {
                    'stokTakip-v1': { products: [], logs: [] },
                    'users': [], 'contacts': [], 'siparisler': [], 'siparisLog': [], 'sevkEdilenler': [],
                    'servisKayitlari': [], 'servisSevkEdilenler': [], 'boms': [], 'workOrders': []
                };

                const currentPayload = currentLSData[dataStoreKey];
                const currentValue = currentPayload?.value ?? defaultValues[dataStoreKey];
                
                const newValue = updater(currentValue as any);

                if (newValue !== currentValue) {
                    hasChanges = true;
                    newLSData[dataStoreKey] = {
                        value: newValue,
                        updatedAt: Date.now(),
                        user: sessionStorage.getItem("auth_user") || "unknown",
                        updatedBy: CLIENT_ID,
                    };
                }
            }

            if (!hasChanges) {
                return; // Abort transaction if no changes
            }

            return newLSData;
        });

        if (!committed) {
            console.log(`Atomic transaction was aborted (likely no changes were made).`);
        }
    } catch (error) {
        console.error(`Firebase atomic transaction failed:`, error);
        throw error;
    }
};


// Reusable file downloader
const downloadJsonFile = (data: any, fileName: string) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
};

// --- Module-specific Data Management ---

// Sipariş & Servis
export const exportSiparisServisData = (data: DataStore) => {
    const moduleData = {
        backupDate: new Date().toISOString(),
        siparisler: data.siparisler || [],
        siparisLog: data.siparisLog || [],
        sevkEdilenler: data.sevkEdilenler || [],
        servisKayitlari: data.servisKayitlari || [],
        servisSevkEdilenler: data.servisSevkEdilenler || []
    };
    downloadJsonFile(moduleData, `hertz_motor_siparis_servis_yedek_${new Date().toISOString().slice(0,10)}.json`);
};

export const importSiparisServisData = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const data = JSON.parse(reader.result as string);
                const keys = ['siparisler', 'siparisLog', 'sevkEdilenler', 'servisKayitlari', 'servisSevkEdilenler'];
                if (!keys.every(k => data.hasOwnProperty(k))) return reject(new Error("Geçersiz Sipariş/Servis yedek dosyası."));
                
                await Promise.all([
                    setData('siparisler', ensureArray(data.siparisler)),
                    setData('siparisLog', ensureArray(data.siparisLog)),
                    setData('sevkEdilenler', ensureArray(data.sevkEdilenler)),
                    setData('servisKayitlari', ensureArray(data.servisKayitlari)),
                    setData('servisSevkEdilenler', ensureArray(data.servisSevkEdilenler)),
                ]);
                resolve();
            } catch (err: any) { reject(new Error("Dosya okunamadı: " + err.message)); }
        };
        reader.readAsText(file);
    });
};

export const deleteSiparisServisData = (): Promise<void> => {
    const keys: (keyof DataStore)[] = ['siparisler', 'siparisLog', 'sevkEdilenler', 'servisKayitlari', 'servisSevkEdilenler'];
    const deletePromises = keys.map(key => setData(key, []));
    return Promise.all(deletePromises).then(() => {});
};


// BOM
export const exportBomsData = (data: DataStore) => {
    const moduleData = { backupDate: new Date().toISOString(), boms: data.boms || [] };
    downloadJsonFile(moduleData, `hertz_motor_receteler_yedek_${new Date().toISOString().slice(0,10)}.json`);
};

export const importBomsData = (file: File): Promise<void> => {
     return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const data = JSON.parse(reader.result as string);
                if (!data.hasOwnProperty('boms')) return reject(new Error("Geçersiz Reçete yedek dosyası."));
                await setData('boms', ensureArray(data.boms));
                resolve();
            } catch (err: any) { reject(new Error("Dosya okunamadı: " + err.message)); }
        };
        reader.readAsText(file);
    });
};

export const deleteBomsData = (): Promise<void> => setData('boms', []);


// Stok Yönetimi
export const exportStokTakipData = (data: DataStore) => {
    const moduleData = { backupDate: new Date().toISOString(), 'stokTakip-v1': data['stokTakip-v1'] || { products: [], logs: [] } };
    downloadJsonFile(moduleData, `hertz_motor_stok_yedek_${new Date().toISOString().slice(0,10)}.json`);
};

export const importStokTakipData = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const data = JSON.parse(reader.result as string);
                if (!data.hasOwnProperty('stokTakip-v1')) return reject(new Error("Geçersiz Stok yedek dosyası."));
                await setData('stokTakip-v1', data['stokTakip-v1'] || { products: [], logs: [] });
                resolve();
            } catch (err: any) { reject(new Error("Dosya okunamadı: " + err.message)); }
        };
        reader.readAsText(file);
    });
};

export const deleteStokTakipData = (): Promise<void> => setData('stokTakip-v1', { products: [], logs: [] });


// Firmalar
export const exportFirmalarData = (data: DataStore) => {
    const moduleData = { backupDate: new Date().toISOString(), contacts: data.contacts || [] };
    downloadJsonFile(moduleData, `hertz_motor_firmalar_yedek_${new Date().toISOString().slice(0,10)}.json`);
};

export const importFirmalarData = (file: File): Promise<void> => {
     return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const data = JSON.parse(reader.result as string);
                if (!data.hasOwnProperty('contacts')) return reject(new Error("Geçersiz Firma yedek dosyası."));
                await setData('contacts', ensureArray(data.contacts));
                resolve();
            } catch (err: any) { reject(new Error("Dosya okunamadı: " + err.message)); }
        };
        reader.readAsText(file);
    });
};

export const deleteFirmalarData = (): Promise<void> => setData('contacts', []);

// İmalat Takip
export const exportImalatData = (data: DataStore) => {
    const moduleData = { backupDate: new Date().toISOString(), workOrders: data.workOrders || [] };
    downloadJsonFile(moduleData, `hertz_motor_imalat_yedek_${new Date().toISOString().slice(0,10)}.json`);
};

export const importImalatData = (file: File): Promise<void> => {
     return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const data = JSON.parse(reader.result as string);
                if (!data.hasOwnProperty('workOrders')) return reject(new Error("Geçersiz İmalat yedek dosyası."));
                await setData('workOrders', ensureArray(data.workOrders));
                resolve();
            } catch (err: any) { reject(new Error("Dosya okunamadı: " + err.message)); }
        };
        reader.readAsText(file);
    });
};

export const deleteImalatData = (): Promise<void> => setData('workOrders', []);

// --- Global Data Management ---

export const fetchAllData = async (): Promise<DataStore> => {
    const database = getDb();
    let dataStore: DataStore = {};
    const allKeysToLoad = [...ESSENTIAL_KEYS, ...LAZY_KEYS];

    const loadPromises = allKeysToLoad.map(key =>
        database.ref(`ls/${encodeURIComponent(key)}`).get().then(snap => {
            if (snap.exists()) {
                const remoteData = snap.val().value;
                if (key === 'stokTakip-v1') {
                    dataStore[key] = remoteData || { products: [], logs: [] };
                } else {
                    (dataStore as any)[key] = ensureArray(remoteData);
                }
            } else {
                 if (key === 'stokTakip-v1') {
                    dataStore[key] = { products: [], logs: [] };
                } else {
                    (dataStore as any)[key] = [];
                }
            }
        }).catch(error => {
            console.error(`Firebase fetch failed for key ${key}:`, error);
        })
    );
    await Promise.all(loadPromises);
    return dataStore;
};


export const exportAllData = () => {
    fetchAllData().then(dataStore => {
        const allData = {
            backupDate: new Date().toISOString(),
            users: dataStore.users || [],
            contacts: dataStore.contacts || [],
            boms: dataStore.boms || [],
            workOrders: dataStore.workOrders || [],
            siparisServisData: {
                orders: dataStore.siparisler || [],
                logs: dataStore.siparisLog || [],
                sevkEdilenler: dataStore.sevkEdilenler || [],
                servisKayitlari: dataStore.servisKayitlari || [],
                servisSevkEdilenler: dataStore.servisSevkEdilenler || []
            },
            stokTakipData: dataStore['stokTakip-v1'] || {products: [], logs: []}
        };

        downloadJsonFile(allData, `hertz_motor_tam_yedek_${new Date().toISOString().slice(0,10)}.json`);
    }).catch(err => {
        console.error("Failed to export data:", err);
        // You might want to show a toast to the user here.
    });
};

export const importAllData = (file: File | undefined): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (!file) {
            return reject(new Error("Lütfen bir dosya seçin."));
        }
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const data = JSON.parse(reader.result as string);
                if (!data.siparisServisData || !data.stokTakipData || !data.contacts) {
                    return reject(new Error("Bu dosya geçerli bir tam yedek dosyası değil."));
                }
                const setPromises = [
                    setData('users', ensureArray(data.users)),
                    setData('contacts', ensureArray(data.contacts)),
                    setData('boms', ensureArray(data.boms)),
                    setData('workOrders', ensureArray(data.workOrders)),
                    setData('siparisler', ensureArray(data.siparisServisData.orders)),
                    setData('siparisLog', ensureArray(data.siparisServisData.logs)),
                    setData('sevkEdilenler', ensureArray(data.siparisServisData.sevkEdilenler)),
                    setData('servisKayitlari', ensureArray(data.siparisServisData.servisKayitlari)),
                    setData('servisSevkEdilenler', ensureArray(data.siparisServisData.sevkEdilenler)),
                    setData('stokTakip-v1', data.stokTakipData || {products: [], logs: []})
                ];
                await Promise.all(setPromises);
                resolve();
            } catch (err: any) {
                reject(new Error("Yedek dosyası okunamadı veya geçersiz: " + err.message));
            }
        };
        reader.readAsText(file);
    });
};