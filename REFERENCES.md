REFERENCES — Dış Proje Referansları

Bu dosyadaki projeler REFERENCE'tır, implementation dependency değildir.
Roadmap'te (MASTER_PLAN.md) adı geçmesi, şu anda kurulacağı anlamına gelmez.
Foundation (Faz 0) tamamlanmadan hiçbiri eklenmeyecek.

Her referans için:
- PURPOSE
- WHEN TO CONSIDER
- DO NOT COPY BLINDLY
- LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED

================================================================

## BullMQ
https://github.com/taskforcesh/bullmq

PURPOSE: Redis tabanlı queue/worker/retry kütüphanesi.
WHEN TO CONSIDER: Faz 6 (7/24 Queue/Worker/Scheduler) implementasyonuna
başlarken, kendi retry/idempotency/dead-letter mantığımızı sıfırdan yazmak
yerine.
DO NOT COPY BLINDLY: API tasarımı projeye özgü ihtiyaçlara (idempotency key
şeması, dead-letter işleyişi) uyacak şekilde sarmalanmalı.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet — Redis bağımlılığı
getirir, deployment/ops maliyetini artırır.

---

## Temporal TypeScript Samples
https://github.com/temporalio/samples-typescript

PURPOSE: Durable workflow orkestrasyonu için referans örnekler.
WHEN TO CONSIDER: Faz 6/9'da çok adımlı, uzun süren, hataya dayanıklı iş
akışları (örn. çok kaynaklı company discovery) karmaşıklaştığında.
DO NOT COPY BLINDLY: Temporal ayrı bir servis/altyapı gerektirir; erken
fazlarda overengineering riski yüksek.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet — operasyonel
karmaşıklık önemli, Foundation felsefesiyle ("overengineering yasak") çelişme
riski var.

---

## LangGraph / LangGraph.js

PURPOSE: Agent orkestrasyonu referansı (state machine tarzı multi-agent
akışlar).
WHEN TO CONSIDER: Faz 2+ discovery/verification worker'ları arası akış
karmaşıklaştığında, kendi basit orkestrasyonumuz yetersiz kaldığında.
DO NOT COPY BLINDLY: LLM Last ilkesiyle uyum kontrol edilmeli — LangGraph
akışları kolayca "AI-first" tasarıma kayabilir.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet.

---

## Browser Use

PURPOSE: Sandboxed tarayıcı tabanlı araştırma/otomasyon referansı.
WHEN TO CONSIDER: Faz 2 Company Discovery'de, statik scraping'in yetersiz
kaldığı JS-ağırlıklı sitelerde.
DO NOT COPY BLINDLY: Tarayıcı otomasyonu prompt-injection ve güvenlik
riskini artırır — Web Security Gateway ile birlikte değerlendirilmeli.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet — yüksek öncelikli
güvenlik incelemesi gerekir (dış sayfalardan gelen içerik agent'a talimat
gibi görünebilir).

---

## Firecrawl

PURPOSE: Web içeriği çıkarma (extraction) referansı.
WHEN TO CONSIDER: Faz 2 Company Discovery — yapılandırılmış veri çıkarma
ihtiyacı olduğunda.
DO NOT COPY BLINDLY: Üçüncü taraf servise veri gönderimi KVKK/gizlilik
açısından değerlendirilmeli.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet.

---

## Dedupe

PURPOSE: Entity resolution / fuzzy-matching referansı.
WHEN TO CONSIDER: Faz 1 Entity Resolution implementasyonunda, kendi
deterministik eşleştirme kurallarımızı tasarlarken kıyaslama noktası olarak.
DO NOT COPY BLINDLY: Python kütüphanesi; mevcut stack (Node/TS) ile doğrudan
entegre olmayabilir — yaklaşımı referans al, birebir bağımlılık ekleme.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet.

---

## LiteLLM

PURPOSE: AI gateway / model soyutlama referansı.
WHEN TO CONSIDER: ADR-009 (model-independent architecture) implementasyonuna
geçildiğinde, kendi ince soyutlama katmanımızı tasarlarken kıyaslama noktası.
DO NOT COPY BLINDLY: Kendi Cost Router ihtiyaçlarımız (Faz 7) LiteLLM'in
varsayılanlarından farklı olabilir.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet.

---

## vLLM Semantic Router

PURPOSE: Model/görev yönlendirme (routing) referansı.
WHEN TO CONSIDER: Cost Router (Faz 7) tasarımında.
DO NOT COPY BLINDLY: vLLM kendi model sunumu (self-hosted inference)
varsayımıyla gelir; bizim kullanım şeklimiz (API tabanlı sağlayıcılar) farklı
olabilir.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet.

---

## PM4Py

PURPOSE: Process mining referansı (gelecek).
WHEN TO CONSIDER: Faz 10 Process Mining'e gelindiğinde, yeterli event verisi
biriktikten sonra.
DO NOT COPY BLINDLY: Python kütüphanesi; erken entegrasyon gereksiz
karmaşıklık katar — real data before advanced ML ilkesiyle uyumlu şekilde
ertelenmeli.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet.

---

## Postiz
https://github.com/gitroomhq/postiz-app

PURPOSE: Multi-channel social publishing, provider/adaptor, scheduler, media upload,
analytics ve automation mimarisi için ana açık kaynak benchmark.
WHEN TO CONSIDER: Faz 8 Social Command Center implementasyonunda ProviderAdapter,
publish queue, delivery status, retry ve platform-specific settings tasarlarken.
DO NOT COPY BLINDLY: Growth'un CRM attribution, Human Approval, AI Last ve satış/kar
odaklı learning ihtiyaçları farklıdır. Mimari mekanizma benchmark edilir; ürün kopyalanmaz.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet — AGPL-3.0 lisans etkisi özellikle
incelenmelidir. Doğrudan kod reuse kararı lisans review olmadan verilmez.

---

## Mixpost

PURPOSE: Self-hosted social scheduler/planner UX ve provider entegrasyonu benchmark'ı.
WHEN TO CONSIDER: Faz 8 Social Command Center için alternatif açık kaynak mimari kıyası.
DO NOT COPY BLINDLY: Laravel/Vue stack'i mevcut Growth stack'inden farklı olabilir;
Lite/Pro özellik ve lisans ayrımı ayrıca doğrulanmalıdır.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet.

---

## Buffer / Hootsuite / Sprout Social / Metricool

PURPOSE: Ticari ürün benchmark'ları.
- Buffer: master composer, platform customization, calendar/scheduling, insights.
- Hootsuite: approvals, listening, unified inbox, cross-network analytics.
- Sprout Social: Smart Inbox, assignment, tagging, conversation history.
- Metricool: planner + analytics + inbox için sade UX.
WHEN TO CONSIDER: Faz 8 panel UX, workflow ve analytics ürün gereksinimlerini tasarlarken.
DO NOT COPY BLINDLY: Özellik listesi kopyalanmaz; Köseoğlu Growth'un gerçek farkı sosyal
aktiviteyi CRM'de lead → teklif → kazanılmış iş → brüt kâr attribution'a bağlamaktır.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Ürün/ToS/API koşulları için evet.

---

## Pinterest API
https://developer.pinterest.com/docs/api/v5/pins-create/

PURPOSE: Pin publish + link/media + organic analytics; Visual SEO / evergreen traffic kanalı.
WHEN TO CONSIDER: Faz 8 provider adapter pilotunda yüksek öncelikli kanallardan biri.
DO NOT COPY BLINDLY: API izinleri, account/board gereksinimleri ve rate limits resmi
dokümantasyondan implementasyon sırasında yeniden doğrulanmalıdır.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet — OAuth/token lifecycle.

---

## LinkedIn Posts API

PURPOSE: Company/brand adına text/image/video/document/article/multi-image publishing.
WHEN TO CONSIDER: Faz 8 ilk provider pilotlarından biri; B2B lojistik için yüksek öncelik.
DO NOT COPY BLINDLY: Organization/page yetkileri ve API ürün erişimi güncel resmi
dokümantasyondan doğrulanmalı.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet — OAuth ve organization permissions.

---

## Meta Instagram / Threads APIs

PURPOSE: Instagram professional publishing ve Threads content create/manage/publish.
WHEN TO CONSIDER: Faz 8 provider adapterleri.
DO NOT COPY BLINDLY: Account type, permission, media/container workflow ve app review
koşulları değişebilir; implementasyon sırasında resmi API dokümanı authority'dir.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet.

---

## TikTok Content Posting API

PURPOSE: TikTok Direct Post / content publishing adapter benchmark'ı.
WHEN TO CONSIDER: Faz 8 TikTok entegrasyonu.
DO NOT COPY BLINDLY: User consent, app audit ve visibility kısıtları provider validation
katmanında ele alınmalıdır.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet.

---

## YouTube Data API

PURPOSE: Video/Shorts upload workflow benchmark'ı.
WHEN TO CONSIDER: Faz 8 YouTube adapteri.
DO NOT COPY BLINDLY: API project verification/audit ve quota kuralları ayrı onboarding
state'i olarak tasarlanmalıdır.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet.

---

## Google Business Profile API

PURPOSE: Search/Maps üzerinde local post, CTA/event/offer ve post insights; yerel
lojistik görünürlüğü için yüksek değerli kanal.
WHEN TO CONSIDER: Faz 8 provider pilotunda LinkedIn/Pinterest ile birlikte öncelikli.
DO NOT COPY BLINDLY: Business/location permissions ve API erişim koşulları yeniden
doğrulanmalıdır.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet.

---

## X API

PURPOSE: Programatik post/media publishing.
WHEN TO CONSIDER: Faz 8 provider adapteri; maliyet uygun olduğunda.
DO NOT COPY BLINDLY: Pay-per-use/API maliyetleri Cost Router ve channel ROI ile birlikte
izlenmelidir.
LICENSE / SECURITY / COMPLEXITY CHECK REQUIRED: Evet — maliyet, OAuth, rate limits.
