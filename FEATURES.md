# Hertz Motor Platformu - Özellik Manifestosu

Bu dosya, uygulamanın temel işlevlerini ve "asla bozulmaması gereken" kurallarını listeler. Her yeni geliştirme öncesinde bu manifesto gözden geçirilmeli ve yapılacak değişikliklerin buradaki maddelerle çelişmediğinden emin olunmalıdır.

##  Genel Kurallar

- **Yetkilendirme:** Kritik silme işlemleri (örneğin Firma Silme, Stok Ürünü Silme, Log Kaydı Silme) sadece `hertz` rolüne sahip kullanıcılar tarafından yapılabilir. Diğer düzenleme ve ekleme işlemleri daha geniş yetkilere sahip olabilir.
- **Veri Bütünlüğü:** Bir firma, aktif bir siparişte veya stok ürününün tedarikçisi olarak kullanılıyorsa silinemez.
- **Modüler Veri Yönetimi:** `hertz` rolüne sahip kullanıcılar, her ana modülün (Firmalar, Stok, Reçeteler, Sipariş/Servis) sayfasından o modüle özel verileri yedekleyebilir, yedekten geri yükleyebilir veya tamamen silebilir. Bu, bölüm bazında veri yönetimi ve acil durum kurtarma için esneklik sağlar.

## Kullanıcı Yönetimi (`UserManagement.tsx`)
- **Merkezi Yönetim:** `hertz` rolüne sahip yönetici kullanıcılar için "Kullanıcılar" adında yeni bir modül eklenmiştir.
- **Kullanıcı Oluşturma:** Yöneticiler, kullanıcı adı, şifre ve rol (`admin` veya `user`) belirterek yeni kullanıcılar oluşturabilir.
- **Düzenleme ve Güncelleme:** Mevcut kullanıcıların kullanıcı adları, şifreleri ve rolleri yönetici tarafından güncellenebilir. Şifre alanı boş bırakıldığında mevcut şifre korunur.
- **Güvenlik ve Kontrol:** Yöneticiler, kendi hesaplarını veya sistemdeki son yönetici hesabını silemez, bu da sistemin kilitlenmesini önler. Tüm kullanıcı verileri artık `constants.ts` dosyasında sabit olmak yerine, diğer uygulama verileri gibi veritabanında güvenli bir şekilde saklanmaktadır.

## Sipariş & Servis Modülü (`OrderService.tsx`)

- **Satır İçi Düzenleme:** Aktif siparişler ve servis kayıtları listesindeki birçok alan (Müşteri, Ürün, Adet, Termin vb.) tablo üzerinden direkt olarak tıklanarak düzenlenebilmelidir.
- **Otomatik Sipariş Numarası:** Yeni bir sipariş veya servis kaydı eklendiğinde, sistem `ORD-YYAA-XXXX` veya `TS-YYAA-XXXX` formatında, sıralı ve benzersiz bir numara atamalıdır.
- **Sipariş İptal Yönetimi:** Kullanıcılar, sipariş listesindeki bir siparişi "İptal" olarak işaretleyebilir. İptal edilen siparişler, ana listeden gizlenir ve "İptal Edilenler" filtresiyle görüntülenebilir, bu da siparişlerin yanlışlıkla kaybolmasını engeller ve gerekirse iptalin geri alınmasına olanak tanır.
- **Analiz Sayfası:** "Analiz" sekmesi aşağıdaki raporları içermelidir ve bu işlevselliği korunmalıdır:
    - **Müşteri Bazında Tüketim Tahminlemesi:** Seçilen bir müşterinin geçmiş siparişlerine dayanarak gelecekte hangi üründen ne zaman sipariş verebileceğini tahmin eder.
    - **Grafik Raporları:** En çok sipariş veren müşteriler, en çok sipariş edilen ürünler, en sık görülen arızalar ve genel termin (zamanında/geç sevk) performansını gösteren grafikler bulunmalıdır.

## İmalat Takip Modülü (`Manufacturing.tsx`)

- **Modüler Veri Yönetimi:** `hertz` rolüne sahip kullanıcılar, `İmalat Takip` modülüne özel verileri (stoğa üretim için oluşturulan bağımsız iş emirleri) yedekleyebilir, yedekten geri yükleyebilir veya tamamen silebilir. Bu, sipariş verilerini etkilemeden sadece imalat iş emirlerinin yönetilmesini sağlar.
  - **Düzeltme (Veri Silme Güvenilirliği):** Modüldeki "Verileri Sil" işlevinin, onay işleminden sonra bazen yanıt vermemesine neden olan bir sorun giderildi. Sorun, veri silme işleminin sonucunu yöneten asenkron kodun yapısından kaynaklanıyordu. Bu kod, işlemi daha güvenilir ve anlaşılır kılan modern `async/await` sözdizimi kullanılarak yeniden düzenlendi. Bu değişiklik, silme işleminin başarı veya hata durumunun uygulama tarafından net bir şekilde yakalanmasını ve kullanıcıya doğru geri bildirimin (başarı veya hata mesajı) gösterilmesini garanti eder.
- **Etkileşimli Durum Güncelleme:** "İşe Başla" ve "İşi Bitir" butonları, ilgili işin durumunu anında `bekliyor` -> `imalatta` -> `hazır` olarak değiştirmelidir. "Tamamlanan İşler" sekmesindeki "Geri Al" butonu, tamamlanmış bir işi tekrar `bekliyor` durumuna getirmelidir. Bu durum değişiklikleri, veritabanına kaydedilmeli ve tüm kullanıcılarda anlık olarak yansıtılmalıdır. Bu temel iş akışı, platformun çekerek bir özelliğidir ve bozulmamalıdır.
- **Senkronize Sipariş İptali:** `Sipariş & Servis` modülünde iptal edilen bir siparişe ait tüm iş emirleri, `İmalat Takip` listelerinden otomatik ve anlık olarak kaldırılır. Bu, imalat ekibinin yanlışlıkla iptal edilmiş bir iş üzerinde çalışmasını engelleyerek kaynak israfını önler.
- **Bağımsız İş Emirleri:** "Stoğa İş Emri Ekle" özelliği, iş emrini **sadece** o an görüntülenen imalat aşaması için oluşturur. Bu iş emri, diğer imalat aşamalarının listelerinde görünmez ve onları etkilemez. Her imalat bandı bağımsızdır.
- **Evrensel Düzenleme/Silme (Stok İş Emirleri):** Stoğa üretilmek üzere eklenen iş emirlerinin "Adet" ve "Sipariş Termini" alanları, yetki ayrımı olmaksızın tüm kullanıcılar tarafından tablo üzerinden düzenlenebilir. Aynı şekilde, bu iş emirleri herhangi bir kullanıcı tarafından silinebilir.
- **Esnek İş Akışı:** "Atanan Kullanıcı" sistemi kaldırılmıştır. Herhangi bir kullanıcı, herhangi bir imalat aşamasındaki bir işi başlatabilir veya bitirebilir. Bu, departmanlar arası esnekliği artırır ve bir kişinin yokluğunda işlerin durmasını engeller.
- **Herkes İçin Tam Görünürlük:** Kullanıcı rolü ne olursa olsun, tüm imalat personeli bütün imalat aşamalarını (Bobinaj, Gövde, Mil vb.) görüntüleyebilir. Bu, departmanlar arası koordinasyonu ve genel iş akışı takibini kolaylaştırır.
- **Derinlemesine Analiz Raporları:** `İmalat Takip` modülüne, üretim süreçlerinin performansını ve verimliliğini ölçen yeni bir "Analiz" sekmesi eklenmiştir. Bu sekme, veriye dayalı karar almayı desteklemek için aşağıdaki raporları içerir:
    - **Ortalama Aşama Tamamlama Süresi:** Her bir imalat aşamasının (Bobinaj, Montaj vb.) ortalama ne kadar sürdüğünü gösteren bir grafik. Bu, üretimdeki darboğazları (bottleneck) anında tespit etmeyi sağlar.
    - **Aşamalardaki İş Yükü (WIP):** Hangi imalat bandında ne kadar işin beklediğini veya devam ettiğini göstererek kaynak planlamasına yardımcı olur.
    - **Gecikme Analizi:** Hangi aşamaların terminlere en sık uymadığını gösteren bir grafik, süreç iyileştirme çalışmalarına yön verir.
    - **Kullanıcı Performansı:** Hangi kullanıcının hangi aşamalarda ne kadar iş tamamladığını gösteren bir tablo, iş gücü verimliliğini şeffaf bir şekilde ortaya koyar.
    - **Ürün Bazlı Ortalama İmalat Süresi:** Hangi ürünlerin imalatının başından sonuna kadar ortalama ne kadar sürdüğünü gösteren bir rapor. Bu, en karmaşık veya en çok zaman alan ürünleri belirleyerek fiyatlandırma ve planlama süreçlerine kritik veri sağlar.
    - **İnteraktif Ürün Filtreleme:** 'Ürün Bazlı Ortalama İmalat Süresi' raporuna, belirli bir ürünün verilerini tek başına analiz etmeye olanak tanıyan bir filtreleme özelliği eklenmiştir. Bu, yöneticilerin en çok zaman alan veya en karmaşık ürünlerin üretim süreçlerine odaklanmasını kolaylaştırır.
    - **Operatör ve İş İstasyonu Kapasite Kullanım Raporu:** Belirli bir zaman diliminde (örn. son 30 gün) hangi kullanıcının toplamda kaç saat aktif çalıştığını ve hangi imalat bandının ne kadar süreyle meşgul olduğunu gösteren grafikler. Bu rapor, iş gücü planlamasını optimize etmeye, hangi personelin veya departmanın aşırı yüklendiğini tespit etmeye ve kaynakları daha verimli yönlendirmeye yardımcı olur.

## Ürün Reçetesi (BOM) Modülü (`BOM.tsx`)

- **Otomatik İmalat Durumu:** Bir sipariş oluşturulduğunda veya bir ürün reçetesi güncellendiğinde, sistem ilgili siparişlerin imalat durumlarını otomatik olarak yeniden hesaplamalıdır. Stokta bulunan yarı mamüller, ilgili imalat aşamalarının "hazır" olarak başlamasını sağlamalıdır.
- **Akıllı Reçete Oluşturma (Paketli Gövde):** 'Paketli Gövde' için bir reçete oluşturulurken, sistem zekice davranır:
    - **Bileşen Filtreleme:** Bileşen listesinde sadece, hedef 'Paketli Gövde'nin kW, RPM ve Voltaj değerleriyle birebir uyumlu 'Sargılı Paket' (SP) ürünleri gösterilir. Bu, hatalı bileşen seçimini imkansız hale getirir.
    - **Otomatik Kriter Doldurma:** Reçetenin sipariş eşleştirme kriterleri (Klemens Yönü, Montaj Deliği Tipi vb.), hedef 'Paketli Gövde' ürününün stok kartındaki teknik özelliklerle otomatik olarak doldurulur. Bu, tutarlılığı artırır ve manuel veri girişini ortadan kaldırır.
- **Detaylı Kriter Gösterimi:** Reçete listesi, 'Paketli Gövde' ürünlerine özel eşleştirme kriterlerini (Klemens Yönü, Montaj Deliği, Bağlantı Tipi) doğrudan 'Eşleştirme Kriterleri' sütununda göstererek, reçetelerin bir bakışta ayırt edilmesini kolaylaştırır.
- **Dinamik Reçete Kriterleri (Akıllı Form):**
    - **Ne Yapar:** Ürün reçetesi oluşturma formunu, seçilen "Hedef Ürün" tipine göre akıllıca uyarlar. Sadece o ürün tipi için anlamlı olan "Sipariş Eşleştirme Kriterleri" alanlarını gösterir. Örneğin, bir 'Sargılı Paket' için reçete oluşturulurken sadece kW, RPM, Voltaj gibi elektriksel değerler gösterilirken, bir 'Motor' için mil, kapak ve montaj tipi gibi ek mekanik kriterler de forma eklenir.
    - **Çözdüğü Problem:** Kullanıcıların, üretilecek ürünle alakasız kriterleri görmesini ve yanlışlıkla doldurmasını engeller. Formu sadeleştirerek karmaşıklığı azaltır ve sadece gerekli bilgilere odaklanılmasını sağlar.
    - **İş Etkisi:** Reçete oluşturma sürecini hızlandırır ve daha sezgisel hale getirir. Hatalı veya gereksiz kriter girme olasılığını ortadan kaldırarak reçetelerin doğruluğunu ve siparişlerle eşleşme kalitesini artırır. Bu, daha temiz veri ve daha güvenilir bir üretim planlaması anlamına gelir.

## Stok Yönetimi Modülü (`Inventory.tsx`)

- **Otomatik SKU:** Yeni ürün eklenirken SKU alanı boş bırakılırsa veya girilen SKU zaten mevcutsa, sistem ürün kategorisine göre (`ST-XXXX`, `MIL-XXXX` vb.) otomatik olarak benzersiz yeni bir SKU oluşturmalıdır.
- **Hareket Kaydı (Loglama):** Stok miktarında yapılan her türlü değişiklik (giriş, çıkış, sayım, yeni ürün, ürün silme/güncelleme) geri dönük izlenebilirlik için `Stok Hareketleri` sekmesine bir log kaydı olarak eklenmelidir.
- **Detaylı 'Paketli Gövde' Tanımlama:** 'Paketli Gövde' türündeki stok ürünleri için 'Klemens Yönü' (üstten/alttan), 'Ayak Montaj Deliği' (düz/ters), 'Bağlantı Tipi' (klemensli/soketli) ve ürüne özel 'Müşteri' ataması gibi ek teknik özellikler tanımlanabilir.
- **Detaylı 'Motor' Tanımlama:** 'Motor' türündeki stok ürünleri için 'Müşteri' (opsyonel), 'Klemens Yönü', 'Ayak Montaj Deliği', 'Bağlantı Tipi', 'Mil Kodu' (mevcut 'Taşlanmış Mil' ürünlerinden seçilir), 'Kapak Çeşidi' **(AK/CK)** ve **'Rulman Tipi' (1R/2R/CR)** gibi kapsamlı teknik özellikler tanımlanabilir. Bu, motorların siparişlerle ve reçetelerle daha hassas eşleştirilmesini sağlar.
- **Anlık Özellik Görüntüleme:** Stok listesi tablosuna eklenen "Özellikler" sütunu, ürün kategorisine özel teknik detayları (örneğin motorlar için kW/RPM, miller için mil kodu, paketli gövdeler için montaj tipi vb.) doğrudan listeler. Bu, ürünleri ayırt etmeyi hızlandırır ve detaylar için ürün formunu açma ihtiyacını azaltır.
- **Analiz Raporları (`InventoryAnalysis.tsx`):** "Analiz Raporları" sekmesi korunmalı ve aşağıdaki temel metrikleri sunmalıdır:
    - Belirli bir zaman aralığındaki **en aktif ürünler**.
    - Belirli bir süredir hiç hareket görmemiş **hareksiz ürünler (ölü stok)**.
    - **Stok devir hızı** ve ortalama stokta kalma süresi.
    - Kullanıcı bazında yapılan toplam işlem sayısı.
    - Seçilen bir ürün için aylık **tüketim trendi grafiği**.
    - Yıllık tüketim değerine dayalı **ABC analizi**.
- **Gizli Maliyet Raporlaması (Admin Özel):** `Stok Yönetimi` modülünün ana ekranında, tüm envanterin toplam maliyetini gösteren bir özet bilgi kutucuğu eklenmiştir. Bu finansal veri, sadece `hertz` rolüne sahip yönetici kullanıcılar tarafından görülebilir, bu da hassas maliyet bilgilerinin gizliliğini sağlar.

## Kod Kalitesi ve Sürdürülebilirlik

- **Bileşen Modülerizasyonu (Component Modularization):**
  - **Ne Yapar:** `OrderService.tsx` ve `Inventory.tsx` gibi büyük ve karmaşık bileşen dosyalarını, işlevlerine göre daha küçük, odaklanmış ve yönetilebilir dosyalara böler. Örneğin, `OrderService.tsx` artık `OrderForm`, `OrderList`, `ServiceRecords` gibi alt bileşenleri ayrı dosyalardan içe aktarır.
  - **Çözdüğü Problem:** Tek bir dosyanın yüzlerce, hatta binlerce satır koda ulaşarak okunmasını, anlaşılmasını ve bakımını zorlaştırmasını engeller. Bir özellikte değişiklik yapmak için devasa bir dosyayı tarama ihtiyacını ortadan kaldırır.
  - **İş Etkisi:** Kodun okunabilirliğini ve sürdürülebilirliğini önemli ölçüde artırır. Geliştiricilerin belirli bir işlevsellik üzerinde daha hızlı ve güvenli bir şekilde çalışmasını sağlar. Hata ayıklama sürecini basitleştirir ve yeni özellikler eklerken ortaya çıkabilecek yan etkileri (regresyonları) azaltır. Bu, platformun uzun vadeli sağlığı ve geliştirme hızının korunması için temel bir mimari iyileştirmedir.

## Mimari İyileştirme: İş Mantığının Soyutlanması (Refactoring)

- **Ne Yapar:** `Manufacturing.tsx` bileşeni içerisindeki karmaşık otomasyon mantığını (bir imalat aşaması tamamlandığında veya geri alındığında stokların otomatik güncellenmesi, hammadde düşümleri, log kayıtları oluşturma vb.) arayüzden tamamen ayırarak `hooks/useManufacturingAutomation.ts` adında özel, yeniden kullanılabilir bir "hook" (kanca) içine taşır.
- **Çözdüğü Problem:** Daha önce, bu kritik ve karmaşık iş mantığı, doğrudan arayüzü çizen `Manufacturing.tsx` bileşeninin içinde yer alıyordu. Bu durum, bileşeni aşırı büyütüyor (god component), okunmasını zorlaştırıyor ve gelecekte yapılacak bir değişikliğin istenmeyen yan etkilere yol açma riskini artırıyordu. Arayüz mantığı ile iş mantığı iç içe geçmiş durumdaydı.
- **İş Etkisi:** Bu "Sorumlulukların Ayrılması" (Separation of Concerns) prensibi, platformun kod kalitesini ve uzun vadeli sürdürülebilirliğini temelden iyileştirir. `Manufacturing.tsx` bileşeni artık sadece arayüzü göstermek ve kullanıcı etkileşimlerini bu yeni "otomasyon kancasına" bildirmekle sorumludur. İş mantığı ise kendi modülünde izole, test edilebilir ve daha kolay yönetilebilir bir hale gelmiştir. Bu, hata ayıklamayı basitleştirir, gelecekteki geliştirmeleri hızlandırır ve sistemin genel kararlılığını artırır.

## Mimari, Veri Bütünlüğü ve Performans İyileştirmeleri (Yüksek Öncelik)

Bu bölüm, platformun kararlılığını, veri bütünlüğünü ve uzun vadeli performansını garanti altına alan temel mimari iyileştirmeleri listeler.

- **Güvenli Eşzamanlı Düzenleme (Veri Bütünlüğü):**
  - **Ne Yapar:** İki kullanıcının aynı anda bir firma veya ürünü düzenlemesi durumunda, birinin diğerinin değişikliklerini farkında olmadan ezmesini önler. Kaydetme işlemi, artık tüm kaydın üzerine yazmak yerine, sadece formda değiştirilen alanları mevcut kayıtla akıllıca birleştirir.
  - **Çözdüğü Problem:** "Eski veri" (stale data) üzerine yazma riskini ortadan kaldırır. Örneğin, bir kullanıcı adres bilgisini güncellerken, diğer bir kullanıcının aynı anda güncellediği telefon numarasını ezmesini engeller.
  - **İş Etkisi:** Veri kaybını önleyerek operasyonel hataların (yanlış fatura adresi, hatalı iletişim bilgisi vb.) önüne geçer. Platformun çok kullanıcılı ortamlarda güvenilir bir şekilde çalışmasını sağlar.

- **Sunucu Taraflı Sayfalama (Performans):**
  - **Ne Yapar:** "Stok Hareketleri" ve "Sipariş Hareket Geçmişi" gibi potansiyel olarak on binlerce kayıt içerebilecek listelerin, verilerin tamamını tek seferde indirmesini engeller. Bunun yerine, veriler sunucudan parça parça (sayfalanmış olarak) çekilir.
  - **Çözdüğü Problem:** Veritabanı büyüdükçe modül açılışlarının yavaşlamasını, tarayıcının donmasını ve yüksek ağ trafiği oluşmasını engeller.
  - **İş Etkisi:** Uygulama modüllerinin her zaman hızlı açılmasını garanti eder. Veri transferini ciddi ölçüde azaltarak, özellikle mobil veya yavaş internet bağlantılarında platformun verimli çalışmasını sağlar ve veritabanı maliyetlerini düşürür.

- **Esnek İmalat Akışı (Kullanıcı Deneyimi):**
  - **Ne Yapar:** `İmalat Takip` modülünde, "İmalatta" durumundaki bir iş için "İşi Durdur" butonu eklenmiştir.
  - **Çözdüğü Problem:** Kullanıcıların yanlışlıkla başlattıkları bir işi geri almak için "Tamamlandı" olarak işaretleyip sonra "Geri Al" demek gibi dolaylı bir yol izleme zorunluluğunu ortadan kaldırır.
  - **İş Etkisi:** İş akışını daha sezgisel ve esnek hale getirir. Kullanıcıların hatalarını kolayca düzeltmelerine olanak tanıyarak zaman kazandırır ve operasyonel verimliliği artırır.

- **Akıllı Reçete Yönetimi (Veri Bütünlüğü):**
  - **Ne Yapar:** Ürün reçetesi oluşturma formuna, aynı bileşenin listeye birden fazla kez eklenmesini engelleyen bir kontrol mekanizması eklenmiştir.
  - **Çözdüğü Problem:** Dikkatsizlik sonucu aynı hammaddenin reçeteye iki kez eklenerek maliyet ve stok hesaplamalarının yanlış yapılması riskini ortadan kaldırır.
  - **İş Etkisi:** Reçetelerin doğruluğunu garanti altına alır. Bu, daha hassas maliyet analizleri, doğru stok düşümleri ve güvenilir üretim planlaması anlamına gelir.

## Anahtar Yenilikler ve Akıllı Özellikler

Bu bölüm, platformu standart bir yönetim aracının ötesine taşıyan, iş akışlarını otomatize eden ve kullanıcılara derinlemesine analizler sunan temel yenilikleri listeler.

- **Akıllı Stok Tahsisi (Smart Stock Allocation):**
  - **Ne Yapar:** Sistem, bir siparişin üretim planını oluştururken artık sadece anlık depo miktarını değil, aynı zamanda diğer bekleyen siparişler için 'rezerve edilmiş' olan miktarları da hesaba katar.
  - **Çözdüğü Problem:** Stokta olmayan bir bileşenin varmış gibi gösterilerek yanlış üretim planları oluşturulmasını ve imalat bandında beklenmedik duruşlara neden olmasını engeller.
  - **İş Etkisi:** Kaynakların doğru tahsis edilmesini sağlar ve 'stokta yok' sürprizlerinin önüne geçerek üretim planlamasının güvenilirliğini artırır.

- **Atomik Reçete Güncellemeleri (Atomic BOM Updates):**
  - **Ne Yapar:** Bir ürün reçetesi güncellendiğinde, hem reçetenin kendisi hem de bu değişiklikten etkilenen tüm mevcut siparişlerin imalat planları artık güvenli, tek bir akış içinde kaydedilir.
  - **Çözdüğü Problem:** Güncelleme sırasında yaşanabilecek anlık bir ağ hatası gibi sorunlarda sistem verilerinin tutarsız bir durumda kalma riskini ortadan kaldırır.
  - **İş Etkisi:** Veri bütünlüğünü en üst seviyeye çıkararak, üretim planlarının her zaman en güncel ve doğru reçeteye dayanmasını garanti eder.

- **İşlem Zinciri Güvenilirliği (Reliable Action Chaining):**
  - **Ne Yapar:** İmalat aşaması güncellendiğinde tetiklenen stok düşümü gibi otomatik işlemler artık 'yarış durumu' (race condition) riskini ortadan kaldıran daha sağlam bir altyapı kullanır.
  - **Çözdüğü Problem:** Yavaş ağ koşullarında otomasyon zincirinin eski (stale) veri üzerinden çalışarak hatalı stok kayıtları oluşturma riskini engeller.
  - **İş Etkisi:** Yavaş ağ koşullarında bile otomasyon zincirinin her zaman doğru ve güncel verilerle çalışmasını garanti eder, veri tutarlılığını ve otomasyonun güvenilirliğini artırır.

- **Akıllı Stok Seviyesi Takibi ve Otomatik İş Emri Tetikleme:**
  - **Ne Yapar:** Sistem, bir **yarı mamülün** stok seviyesini sürekli izler. Miktar, ürün kartında tanımlanmış minimum seviyenin altına düştüğü anda, sistem otomatik olarak o üründen varsayılan bir üretim partisi kadar (örn. 20 adet) yeni bir "Stoğa İş Emri" oluşturur. Bu iş emri, o yarı mamülü üreten ilgili imalat bandının (örn. Sargılı Paket için Bobinaj) bekleme listesine eklenir. Bu otomasyon, başka aktif bir "Stoğa İş Emri" yoksa tetiklenir, böylece mükerrer üretim talepleri önlenir.
  - **Çözdüğü Problem:** Yarı mamül stoklarının kritik seviyeye düşmesinin manuel olarak fark edilip, elle iş emri oluşturulması sürecini ortadan kaldırır. İnsan unutkanlığı veya yoğunluk nedeniyle oluşabilecek üretim aksamalarını ve gecikmeleri engeller.
  - **İş Etkisi:** Üretim süreçlerinin devamlılığını garanti altına alır. En çok kullanılan yarı mamüllerin stokta tükenme riskini ortadan kaldırarak sipariş terminlerine uyumu artırır. Üretim planlama sorumluluğunun bir kısmını yöneticiden alıp sisteme devrederek zaman kazandırır ve operasyonel verimliliği artırır.

- **Stoktan Ürün Seçimi ve Otomatik İş Emri Oluşturma:**
  - **Ne Yapar:** Sipariş ve Servis kayıtlarındaki serbest metinli "Ürün" alanını, sadece 'motor' tipi stok ürünlerini listeleyen akıllı bir ürün seçim penceresi (modal) ile değiştirir. Kullanıcı bir motor seçtiğinde, sipariş formundaki `kW`, `RPM`, `Voltaj`, `Kapak`, `Rulman` ve `Mil Kodu` gibi tüm ilgili teknik özellik alanları, seçilen motorun stok kartındaki verilerle otomatik olarak ve hatasız bir şekilde doldurulur.
  - **Çözdüğü Problem:** Karmaşık motor özelliklerinin manuel olarak girilmesi sırasında oluşan yazım hatalarını, eksik bilgiyi ve tutarsızlıkları tamamen ortadan kaldırır. Siparişlerin her zaman sistemde tanımlı, gerçek ve standart bir ürüne karşılık gelmesini sağlar.
  - **İş Etkisi:** Veri doğruluğunu ve sipariş giriş hızını önemli ölçüde artırır. En büyük etkisi ise üretim planlamasında görülür: Bir sipariş oluşturulduğu anda, sistem seçilen motora ait doğru ürün reçetesini (BOM) otomatik olarak bulur. Ardından, reçetedeki bileşenlerin (örneğin, sargılı paket) stok durumunu kontrol eder. Eğer bir bileşen stokta yeterli miktarda varsa, o bileşene ait imalat aşamasını (örneğin, bobinaj) otomatik olarak "atlayarak" iş emri listesinden çıkarır. Bu akıllı otomasyon, gereksiz üretim yapılmasını engeller, kaynakları doğru yönlendirir ve üretim iş akışını en verimli hale getirir.

- **Esnek Miktar Yönetimi (Küsüratlı Değerler):**
  - **Ne Yapar:** Platform genelinde, ağırlık (kg) veya uzunluk (metre) gibi birimlerle ölçülen ürünler için ondalık sayıların (`0,196` gibi) girilmesine olanak tanır. Bu esneklik, Sipariş & Servis, Stok Yönetimi (giriş/çıkış/sayım), Ürün Reçeteleri ve İmalat Takip modüllerinin tamamında geçerlidir.
  - **Çözdüğü Problem:** Daha önceki versiyonda sistemin sadece tam sayıları kabul etmesi, özellikle hammadde ve fire hesaplamalarında ciddi bir bir kısıtlama yaratıyordu. Bu durum, ya miktarların yuvarlanmasına ya da sistem dışı kayıtlar tutulmasına neden oluyordu.
  - **İş Etkisi:** Stok doğruluğunu ve reçete hassasiyetini en üst düzeye çıkarır. Özellikle bakır tel gibi ağırlıkla satılan hammaddelerin veya fire oranlarının küsuratlı olarak sisteme işlenebilmesini sağlayarak maliyet hesaplamalarının ve envanter yönetiminin çok daha kesin ve doğru yapılmasına olanak tanır. Manuel hesaplama ihtiyacını ortadan kaldırır ve veri bütünlüğünü artırır.

- **Entegre Özellik Gösterimli Basit Ürün Seçimi:**
  - **Ne Yapar:** Ürün seçimi için kullanılan pencereyi (modal), basit ve verimli bir tasarıma kavuşturur. Ayrı bir önizleme paneli yerine, seçilecek ürünün tüm kritik teknik özellikleri (`kW`, `RPM`, `Mil Kodu` vb.), doğrudan ürün listesindeki kendi satırında, "Özellikler" sütunu altında gösterilir.
  - **Çözdüğü Problem:** Kullanıcının, bir ürünün detaylarını görmek için ek bir tıklama yapma veya tahmin yürütme ihtiyacını ortadan kaldırır. Arayüzü sadeleştirerek doğru ürünü bulmayı hızlandırır ve kolaylaştırır.
  - **İş Etkisi:** Reçete oluşturma veya bir motora mil atama gibi işlemleri hızlandırır. Kullanıcıların onlarca benzer ürün arasından doğru olanı tek bakışta seçebilmesini sağlayarak hata yapma olasılığını azaltır ve genel verimliliği artırır.