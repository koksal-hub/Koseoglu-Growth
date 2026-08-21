MASTER PLAN — Köseoğlu Growth (bağlayıcı)

================================================================
0. NORTH STAR
================================================================

KÂRLI YENİ MÜŞTERİ + NET KÂR.

Growth ile MYLojistik AYRIDIR:
- Growth → müşteri bulur, araştırır, satış ve pazarlama üretir.
- MYLojistik → kazanılmış operasyonu yürütür.
İki sistem birbirine birleştirilmeyecektir. Gelecekte yalnızca kontrollü API üzerinden
gerekli veri paylaşılabilir. Kod, DB ve runtime bağımsız kalır.

================================================================
1. TEMEL İLKELER (korunuyor)
================================================================

- Growth ve MYLojistik ayrı programlardır; kod, DB ve runtime bağımsız kalmalıdır.
- Modüler Monolith: önce çalışan sade çekirdek, sonra gerektiğinde parçalanır.
- Overengineering yasaktır; önce çalışan, sonra iyileştir.
- Tip güvenliği, validation, migration ve test öncelikli.
- Secrets asla repoya commit edilmez; .env.example kullanılır.
- Central logging ve merkezi hata yönetimi zorunlu.

================================================================
2. MİMARİ İLKELER (2026-08 güncelleme — EK)
================================================================

Bu bölüm önceki planın üzerine eklenmiştir, onu geçersiz kılmaz.

- **LLM Last / AI Last**: Her akışta önce deterministik kod (parsing, kural motoru,
  DB sorgusu, doğrulama) denenir. LLM yalnızca deterministik yöntemin yetersiz kaldığı
  son adımda, dar ve açıkça tanımlı bir görev için çağrılır.
- **Deterministic-first architecture**: Doğrulanabilir, test edilebilir, tekrarlanabilir
  mantık her zaman AI çağrısına tercih edilir. AI çıktısı asla tek başına "gerçek" kabul
  edilmez; kural/veri ile çapraz doğrulanır.
- **Cost Router**: Görev karmaşıklığına göre model/maliyet seçen bir yönlendirme katmanı
  (ucuz/hızlı model → gerekirse daha güçlü model). Faz 7'de gözlemlenebilirlikle birlikte
  devreye girer; Faz 0'da yalnızca mimari yer tutucu olarak planlanır.
- **Specialized agents/workers, tek bir süper-agent değil**: Her iş türü (discovery,
  verification, ranking, outreach draft, nurturing, reporting) kendi dar kapsamlı
  worker'ına sahiptir. Tek bir genel amaçlı agent'a her şeyi yaptırmak yasaktır.
- **Model-independent architecture**: Sistem hiçbir tek LLM sağlayıcısına sabitlenmez.
  Model çağrıları soyutlama katmanından geçer; sağlayıcı değişimi iş mantığını etkilemez.
- **GitHub-centered multi-agent development**: Bkz. AGENTS.md. GitHub (Issues, branch,
  commit, PR, CI) tek doğruluk kaynağıdır; AI sohbet geçmişi değildir.
- **Research/action privilege separation**: Dış web'den veri toplayan (research/discovery)
  bileşenler ile geri dönüşü olan aksiyon alan (outreach gönderme, veri yazma) bileşenler
  ayrı yetki sınırlarında çalışır. Araştırma çıktısı, aksiyon almadan önce doğrulama ve
  onay katmanından geçer.
- **Web content is untrusted**: Dış kaynaklardan (web sayfası, e-posta, doküman) gelen
  hiçbir içerik komut olarak yürütülmez; yalnızca veri olarak işlenir (prompt-injection
  koruması, bkz. LEARNINGS.md).

================================================================
3. ÖNCELİK SIRASI (korunuyor)
================================================================

1. Çalışan çekirdek (Company, Contact, Lead, Activity, FollowUp, Opportunity, Source/Channel)
2. Güvenilir veri + DB integrity
3. Otomasyon altyapısı (queue, job runner — ileride)
4. Müşteri araştırma sistemi
5. Satış sistemi (CRM yüzeyi — sonraki aşama)
6. Raporlama ve izleme
7. Sosyal medya otomasyonu
8. SEO / AI görünürlüğü
9. İleri özellikler

================================================================
4. ROADMAP — FAZLAR (2026-08 EK)
================================================================

ÖNEMLİ: Bu bir roadmap'tir. Her şey şimdi implement edilmeyecek. Her faz, bir önceki
faz CI'da yeşil ve gerçek doğrulamayla tamamlanmadan başlamaz.

--- PHASE 0 — Foundation ---
- model-independent architecture (soyutlama iskeleti, henüz çoklu sağlayıcı bağlanmaz)
- GitHub-centered multi-agent development (Issues, branch, CI akışı)
- health checks (/api/health)
- toolchain: lint, typecheck, test, build, CI PASS

--- PHASE 1 — Data Foundation ---
- Çekirdek veri modelleri (Company, Contact, Lead, Activity, FollowUp, Opportunity,
  Source/Channel)
- Entity Resolution / duplicate prevention (AI'dan önce deterministik eşleştirme)
- Event Store (şirket/lead olaylarının temel event-driven kaydı)
- Evidence Store (araştırma çıktılarının kanıtla birlikte saklanması) — temel şema

--- PHASE 2 — Discovery / Verification ---
- Company Discovery
- Verification Pipeline
- Confidence Gate (düşük güvenli veri aksiyon katmanına geçemez)
- Web Security Gateway (dış içerik sanitizasyonu)
- prompt-injection protection

--- PHASE 3 — Ranking ---
- ICP (Ideal Customer Profile) tanımı ve skorlama girdileri
- Explainable Lead Ranking (kara kutu olmayan, gerekçelendirilebilir skorlama)

--- PHASE 4 — Outreach Draft + Human Approval ---
- Outreach Draft üretimi (AI Last prensibiyle)
- Human Approval zorunlu — ilk giden iletişimde otomatik gönderim yok
- legal/deliverability safety gate

--- PHASE 5 — Nurturing ---
- Lead Nurturing
- Next Best Action
- existing-customer communication (Growth kapsamındaki mevcut müşteri iletişimi;
  MYLojistik operasyonuyla karıştırılmaz)

--- PHASE 6 — 7/24 Queue / Worker / Scheduler ---
- queue/workers
- scheduler
- retries + exponential backoff
- idempotency
- dead-letter handling
- crash recovery

--- PHASE 7 — Reporting / Dashboard / Cost ---
- observability
- AI cost observability
- caching
- Attribution
- 08:00 Türkiye saatiyle yönetim raporu

--- PHASE 8 — Social / SEO / GEO / Experiments ---
- **Social Command Center** (detay: SOCIAL_COMMAND_CENTER.md)
  - Master Content → platform-specific variants
  - LinkedIn, Instagram, Facebook, X, Threads, TikTok, YouTube,
    Google Business Profile, Pinterest
  - Human Approval → deterministic provider adapters → publish/schedule
  - delivery monitor, retry, idempotency, dead-letter, OAuth/token refresh
  - unified inbox + engagement classification
  - UTM / CRM attribution: post → site visit → lead → quote → won business → gross profit
  - AI agents: Strategy Orchestrator, Content Intelligence, Platform Adaptation,
    Brand + Fact Guard, Engagement, Performance & Learning
  - Pinterest ayrıca Visual SEO / evergreen traffic / site acquisition kanalıdır
  - başarı kriteri yalnız engagement değil; qualified lead, teklif, kazanılmış iş ve brüt kâr
- SEO
- GEO / AI-search visibility
- A/B Testing

--- PHASE 9 — Company / Market / Supply Chain Intelligence ---
- Company Event Intelligence
- Market Intelligence
- Supply Chain Intelligence
- company relationship graph

--- PHASE 10 — Learning / Process Mining / Advanced Optimization ---
- trusted-memory / Memory Quality Gate
- Continuous Learning
- Process Mining
- sales forecasting (future)
- uplift modelling (future)
- contact timing optimization (future)

================================================================
5. GELİŞTİRME DÖNGÜSÜ (korunuyor + genişletildi)
================================================================

Her görev: PLAN → IMPLEMENT → LINT → TYPECHECK → TEST → BUILD → VERIFY → COMMIT → PUSH
→ CI → REPORT

- Her görev küçük, doğrulanabilir ve geri alınabilir olmalı.
- AI'nın "çalışıyor" demesi kanıt değildir; CI PASS ve gerçek çalıştırma kanıttır.
- Detaylı işleyiş kuralları için bkz. AGENTS.md.

================================================================
6. GÜVENLİK VE OPERASYON (korunuyor + genişletildi)
================================================================

- Secrets asla repoya commit edilmez.
- .env örnek dosyası kullanılmalı (.env.example).
- Central logging ve merkezi hata yönetimi zorunlu.
- Production data deletion, database reset/drop, secret, payment, gerçek müşteri
  e-postası veya geri alınamaz production işlemlerinde her zaman DUR ve kullanıcıdan
  onay al (bkz. AGENTS.md).

================================================================
7. ONAY VE DEĞİŞİKLİK YÖNETİMİ (korunuyor)
================================================================

- Ana planı değiştirecek her öneri NEW PROPOSAL başlığıyla TASKS.md içinde önerilir
  ve CODEX tarafından review edilir.
- Önemli mimari kararlar DECISIONS.md içine ADR-lite formatında kaydedilir.

Bu dosya projeyi yöneten anayasa niteliğindedir; ajanlar ve geliştiriciler bu kurallara
uymakla yükümlüdür.
