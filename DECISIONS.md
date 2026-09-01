DECISIONS — Mimari Kararlar (ADR-lite)

Her karar şu formatta kaydedilir:
- DECISION
- WHY
- ALTERNATIVES
- CONSEQUENCES
- STATUS (PROPOSED / ACCEPTED / SUPERSEDED)

================================================================

## ADR-001 — Growth / MYLojistik Ayrımı

DECISION: Köseoğlu Growth ve MYLojistik ayrı kod tabanı, ayrı DB, ayrı runtime
olarak geliştirilir. Birleştirilmez.

WHY: Growth araştırma/pazarlama/satış üretimi yapan, sık deploy edilen, dış
kaynaklarla (web, sosyal medya, AI) etkileşen bir sistemdir. MYLojistik kazanılmış
operasyonu yürüten, stabilite önceliği farklı bir sistemdir. Aynı runtime'da
birleştirmek, birinin hatasının diğerini etkileme riskini doğurur.

ALTERNATIVES: Tek monorepo + tek runtime; tek DB ile paylaşımlı şema.

CONSEQUENCES: Veri paylaşımı yalnızca kontrollü API üzerinden yapılır. Kısa
vadede entegrasyon karmaşıklığı biraz artar, uzun vadede blast radius küçülür.

STATUS: ACCEPTED

---

## ADR-002 — GitHub Tek Doğruluk Kaynağı

DECISION: Proje durumu, görev kuyruğu ve karar geçmişi GitHub üzerinden
(Issues, branch, commit, PR, CI) yönetilir. AI sohbet geçmişi source of truth
değildir.

WHY: Birden fazla coding agent (Claude Code, Codex, Copilot, gelecekte
local/free agent'lar) aynı projede çalışacak. Ajanlar arası hafıza aktarımı
sohbet geçmişiyle değil, repository durumuyla yapılmalı.

ALTERNATIVES: Her ajanın kendi sohbet geçmişine güvenmesi; ayrı bir proje
yönetim aracı kullanmak.

CONSEQUENCES: Her görev commit/push/CI ile somutlaşmalı. STATUS.md, TASKS.md
gibi dosyalar güncel tutulmalı.

STATUS: ACCEPTED

---

## ADR-003 — LLM Last

DECISION: Her akışta önce deterministik kod denenir; LLM yalnızca son çare
olarak, dar kapsamlı görevler için çağrılır.

WHY: Maliyet, tekrarlanabilirlik, hata ayıklanabilirlik ve güvenilirlik.
Deterministik kod test edilebilir; LLM çıktısı doğrudan güvenilmemeli.

ALTERNATIVES: AI-first tasarım (her karar noktasında LLM'e danışmak).

CONSEQUENCES: Geliştirme başta biraz daha yavaş (kural motoru/parsing yazmak
gerekir) ama uzun vadede maliyet ve hata oranı düşer.

STATUS: ACCEPTED

---

## ADR-004 — İlk Giden İletişimde Zorunlu İnsan Onayı

DECISION: Outreach Draft (Faz 4), insan onayı olmadan hiçbir gerçek müşteri/
potansiyel müşteriye otomatik gönderim yapmaz.

WHY: Yanlış/uygunsuz bir mesajın gerçek bir şirkete otomatik gitmesi itibar ve
hukuki risk taşır (bkz. legal/deliverability safety gate).

ALTERNATIVES: Tam otomatik gönderim + sonradan izleme.

CONSEQUENCES: İlk aşamada gönderim hızı insan onay adımıyla sınırlıdır; bu
kabul edilebilir bir trade-off olarak değerlendirildi.

STATUS: ACCEPTED

---

## ADR-005 — Uzmanlaşmış Worker'lar, Tek Süper-Agent Değil

DECISION: Discovery, verification, ranking, outreach, nurturing, reporting
gibi işler ayrı, dar kapsamlı worker/agent'lara bölünür.

WHY: Tek bir genel amaçlı agent'a her şeyi yaptırmak, hata ayıklamayı
zorlaştırır, yetki sınırlarını bulanıklaştırır ve prompt-injection gibi
saldırılarda blast radius'u büyütür.

ALTERNATIVES: Tek büyük "super-agent" ile tüm iş akışını yönetmek.

CONSEQUENCES: Daha fazla bileşen, daha net sınırlar; orkestrasyon karmaşıklığı
Faz 6 (queue/worker/scheduler) ile yönetilir.

STATUS: ACCEPTED

---

## ADR-006 — CI Kalite Kapısı

DECISION: Bir görev, GitHub Actions CI (install → lint → typecheck → test →
build) PASS olmadan DONE sayılmaz.

WHY: "Çalışıyor" demek kanıt değildir; nesnel, tekrarlanabilir bir doğrulama
gerekir.

ALTERNATIVES: Ajan/geliştirici beyanına güvenmek.

CONSEQUENCES: Her PR/commit CI'dan geçmeli; kırmızı CI ile yeni işe
başlanmaz.

STATUS: ACCEPTED

---

## ADR-007 — Event Store (Değişmez Olay Akışı)

DECISION: Şirket/lead etkileşim geçmişi mutasyona uğrayan durum yerine
değişmez (immutable) event akışı olarak saklanır.

WHY: Ranking, attribution, process mining gibi ileri özellikler yeniden
hesaplanabilir bir temel gerektirir; sadece "son durum" tutmak bunu engeller.

ALTERNATIVES: Yalnızca güncel state tutan geleneksel CRUD modeli.

CONSEQUENCES: Faz 1'de temel şema kurulur; Faz 9 Company Event Intelligence
bunun üzerine inşa edilir. Depolama artar ama geriye dönük analiz mümkün olur.

STATUS: ACCEPTED

---

## ADR-008 — Evidence + Confidence Gate

DECISION: Araştırma/discovery çıktıları kanıt (kaynak, zaman damgası) ile
saklanır; düşük güvenilirlikli veri otomatik aksiyona geçemez.

WHY: Yanlış/doğrulanmamış şirket verisiyle satış/pazarlama üretmek itibar
riski ve verimsizlik yaratır.

ALTERNATIVES: Ham AI çıktısını doğrudan güvenilir kabul etmek.

CONSEQUENCES: Discovery → Verification → Confidence Gate → Ranking/Outreach
akışı zorunlu bir pipeline haline gelir (Faz 2).

STATUS: ACCEPTED

---

## ADR-009 — Model-Independent AI Routing

DECISION: AI/LLM çağrıları soyutlama katmanından geçer; iş mantığı hiçbir
sağlayıcıya (OpenAI, Anthropic, vb.) doğrudan bağımlı olmaz.

WHY: Fiyat/performans/erişilebilirlik zamanla değişir; tek sağlayıcıya
kilitlenmek risk ve maliyet esnekliğini azaltır.

ALTERNATIVES: Doğrudan tek bir SDK'ya bağımlı entegrasyon.

CONSEQUENCES: Başlangıçta küçük bir soyutlama maliyeti; ileride Cost Router
ve sağlayıcı değişimi kolaylaşır. Faz 0'da yalnızca mimari yer tutucu,
implementasyon ileri fazlarda.

STATUS: ACCEPTED

---

## ADR-010 — Social Command Center: AI Adaptation + Deterministic Publishing

DECISION: Growth'un sosyal medya katmanı tek bir cross-post butonu olarak değil,
Social Command Center olarak geliştirilecek. Bir Master Content AI ile platforma
özgü varyantlara dönüştürülecek; marka/doğruluk kontrolü ve insan onayından sonra
yayın aksiyonu deterministic ProviderAdapter katmanı üzerinden yapılacaktır.
Destek hedefi: LinkedIn, Instagram, Facebook, X, Threads, TikTok, YouTube,
Google Business Profile ve Pinterest.

WHY: Platformların format, medya, karakter, API, izin ve audience beklentileri
farklıdır. Aynı metni körlemesine tüm platformlara kopyalamak kaliteyi düşürür.
LLM'in doğrudan yayın API'sini kontrol etmesi ise yetki, tekrar edilebilirlik,
retry/idempotency ve hata ayıklama riskini artırır. Growth'un gerçek amacı
engagement değil; qualified lead → teklif → kazanılmış iş → brüt kâr üretmektir.

ALTERNATIVES: Her platformu manuel yönetmek; Buffer/Hootsuite/Postiz benzeri bir
ürünü bütünüyle kopyalamak; LLM'e doğrudan platform API yetkisi vermek; aynı postu
bütün kanallara aynen göndermek.

CONSEQUENCES: Phase 8'de Composer, platform variant, ProviderAdapter, Human Approval,
scheduler/publish queue, delivery monitor, Unified Inbox, analytics ve CRM attribution
yüzeyleri oluşturulacaktır. Phase 6 queue/retry/idempotency altyapısı ve Phase 7
attribution/observability reuse edilir. Postiz/Mixpost/Buffer/Hootsuite/Sprout/Metricool
yalnız benchmark/referans olarak incelenir; lisans ve güvenlik kontrolü olmadan kod
kopyalanmaz. Pinterest ayrıca Visual SEO / evergreen traffic kanalı olarak ölçülür.

STATUS: ACCEPTED

---

## ADR-011 — Research Eşleşme Önerisi ile Kanonik Şirket Bağını Ayır

DECISION: ResearchCandidate üzerindeki deterministik entity-resolution sonucu
`matchedCompanyId` olarak yalnız öneri/receipt şeklinde saklanır. Kanonik
`companyId` ancak insan `ACCEPT` kararı ve açık `LINK_MATCH` veya `CREATE_NEW`
seçiminden sonra set edilir. Kabul, otomatik Lead veya Outreach üretmez.

WHY: Domain, telefon, adres ve bulanık ad gibi sinyaller farklı güven düzeylerine
sahiptir. Olası eşleşmeyi doğrudan şirket ilişkisi saymak false-merge riskini ve
yanlış şirket üzerinde satış aksiyonu alma ihtimalini büyütür.

ALTERNATIVES: Entity-resolution sonucunu doğrudan `companyId` yapmak; kabul anında
belirsizliği sessizce çözmek; otomatik Company/Lead oluşturmak.

CONSEQUENCES: API yanıtı match nedeni ve güvenini gösterir; eşleşen adayın kabulü
açık resolution ister. Veri modeli iki nullable ilişki taşır, fakat araştırma
gerçeği ile insan kararını denetlenebilir biçimde ayırır.

STATUS: ACCEPTED
