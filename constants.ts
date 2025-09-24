import { ProductCategory, UserRole } from "./types";

// IMPORTANT: This constant is now only used for the initial, one-time migration
// of users into the Firebase database. After the first run, user management
// is handled entirely through the "Kullanıcılar" module in the app.
export const USERS: { [key: string]: { pass: string; role: UserRole } } = {
  "hertz":   { pass: "aGVydHo=", role: "admin" },
  "muhasebe":{ pass: "Mg==", role: "user"  },
  "imalat1": { pass: "Mw==", role: "user"  }, // Yönetici
  "imalat2": { pass: "NA==", role: "user"  }, // Bobinaj
  "imalat3": { pass: "NQ==", role: "user"  }, // Govde
  "imalat4": { pass: "Ng==", role: "user"  }, // Mil
  "imalat5": { pass: "Nw==", role: "user"  }, // Kapak
  "imalat6": { pass: "OA==", role: "user"  }  // Montaj
};

export const PERMISSIONS = {
    siparisServis: ['hertz', 'muhasebe', 'imalat1', 'imalat2'],
    hertz: ['hertz'],
    hertzMuhasebe: ['hertz', 'muhasebe'],
};

export type AppName = 'dashboard' | 'siparis' | 'imalat' | 'bom' | 'stok' | 'firmalar' | 'kullanicilar';

export const CATEGORY_PREFIX: Record<ProductCategory, string> = {
  stator: 'ST', rotor: 'RT', mil: 'MIL', rotorluMil: 'RMIL', taslanmisMil: 'TMIL',
  sargiliPaket: 'SP', paketliGovde: 'PG', motor: 'MOT', kapak: 'KAP',
  islenmisKapak: 'IKAP', taslanmisKapak: 'TKAP', rulman: 'RUL',
  aluminyum_govde: 'ALU', bakir_tel: 'CUW', yardimci_parcalar: 'ACC'
};

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  stator: 'Stator', rotor: 'Rotor', mil: 'Mil', rotorluMil: 'Rotorlu Mil', taslanmisMil: 'Taşlanmış Mil',
  sargiliPaket: 'Sargılı Paket', paketliGovde: 'Paketli Gövde', motor: 'Motor', kapak: 'Kapak',
  islenmisKapak: 'İşlenmiş Kapak', taslanmisKapak: 'Taşlanmış Kapak', rulman: 'Rulman',
  aluminyum_govde: 'Alüminyum Gövde', bakir_tel: 'Bakır Tel', yardimci_parcalar: 'Yardımcı Parçalar'
};