# Phase 9C — Market and Supply-Chain Intelligence Plan

Bu dilim, mevcut `Evidence` kayıtlarını kullanarak şirket bazında market ve
tedarik zinciri sinyallerini salt-okunur biçimde sınıflandırmayı hedefler.
İlk sürüm dış veri toplamaz; yalnızca daha önce insan/worker tarafından kayıt
altına alınmış kanıtları gösterir.

## Veri sözleşmesi

- `claimKey` namespace'leri:
  - `market.*` → `MARKET`
  - `supply_chain.*` → `SUPPLY_CHAIN`
  - diğer değerler → `COMPANY`
- Sınıflandırma deterministiktir; bilinmeyen veya boş `claimKey` tahmin edilmez.
- Her sinyal `sourceOrigin`, `sourceName`, `summaryTrust`, `freshnessStatus`,
  `confidence`, `observedAt` ve `accessedAt` alanlarını taşır.
- Ham URL query parametreleri, credential-shaped değerler ve event metadata'sı
  response'a girmez.

## Önerilen endpoint

`GET /api/intelligence/companies/:id/insights?category=MARKET&limit=50`

- `category` opsiyoneldir: `COMPANY`, `MARKET`, `SUPPLY_CHAIN`.
- Tarih penceresi ve limit timeline/evidence-brief ile aynı bounded kuralları
  kullanır.
- Yanıt; kategori başına toplam, güncel/stale/unknown kırılımı ve sıralı kanıt
  özetlerini verir.
- `writesPerformed` ve `externalCallsPerformed` her zaman `false` olur.

İlk read-only uygulama `GET /api/intelligence/companies/:id/insights` ile
başladı. `claimKey` namespace'leri deterministic olarak sınıflandırılır ve
response, kanıt listesinin limit nedeniyle kesilip kesilmediğini açıkça bildirir.

## Kabul kapıları

1. PR #80 (evidence brief) `main`e merge edilmiş olmalı.
2. Namespace sınıflandırması için unit/regression testleri eklenmeli.
3. İki farklı source origin zorunluluğu yalnızca yeni ticari karar akışına
   geçişte aranmalı; bu projection tek başına karar üretmemeli.
4. Crawler, canlı market API'si, tedarikçi API'si, AI/provider çağrısı ve CRM
   write bu dilimde kapsam dışıdır.
5. CI migration/lint/typecheck/test/build kanıtı olmadan merge yapılmamalı.

Bu plan Phase 9'un ilerideki canlı veri entegrasyonlarını onaylamaz; yalnızca
mevcut yerel kanıtların güvenli bir görünümünü tanımlar.

## İşletme diliyle örnek

Araştırma ekibi bir şirket için şu kanıtları kaydettiğinde:

- `market.demand`: ihracat hacmi yükseliyor
- `supply_chain.route`: Almanya → Türkiye düzenli kara taşıması
- `supply_chain.port`: Ambarlı Limanı kullanılıyor

API bunları "şirketin pazar ve lojistik sinyalleri" olarak ayrı başlıklarda
gösterir. Sistem bu bilgileri kendisi uydurmaz; her satırın kaynağı, tarihi,
güven seviyesi ve güncellik durumu görünür. Yönetici bu özeti inceleyip
Köseoğlu Lojistik için aranacak müşteri veya teklif fırsatına insan olarak karar
verir.
