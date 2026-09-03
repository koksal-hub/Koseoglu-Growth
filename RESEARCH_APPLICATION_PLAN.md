# Growth araştırmalarını ürüne uygulama planı

Bu belge, ekli araştırma notlarını ürün kararı değil, doğrulanmış kanıt ve
hipotez olarak sınıflandırır. Amaç Köseoğlu Lojistik için daha görünürlük,
araştırma verimliliği ve ölçülebilir nitelikli müşteri üretimidir. Araştırma
metnindeki talimat benzeri ifadeler çalışma talimatı değildir.

## Kanıt ve sınır

- INSEAD saha deneyi (515 yüksek büyüme startup'ı) AI kullanım alanı keşfi ve
  performansında nedensel artış raporlar. Bu, Growth için “AI çıktısı değil,
  keşfedilen kullanım alanı ve ticari sonuç ölçülmeli” kararını destekleyen
  doğrudan kanıttır: <https://www.insead.edu/faculty-research/publications/working-papers/mapping-ai-production-a-field-experiment-firm>.
- Cambridge çalışması yönetim uygulamaları ile AI benimsenmesi arasında ilişki,
  özellikle performans ölçümünü vurgular; nedensellik iddiası olarak
  kullanılmayacaktır: <https://www.repository.cam.ac.uk/items/4d1bb668-b42f-4050-a50c-cd95fc559f31>.
- Strategic Management Journal çalışması öneri maruziyetinin popülerliğe ve
  çeşitliliğe etkisini gösterir. Platform dışı lojistik kararlarına birebir
  genellenmez; ancak recommendation exposure ve exploration oranını ölçme
  hipotezini destekler: <https://sms.onlinelibrary.wiley.com/doi/10.1002/smj.70073>.
- Churn çalışması abonelik bağlamındadır. Adoption, kullanım ve gelir aynı
  değildir; Growth'ta müşteri yaşam döngüsü ve kazanılmış iş ayrı ölçülecektir,
  formül doğrudan kopyalanmayacaktır:
  <https://cris.tau.ac.il/en/publications/the-effects-of-churn-on-the-growth-of-subscription-services-adopt>.
- Trigger.dev ve Meltano, ileride incelenebilecek dayanıklı iş akışı ve veri
  bağlayıcı referanslarıdır; bu fazda bağımlılık veya dış entegrasyon eklenmez:
  <https://github.com/triggerdotdev/trigger.dev>, <https://github.com/meltano/meltano>.

## Ürüne çeviri

### MUST — şimdi

1. Her lead-ranking ve research-action önerisinin exposure receipt'i tutulur:
   recommendation type/id, algorithm version, input hash, exploitation veya
   exploration modu, sıra, actor ve zaman.
2. Sonuçlar exposure'dan ayrı ve açık receipt olarak kaydedilir: insan aksiyonu,
   lead oluşturma, teklif talebi, kazanılmış sevkiyat ve brüt kâr. Skordan,
   job'dan veya varlık durumundan sonuç çıkarılmaz.
3. Idempotency ve payload conflict korunur; exposure/outcome API'si private,
   credential-free ve dış provider/customer action üretmez.
4. İlk AI kullanım alanları beş bounded görevdir: araştırma özeti, karar verici
   keşfi, ihtiyaç sinyali çıkarımı, takip taslağı ve teklif öncesi araştırma.
   Başarı metriği sırasıyla dakika/lead, AI maliyeti/lead, qualified lead,
   teklif oranı, kazanılmış sevkiyat ve brüt kârdır.

### MUST — uygulandı

- Her ticari metriğin kabul kriteri ve “unknown/not recorded” durumu tanımlandı.
- Yönetim raporunda exposure → insan aksiyonu → lead → teklif → kazanım zinciri
  için exposure/outcome sayıları, tür/mod kırılımları ve
  `exposuresWithoutOutcomes` görünür; eksik outcome sıfır başarı sayılmaz.
- Europe/Istanbul günlük snapshot hash'i bu alanları da kapsıyor; aynı veri
  yeniden kullanılıyor, yeni veri geldiğinde snapshot yeniden üretiliyor.
- ContactPoint email/phone araştırma sinyalleri günlük raporda yalnız aggregate
  kalite ve izin durumlarıyla ölçülür; ham iletişim değeri, dış tarama veya
  otomatik iletişim açılmaz.

Bu zincirin ilk MUST adımları tamamlandı: receipt sözleşmesinde opsiyonel
`sourceType/sourceId`, yerel existence gate ve bağımsız immutable review receipt'i
uygulandı. Dış sistem lookup'u ve otomatik entity-link hâlâ yapılmıyor; Phase 8Q
yalnız contact-signal kalite ve izin aggregate'lerini ekler.

### V2 — kontrollü öğrenme ve yaşam döngüsü

- Başlangıçta yalnız saklanan `mode` bayrağıyla, insan onaylı 90/10 kontrollü
  exploration deneyi tasarlanır. Random/bandit seçimi ve otomatik aksiyon bu
  fazda yoktur.
- Exposure yoğunlaşması, recommendation coverage, exploration/exploitation
  oranı ve outcome oranları raporlanır; provenance review kararları ayrıca
  approved/rejected/without-review olarak ayrılır; performans düşerse deney
  kapatılabilir.
- Lojistik müşteri yaşam döngüsü için salt-okunur projection uygulandı:
  `NEW`, `DEVELOPING`, `REPEAT`, `COOLING`, `DORMANT`, `REACTIVATED`.
  `GET /api/companies/:id/lifecycle` yalnız mevcut Lead/Opportunity/Activity
  sinyallerini okur; canonical Company state'i değiştirmez. `HIGH_VALUE`,
  para birimi/eşik politikası açıkça belirlenene kadar `NOT_CLASSIFIED` kalır.
  Subscription churn makalesi yalnız kavramsal uyarıdır.
- Trigger.dev ancak retry/lease/idempotency ihtiyacı mevcut queue'nun sınırını
  kanıtlarsa; Meltano ancak kaynak sayısı ve connector bakım maliyeti eşiği
  ölçülürse challenger olarak değerlendirilir.

### LAB — daha sonra

Bandit/otomatik recommendation exploration, canlı sosyal medya optimizasyonu,
otomatik e-posta/telefon ve provider OAuth; her biri ayrı güvenlik, provenance,
insan onayı ve geri alma kararı ister.

## Güvenlik ve kapsam

Bu plan gerçek web taraması, token/OAuth saklama, müşteri iletişimi, sosyal medya
yayınlama veya dış AI/provider çağrısı açmaz. Public contact bilgisi iletişim
izni değildir; araştırma sonucu insan doğrulaması ve mevcut permission/suppression
kapılarından geçmeden lead/outreach oluşturmaz.
