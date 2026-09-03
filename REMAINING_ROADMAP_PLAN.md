# Remaining Roadmap — Safe Execution Plan

Bu belge, Phase 8R sonrasındaki işleri küçük, doğrulanabilir ve geri alınabilir
dilimlere ayırır. Canlı sağlayıcı işlemleri, OAuth callback/token kullanımı,
gerçek sosyal medya yayını ve müşteri iletişimi açık onay olmadan etkinleşmez.

## 1–2 saatlik çalışma planı

1. **Durum ve sözleşme kontrolü (15 dk)**
   - `STATUS.md`, `TASKS.md`, `DECISIONS.md` ve sosyal içerik sözleşmesini kontrol et.
   - `main` dalının temizliğini, son commit'i ve mevcut kalite komutlarını kaydet.
   - Eksik kanıtları PASS sayma; yerel erişim engellerini `NOT_RUN` olarak bırak.

2. **Phase 8G provider onboarding hazırlığı (30 dk)**
   - Sağlayıcı, hesap, exact scope, sandbox/pilot sınırı ve rollback sahibi
     belirlenmeden adapter veya OAuth callback yazma.
   - Secret-manager ref, token expiry/rotation ve audit beklentilerini yalnızca
     metadata sözleşmesi olarak tanımla; token değerlerini DB, log veya job'a alma.
   - Onay yokken readiness sonucu `ready: false` ve açıklanabilir blocker listesi
     olmaya devam etmeli.

3. **Phase 9 read-only taslak (25 dk)**
   - Company Event, Market ve Supply Chain Intelligence için veri kaynaklarını,
     provenance alanlarını ve zaman penceresi kurallarını belirle.
   - İlk dilimi yalnız yerel kanıt/receipt ve bounded projection olarak tasarla;
     crawler, dış API, otomatik CRM yazımı ve AI çağrısı ekleme.

4. **Phase 10 bağımlılık haritası (15 dk)**
   - Learning, process mining ve ileri optimizasyonu provenance, outcome review,
     lifecycle ve dashboard ölçümleri üzerine sırala.
   - Başarı ölçülerini ölçüm receipt'i olmadan varsayma; otomatik karar veya
     müşteri aksiyonunu bu plana dahil etme.

5. **Doğrulama ve rapor (15 dk)**
   - `git diff --check`, lint ve typecheck çalıştırılabiliyorsa çalıştır.
   - Test/build erişilemiyorsa sonucu açıkça `NOT_RUN`/`BLOCKED` yaz.
   - Kullanıcı onayı gerektiren maddeleri ayrı bir karar listesinde bırak.

## İlk güvenli dilim — yerel şirket olay zaman çizelgesi

Phase 9 için ilk MUST dilimi yerel `Event` kayıtlarından çalışan
`GET /api/intelligence/companies/:id/timeline` görünümüdür. Yanıt bounded bir
zaman penceresi ve limit kullanır; yalnız şirket kimliği, temel sınıflandırma,
olay türü/zamanı, aktör ve kanıt sayısını döndürür. Olay metadata'sı, ham
iletişim bilgileri ve dış kaynak içeriği döndürülmez. Ayrıca tarih penceresindeki
toplam olay/kanıt sayıları ve olay türü kırılımı deterministik özet olarak verilir.
Endpoint hiçbir yazma, crawler, provider veya AI çağrısı yapmaz.

## Phase 8G açılma kapısı

İmplementasyon ancak aşağıdaki maddeler yazılı olarak netleşince başlar:

- İlk platform ve hesap sahipliği
- Exact OAuth scopes ve provider policy/rate-limit koşulları
- Secret-manager/rotation/expiry sorumlusu
- Sandbox veya paper sınırı ve rollback planı
- Ayrı go-live onayı olmadan publish/DM/customer-contact işlemlerinin kapalı kalması

## Phase 9 ve 10 için sınıflandırma

- **MUST:** mevcut kanıtları kullanan read-only intelligence ve ölçüm yüzeyleri
- **V2:** onaylı provider entegrasyonları, gerçek zamanlı akışlar ve gelişmiş
  optimizasyon
- **LAB:** AI destekli hipotezler; deterministik kanıt ve insan incelemesi olmadan
  üretim kararına bağlanmaz

Bu belge bir uygulama sırasıdır; ana planı veya güvenlik/onay kararlarını tek
başına değiştirmez.
