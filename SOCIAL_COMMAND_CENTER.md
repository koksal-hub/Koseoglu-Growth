# SOCIAL COMMAND CENTER — Growth Research & Architecture

Tarih: 2026-08-21
Durum: RESEARCHED / PLANNED — aktif production entegrasyonu değildir.

## 1. Amaç

Köseoğlu Growth içinde sosyal medya yönetimi yalnız "aynı postu her yere gönder" özelliği olmayacaktır.
Hedef, tek bir ana içerikten platforma özgü varyantlar üretmek, insan onayıyla çoklu yayın yapmak,
yayın/yorum/mesajları izlemek ve sonucu CRM içinde lead → teklif → iş → brüt kâr zincirine bağlamaktır.

Temel akış:

Strategy / Research → Master Content → Platform Adaptation → Brand & Fact Guard → Human Approval
→ Deterministic Provider Adapters → Publish/Schedule → Delivery Monitor → Unified Inbox + Analytics
→ CRM Attribution → Learning.

## 2. Platform kapsamı

İlk tasarım kapsamı:
- LinkedIn
- Instagram
- Facebook
- X
- Threads
- TikTok
- YouTube
- Google Business Profile
- Pinterest

Pinterest ayrıca yalnız sosyal kanal değil, Visual SEO / evergreen traffic / site acquisition kanalı olarak izlenecektir.

## 3. Tasarım ilkeleri

- Aynı metni körlemesine tüm platformlara kopyalamak yok.
- Tek master content, platforma özgü varyantlara dönüştürülür.
- LLM yayın API'sini doğrudan yönetmez; içerik/yorumlama görevini yapar, deterministic adapter aksiyonu gerçekleştirir.
- İlk gerçek yayınlarda Human Approval Gate korunur.
- Platform kuralları, karakter limitleri, medya tipleri ve zorunlu alanlar deterministik validation ile uygulanır.
- OAuth/token refresh, retry, idempotency, delivery status ve dead-letter davranışı zorunludur.
- Yayın başarısı yalnız beğeni/izlenme değildir; qualified lead, site intent, quote request, won business ve gross profit ile ilişkilendirilir.
- Growth ve MYLojistik ayrımı korunur; sosyal medya CRM/satış verisi Growth tarafındadır.
- Araştırma/kod referansları benchmark'tır; lisans ve güvenlik kontrolü olmadan kod kopyalanmaz.

## 4. Önerilen panel

Ana menü:
- Dashboard
- Create
- Calendar
- Campaigns
- Inbox
- Listening
- Analytics
- Leads
- Media Library
- AI Learning
- Connections
- Settings

Create ekranı:
1. Master post oluştur.
2. Platform seç.
3. "AI ile tümüne uyarla".
4. LinkedIn / Instagram / Facebook / X / Threads / Pinterest / TikTok / YouTube / Google Business varyantlarını yan yana önizle.
5. Human approval.
6. "Tümünü onayla ve yayınla" veya zamanla.

Delivery ekranı her provider için ayrı durum göstermelidir:
SUCCESS / RETRYING / FAILED / REQUIRES_APPROVAL / RATE_LIMITED / AUTH_REQUIRED.

## 5. Provider Adapter kontratı

Platform bağımsız arayüz hedefi:

- connect()
- refreshToken()
- validateContent()
- uploadMedia()
- publish()
- schedule()
- delete()
- fetchPostMetrics()
- fetchComments()
- fetchMessages()

Her provider adapter kendi API ayrıntısını kapsüller; Growth iş mantığı platform SDK'larına doğrudan kilitlenmez.

## 6. Agent mimarisi

İlk sürüm için çok sayıda ajan yerine 6 dar uzman yeterlidir:

### Strategy Orchestrator
Haftalık/aylık hedefi belirler; müşteri segmenti, kampanya amacı ve içerik önceliğini koordine eder.

### Content Intelligence Agent
Sektör, lojistik, firma araştırması, mevcut başarılı içerikler ve Growth verilerinden içerik fikirleri çıkarır.

### Platform Adaptation Agent
Master içeriği her platformun formatına, diline, medya tipine ve CTA yapısına uyarlar.

### Brand + Fact Guard
Yanlış bilgi, olmayan hizmet/fiyat vaadi, marka tonu, spam/duplicate, güvenlik ve risk kontrolü yapar.

### Engagement Agent
Yorum/mesajları sınıflandırır: LEAD / CUSTOMER / QUESTION / COMPLAINT / SPAM / OTHER.
Satış sinyali varsa Growth CRM'e yönlendirir; kritik cevaplar human approval'a düşer.

### Performance & Learning Agent
Post performansını yalnız engagement ile değil, UTM → website visit → lead → quote → shipment/won business → gross profit zinciriyle değerlendirir.

## 7. Reward / başarı ölçümü

Ana amaç MAX_LIKES değildir.

Öncelikli olumlu sinyaller:
- Qualified Leads
- Website Intent
- Quote Requests
- Won Business
- Gross Profit
- Brand Trust

Negatif sinyaller:
- Complaints
- Spam Signals
- Unsubscribes
- Brand Risk

Learning Agent yalnız doğrulanmış attribution ve yeterli örnek üzerinden kalıcı öğrenme üretmelidir.

## 8. Scheduler / queue mimarisi

Önerilen akış:

Growth UI → Social API → Post DB → Publish Job Queue → Platform Adapter → Platform API.

Tarayıcıdan dokuz platform API'sine sırayla bağlanmak yok.
Job runner şu özellikleri desteklemeli:
- retry + exponential backoff
- idempotency
- per-provider rate limit
- token refresh
- dead-letter queue
- delivery audit log
- crash recovery

Bu bölüm MASTER_PLAN Phase 6 Queue/Worker/Scheduler altyapısını reuse etmelidir.

## 9. Unified Inbox

Mümkün olan platformlarda yorum/DM/mention tek akışta toplanır.
Minimum alanlar:
- platform
- account
- conversation/thread id
- sender
- received_at
- message type
- sentiment (diagnostic only)
- intent classification
- linked Company/Contact/Lead
- assignment
- status
- response history

Aksiyon yetkisi Research/Engagement analizinden ayrılmalı; dış içerik untrusted input olarak işlenmelidir.

## 10. Analytics & CRM attribution

Her yayın mümkünse campaign_id + post_id + platform + UTM parametreleri ile izlenir.

Örnek attribution:
LinkedIn post → website visit → company identification → lead → opportunity → quote → won business → gross profit.

Ana raporlar:
- platform bazında reach/engagement
- outbound clicks
- website sessions
- qualified leads
- quote requests
- won business
- gross profit
- cost per qualified lead
- content-to-revenue attribution

## 11. Benchmark edilen ürünler / kodlar

### Postiz
Open-source multi-channel social scheduling/orchestration referansı.
Öne çıkan prensipler: provider/adaptor yapısı, scheduler, media upload, analytics, automation, background workflow.
Önemli: AGPL-3.0 lisans kontrolü zorunlu; kod körlemesine Growth içine kopyalanmaz.
Kaynak: https://github.com/gitroomhq/postiz-app

### Mixpost
Self-hosted social scheduling referansı; Laravel/Vue ekosistemi.
Lite/Pro ve lisans/özellik ayrımı ayrıca kontrol edilmelidir.

### Buffer
Master composer, platform-specific customization, calendar/scheduling, cross-channel insights için ürün benchmark'ı.

### Hootsuite
Unified inbox, approvals, listening, cross-network analytics için benchmark.

### Sprout Social
Smart Inbox, assignment, tagging, conversation history ve CRM-benzeri engagement workflow için benchmark.

### Metricool
Basit planner + analytics + inbox UX'i için benchmark.

## 12. Platform API notları

### Pinterest
Pin create, media/link/description/alt text ve organic analytics kabiliyetleri nedeniyle Visual SEO + evergreen traffic kanalı olarak tasarlanmalı.
Kaynak: https://developer.pinterest.com/docs/api/v5/pins-create/

### Instagram
Professional hesaplarda image/video/Reels/carousel yayın akışı; OAuth ve publish permission gereksinimleri dikkate alınmalı.

### Threads
Programatik content create/manage/publish için resmi API yolu benchmark edilmelidir.

### LinkedIn
Posts API üzerinden text/image/video/document/article/multi-image; Company Page yetkileri ayrıca yönetilmelidir.

### TikTok
Direct Post ve audit/consent/visibility kuralları nedeniyle provider-specific approval/validation gerekir.

### YouTube
Upload API + API project verification/audit koşulları provider onboarding'inde açık tutulmalıdır.

### Google Business Profile
Search/Maps üzerinde post, CTA/event/offer ve post insights; yerel görünürlük için yüksek öncelikli kanaldır.

### X
Programatik posting mümkündür; API maliyeti/pay-per-use ayrı Cost Router metriği olarak izlenmelidir.

## 13. Araştırma ilkeleri

Araştırmalardan çıkan kalıcı prensipler:
- Platform-persona uyumu, salt mimari karmaşıklıktan daha önemlidir.
- Planlama + hafıza + verification/reflection yararlı olabilir; fakat her ajan çıktısı doğrulanmalıdır.
- Çok ajan her zaman daha iyi değildir; herding/false-consensus riski vardır.
- Engagement baskısı ajanı clickbait/manipülatif davranışa itebilir; reward function satış değeri + marka güveni + risk birlikte düşünülerek tasarlanmalıdır.
- Aynı içerik fikri platforma göre adapte edilmelidir; kör cross-post varsayılan olmamalıdır.

## 14. Growth roadmap entegrasyonu

Bu modül MASTER_PLAN Phase 8 — Social / SEO / GEO / Experiments altında uygulanacaktır.
Ancak altyapı bağımlılıkları daha erken fazlardan gelir:
- Phase 1: Company/Contact/Lead/Event/Evidence data model
- Phase 4: Human Approval Gate
- Phase 6: queue/worker/scheduler/retry/idempotency
- Phase 7: attribution/observability/cost
- Phase 8: Social Command Center UI + provider adapters + AI adaptation
- Phase 10: trusted learning / process mining

## 15. İlk implementation sırası

1. Social account + provider connection model
2. ProviderAdapter interface
3. Master Content + Platform Variant schema
4. Composer + preview UI
5. Human Approval
6. Queue + scheduled publishing
7. LinkedIn / Instagram / Facebook / Pinterest / Google Business adapter pilot
8. Delivery monitor + retry/dead-letter
9. Analytics + UTM
10. CRM lead/opportunity attribution
11. Unified Inbox
12. Performance & Learning Agent
13. Kalan platform adapterleri

## 16. Definition of success

Social Command Center başarıya ulaşmış sayılmaz yalnızca "9 platforma post atıyor" diye.
Başarı kriteri: tek içerik operasyonunu azaltırken platform kurallarına uygun yayın yapması ve sosyal medya faaliyetini ölçülebilir şekilde qualified lead, teklif, kazanılmış iş ve brüt kârla ilişkilendirebilmesidir.
