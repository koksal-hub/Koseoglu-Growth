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
