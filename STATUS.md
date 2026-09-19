# STATUS — Kısa, güncel durum

last_update: 2026-09-19T19:22:13+03:00
last_actor: Cline (docs truth refresh after PR #90)

CURRENT PHASE: PHASE 8R READ-ONLY DAILY ACTION DASHBOARD — DONE (SAFE MODE)
ACTIVE ISSUE: none
ACTIVE BRANCH: `main` (merged from `codex/daily-dashboard-v1`)

## 2026 program planı
- Plan: `GROWTH_2026_PROGRAM_PLAN.md` · Politika: `OUTREACH_COMPLIANCE_POLICY.md` · Kural: `.cline/rules/20-koseoglu-growth-2026-gates.md`
- L0 durumu (2026-09-19): PR #82 squash merge edildi (`5a9d569`), `main` ff-only olarak origin/main ile eşitlendi. PR-A (`chore/pr-a-runtime-fixes`) ve PR-B (`chore/pr-b-provenance-readiness`) yerelde uygulandı ve doğrulandı; **commit/push yok**. Doğrulama: prisma validate/generate PASS, fresh DB 26/26 migration PASS, lint/typecheck/build PASS, tam paket 31 dosya / 221 test PASS, `git diff --check` exit 0. Yerel `.env` oluşturuldu (gitignored, secret yok). Açık: PR #81 (superseded) ve PR #4 kararı; CRLF→LF normalizasyonu commit anında; migration drift (önceden var olan OutreachApproval FK + index adı farkı).
- L8 harici blokları: İYS hesabı ve entegrasyon, onay ve aydınlatma metni, hedef ülke listesi, e-posta domaini ve DNS erişimi, WhatsApp Business hesabı, tarife/fiyat verisi, hukuk teyidi.


### Truth refresh — 2026-09-19 (PR #90 sonrası)

Yukarıdaki "L0 durumu" satırı 2026-09-19 öğleden önceki kayıttır ve tarihsel olarak korunur;
aşağıdakiler kanonik güncel truth'tur.

- **Git:** latest code-bearing baseline = `5b0450bdeb72aafd995faba241b6e0f0b3683954` (son **kod**
  taşıyan merge); current repository HEAD doküman commit'leriyle ilerleyebilir, bu yüzden her docs
  commit'inde SHA yeniden yazılmaz — etiket esastır. MERGED: **#87** (B2A migration convergence gate + shadow replay + disposable guard) ·
  **#88** (BC1 + BC6 money/value kontratı) · **#89** (BC2 + BC3 identity scope + domain evidence) ·
  **#90** (BC4 lifecycle shipment truth) · **#91** (docs truth refresh) · **#92** (PR #4 kapanış
  kaydı) · **#93** (PR-B2B: DB-6 fingerprint + DB-7 db push guard) · **#95** (PR-D2:
  Fastify 5 + koordineli güvenlik eklentileri). Açık PR: **yok**
  (PR #4 kapatıldı — aşağıdaki madde). Açık Issue yok.
- **Migration:** **29** — fresh **29/29** · upgrade **28→29** · zero drift · DB safety gate
  **25/25 PASS** (B2A 11 + DB-6 fingerprint 8 + DB-7 db push 6 kanıtı) · ≤63 byte object-name
  politikası. `growth_db` bu çalışmada **mutate edilmedi** (3 migration, yalnız salt-okunur
  fingerprint); disposable doğrulama DB'leri koşum sonrası düşürüldü (artefakt yok).
- **Test (latest tam paket kanıtı):** **33 dosya / 240 test PASS** (fresh 29/29 DB'de). lint,
  typecheck, build, `prisma validate`/`generate` temiz; `git diff --check` exit 0.
- **Lifecycle policy:** `customer-lifecycle-signals-v2`. `REPEAT` yalnız **gerçek sevkiyat
  truth'undan** türetilir; pipeline etiketi (`stage='WON'`) tek başına REPEAT iddia etmez.
  **L6 shipment receipt bağımlılığı AÇIK**
  (`signals.repeatEvidence.operationsShipmentSource = 'NOT_AVAILABLE'`).
- **BC integrity serisi kapandı:** BC1/BC6 (#88) · BC2/BC3 (#89) · BC4 (#90).
  **BC5 (PORT/HOST evidence tipi) → PR-D1'e devredildi.**
- **PR #4 (Process + Architecture Review Gate) kapatıldı — 2026-09-19, "superseded by later merged
  work":** kod/CI içeriği **#87** (gate mimarisi) ve **#89** (BC2 identity scope) ile aşıldı; güncel
  `main` ile `CONFLICTING`/`DIRTY`, taban 2026-08-13. Branch `chore/process-review-gate`
  **silinmedi → tarihsel arşiv** olarak korunuyor. `main`'de karşılığı olmayan 4 dosya (652 satırlık
  `AI-ENGINEERING-STANDARD.md`, `REVIEW-issue2.md`, `.env.test`, Ağustos migration'ı — etkisi BC2'de)
  bilinçli olarak taşınmadı: güncel yönetişimle rakip otorite riski. Açık Issue yok.
- **DELTA-03 (PR-B2B) DONE — 2026-09-19:** PR **#93** squash `5f5d6dc` · CI **25/25 step success**
  (0 failure; yeni `Migration gate - db fingerprint (read-only, fail-closed on DIVERGED/UNKNOWN)`
  adımı dahil) · 4 dosya / +506−4 · DB-6 salt-okunur fingerprint (`IN_SYNC`/`BEHIND`/`AHEAD`/
  `DIVERGED`/`UNKNOWN`) + DB-7 `db push` guard (production env'de disposable isimli hedefte bile
  red).
- **DELTA-04 (PR-D2) DONE — 2026-09-19:** PR **#95** squash `5b0450b` · CI run
  **`35468157516` PASS** · Fastify **5.12.5**, `@fastify/helmet` **13.1.1**,
  `@fastify/cors` **11.3.0**, `@fastify/rate-limit` **11.2.0** · fresh 29/29,
  fingerprint `IN_SYNC`, DB safety kanıtları, **33 dosya / 240 test**, lint/typecheck/build PASS.
  Uygulama kaynak kodu ve migration değişmedi; dependency-gate kaydı plan §6'da.
  Merge sonrası frozen install + lint/typecheck/build tekrar PASS; yerel full suite yeniden
  koşulmadı (konfigüre disposable DB salt-okunur kontrolde 25/29 BEHIND ve mutation yetkisi yoktu),
  bu nedenle full-suite kapanış kanıtı fresh DB kullanan GitHub CI'dır.
- **Sıradaki uygulama dilimi:** **PR-D1** (Exposure Guard + Trusted Proxy + BC5 PORT/HOST;
  DELTA-05 / SYS-1 / SYS-2).
- **Kanonik order (değişmedi):** B2B → D2 → D1 → D5 → D3 → D4 → E2 → E1 → E3 → L6
  (tek sahip: `GROWTH_2026_PROGRAM_PLAN.md` §3.1; TASKS.md DELTA aynası hizalı).


## Kalıcı GitHub yayın standardı

- Güvenli development PR'ı ancak kapsam/diff, secret-shaped taraması,
  `git diff --check`, lint, typecheck, migration/Prisma validation, test,
  build ve yeşil CI kanıtı ile yayınlanır ve merge edilir.
- Yerel test veya build ortamı erişim nedeniyle çalışmıyorsa sonuç `NOT_RUN`
  kalır; CI yeşil olmadan tamamlandı denmez. Kırmızı/bekleyen CI, bozuk veya
  ilgisiz dosya ve doğrulanmamış READY iddiası GitHub'a gönderilmez.
- Bu standart güvenli repository geliştirmesinde tekrar tekrar onay istemez;
  production reset/silme, ödeme, canlı provider/OAuth ve gerçek müşteri
  iletişimi yine açık onay kapısıdır.

## Phase 8J araştırma uygulaması

- Ekli araştırmalar kanıt/öneri/deney hipotezi olarak ayrıldı; doğrudan kod veya
  bağımlılık kopyalanmadı. Ayrıntılı eşleme `RESEARCH_APPLICATION_PLAN.md`'dedir.
- `RecommendationExposure` ve `RecommendationOutcome` additive migration ile
  eklendi. Exposure; öneri türü/id, algorithm/input hash, mode, position,
  actor/zaman; outcome ise açık ticari olay ve optional value/currency tutar.
- Private endpoint'ler create/list exposure ve exposure outcome kaydı sağlar.
  Aynı anahtar idempotent reuse, değişen payload 409 conflict'tir; gelecekteki
  timestamp, credential-shaped alan, negatif değer ve gross-profit eksikliği
  reddedilir.
- Bu dilim otomatik 90/10 exploration, bandit, crawler, AI/provider çağrısı,
  sosyal medya yayını, e-posta/telefon veya müşteri kaydı oluşturmaz.

## Phase 8K rapor funnel'i

- ManagementReport günlük metriklerine recommendation exposure/outcome sayıları,
  recommendation type, exploitation/exploration mode ve outcome type kırılımları
  eklendi.
- `exposuresWithoutOutcomes` açıkça unknown/not recorded olarak raporlanır;
  eksik sonuç başarı veya başarısızlık diye varsayılmaz. Snapshot input hash'i
  yeni ölçüm alanlarını kapsar.
- PR #49 CI run `33648922655`: SUCCESS — 22 test dosyası / 175 test, migration,
  lint, typecheck ve API/web build. Squash merge `7ebe663`; Issue #48 CLOSED.
- Yerel odaklı Vitest yine NOT_RUN: OneDrive/esbuild reparse-point erişimi
  `vitest.config.ts` yüklemesini engelliyor; CI PostgreSQL entegrasyon kanıtıdır.

## Phase 8L müşteri yaşam döngüsü

- `/api/companies/:id/lifecycle` salt-okunur, bounded projection olarak eklendi.
  `NEW`, `DEVELOPING`, `REPEAT`, `COOLING`, `DORMANT` ve `REACTIVATED` durumları
  açıklanabilir zaman/Opportunity/Activity sinyallerinden hesaplanır.
- Lead `updatedAt` metadata değişikliği müşteri etkileşimi sayılmaz; bu ayrım
  CI regresyonunda doğrulandı. Çoklu para birimi veya eşik politikası olmadan
  high-value sınıflandırması yapılmaz.
- PR #52 CI run `33680946827`: SUCCESS — 23 test dosyası / 179 test, migration,
  lint, typecheck ve API/web build. Squash merge `e862e08`; Issue #51 CLOSED.
- PR #55 CI run `33681822535`: SUCCESS — lifecycle regression matrix ile 23 test
  dosyası / 182 test. Squash merge `22bb643`; Issue #54 CLOSED.

## Phase 8M outcome provenance

- `RecommendationOutcome` artık opsiyonel pairwise `sourceType/sourceId`
  provenance taşıyor: CRM lead/opportunity/event, human note veya operations
  record. Alanlar idempotency/conflict semantics'e dahildir.
- Source ID gerçek kayıtta var mı diye otomatik network/CRM lookup yapılmaz;
  yeni lead, teklif, müşteri veya dış provider kaydı oluşturulmaz.
- PR #58 CI run `33682847191`: SUCCESS — additive migration, lint, typecheck,
  23 test dosyası / 182 test ve API/web build. Squash merge `8e8782b`; Issue #57
  CLOSED.

## Phase 8N source existence gate

- `CRM_LEAD`, `CRM_OPPORTUNITY` ve `CRM_EVENT` sourceId değerleri ilk outcome
  receipt'i oluşturulmadan önce yerel veritabanında aranır; bulunmayan kaynak 404
  ile reddedilir. Mevcut idempotent receipt tekrarında gereksiz lookup yapılmaz.
- `HUMAN_NOTE` ve `OPERATIONS_RECORD` dış metadata olarak kalır; dış sistem
  lookup'u, otomatik entity-link veya yeni CRM/müşteri kaydı yapılmaz.
- PR #61 CI run `33685338110`: SUCCESS — 23 test dosyası / 182 test, additive
  migration, lint, typecheck ve API/web build. Squash merge `a9ca90a`; Issue #60
  CLOSED.

## Phase 8O human-approved outcome provenance

- CRM kaynaklı `RecommendationOutcome` eşleştirmeleri ayrı immutable
  `RecommendationOutcomeProvenanceReview` receipt'iyle `APPROVED` veya `REJECTED`
  olarak kaydedilir. Reviewer, outcome'u kaydeden aktörden farklı olmak zorundadır.
- Review endpoint'i yalnız `CRM_LEAD`, `CRM_OPPORTUNITY` ve `CRM_EVENT` için
  çalışır; source ID yerel veritabanında review anında yeniden doğrulanır.
  `HUMAN_NOTE` ve `OPERATIONS_RECORD` metadata-only kalır.
- `reviewKey` aynı payload'da idempotent reuse, farklı payload'da 409 conflict'tir;
  aynı outcome için ikinci review receipt'i reddedilir. Review sonucu outcome'u
  silmez veya değiştirmez.
- PR #64 CI run `33689347614`: SUCCESS — migration, lint, typecheck, 23 test
  dosyası / 182 test ve API/web build. Squash merge `3e5ecb5`; Issue #63 CLOSED.

## Phase 8P provenance review quality metrics

- Management report'un mevcut raw recommendation outcome toplamları korunur;
  ayrıca provenance review sayısı ve `APPROVED`/`REJECTED` kırılımı eklenir.
- Review receipt'leri report window içinde `reviewedAt` ile, CRM outcome kalite
  kovaları ise `occurredAt` ile sayılır. CRM kayıtları `APPROVED`, `REJECTED` ve
  `WITHOUT_REVIEW` olarak ayrılır; `HUMAN_NOTE` ve `OPERATIONS_RECORD` bu
  CRM kovalarına dahil edilmez.
- Eksik review approval sayılmaz; yeni alanlar snapshot input hash ve mevcut
  idempotent reuse davranışına dahildir. Yeni provider, OAuth, müşteri iletişimi
  veya otomatik attribution eylemi açılmaz.
- PR #67 CI run `33780845257`: SUCCESS — migration, lint, typecheck, 23 test
  dosyası / 182 test ve API/web build. Squash merge `7de1757`; Issue #66 CLOSED.

## Phase 8Q contact signal quality metrics

- Mevcut `ContactPoint` kayıtları `collectedAt` penceresinde toplam ve
  EMAIL/PHONE kırılımıyla raporlanır; ham e-posta/telefon değerleri rapora girmez.
- Doğrulama kararları `verifiedAt` ile, o pencerede hâlen `VERIFIED` olan noktalar
  ayrı sayılır. Toplanan noktaların mevcut verification status kırılımı da korunur.
- İletişim izin receipt'leri `checkedAt` penceresinde toplam ve
  `ALLOWED`/`DENIED`/`OPTED_OUT`/`SUPPRESSED` kırılımıyla raporlanır; izin
  kaydı gönderim anlamına gelmez.
- Bu dilim crawler, dış provider/OAuth, e-posta/telefon gönderimi, lead oluşturma
  veya müşteri iletişimi başlatmaz.
- PR #72 CI run `33784015755`: SUCCESS — migration, lint, typecheck, 23 test
  dosyası / 182 test ve API/web build. Issue #71 kapanışı merge ile kaydedilecek.

## Phase 8R read-only daily action dashboard

- `GET /api/dashboard/daily` mevcut ManagementReport snapshot'ını, tarih penceresi
  içindeki deterministik company ranking receipt'lerini ve ACTIVE/PAUSED araştırma
  görevlerini tek bounded private response'ta birleştirir.
- Ranking çıktısı yalnız şirket kimliği, skor, gerekçeler ve `nextAction` taşır;
  araştırma çıktısı raw contact alanlarını içermez. Her iki liste istenen limit ile
  sınırlandırılır ve sıralama deterministiktir.
- Response `actualLeadCreated`, `actualOutreachCreated`, `actualSendPerformed` ve
  `externalCallsPerformed` için false receipt'i taşır. Endpoint crawler, provider,
  OAuth, send veya canonical CRM write açmaz; yalnız report snapshot reuse/write
  davranışını mevcut ManagementReport sözleşmesiyle sürdürür.
- Local focused Vitest/web build OneDrive/esbuild erişim kısıtı nedeniyle NOT_RUN.
- PR #74 squash merge commit `77c10587599def9a8d97241113b3c910818bcf70` ile
  `main` üzerine alındı; Issue #73 CLOSED.
- CI run `33785403958` SUCCESS: migration, lint, typecheck, 24 test dosyası /
  188 test ve API/web build.

## Taze Phase 8J kanıtı

- PR #46 CI run `33646914245`: SUCCESS — additive migration, lint, typecheck,
  22 test dosyası / 175 test (ölçüm testi 3/3), API ve web build.
- PR #46 squash merge commit `a249724`; GitHub Issue #45 CLOSED.
- Focused Vitest bu OneDrive checkout'ında NOT_RUN: esbuild, reparse-point
  nedeniyle `vitest.config.ts` yolunu okuyamadı. CI entegrasyon testi gerçek
  PostgreSQL container'ında PASS oldu.

## Uygulanan dar kapsam

- ResearchMission için read-only `/research-missions/:id/actions` projection'ı
  eklendi. Aday confidence, bağımsız evidence origin sayısı ve gerçek
  email/phone contact signal eksiklerine göre bounded görevler üretir.
- `VERIFY_CANDIDATE`, `COLLECT_EVIDENCE`, `COLLECT_CONTACT_SIGNAL` ve
  `REVIEW_CANDIDATE_DECISION` reason code/priority ile stable sıralanır; ACCEPTED
  ve REJECTED adaylar dışlanır. Website tek başına contact signal sayılmaz.
- Endpoint hiçbir candidate, ContactPoint, Lead, Activity veya Job yazmaz; dış
  network/AI/send çağrısı yapmaz ve response bunu açık receipt alanlarıyla bildirir.

- SEO/GEO için credential-free `SearchVisibilityAsset` modeli ve additive migration
  eklendi. Canonical URL yalnız HTTPS, credential/query/fragment olmadan kabul
  edilir; title/description/intent/structured-data product guardrail'ları bounded
  ve versioned receipt ile saklanır.
- Private visibility API'si asset create/list, idempotent assetKey reuse, review,
  bağımsız approval ve readiness uçlarını sunar. `DRAFT → IN_REVIEW → APPROVED`
  geçişi zorunludur; provider/indexing kanıtı `NOT_RUN`, execution disabled kalır.
- SEO/GEO katmanı canlı search API, crawler, Search Console, analytics veya AI
  provider çağrısı yapmaz; ham web sayfa içeriğini DB'ye kopyalamaz.

- Gerçek müşteri alıcısı veya serbest içerik kabul etmeyen Resend test-simulation
  adapter'i eklendi. Yalnız provider'ın sabit test adresleri ve sabit sentetik
  konu/gövde kullanılır.
- Provider yürütmesi varsayılan olarak kapalıdır. Yalnız doğrulanmış env
  capability'si; `RESEND_TEST`, explicit enable, API key, from address ve webhook
  secret birlikte mevcutsa test çağrısı oluşturabilir. Public send route yoktur.
- `SendAttempt`, `ProviderWebhookReceipt`, `DeliveryEvent` ve ileride kullanılacak
  `Reply` metadata modeli veri-koruyan migration'larla eklendi. Ham recipient ve secret
  audit tablolarına kopyalanmaz.
- Hazırlık; exact approved revision/content hash, güncel permission/suppression
  gate ve en fazla 23 saatlik approval ile sınırlandırıldı. İdempotency key aynı
  denemede değişmez.
- İmzalı webhook exact raw body üzerinden doğrulanır. Duplicate/unordered event,
  erken webhook/provider-response yarışı ve UNKNOWN/stale dispatch için
  `send_attempt_id` tag + exact test-recipient hash korelasyonu ile güvenli yakınsama vardır.
- İlk provider denemesinde exact versioned request body hash'i set-once receipt olarak
  yazılır. UNKNOWN retry'da config/body değişirse provider çağrısından önce durur;
  Resend'in kalıcı ve eşzamanlı 409 idempotency cevapları ayrı sınıflandırılır.
- Bounce/complaint yalnız test recipient hash'i için global suppression üretir.
  Inbound `email.received` bu aşamada persistent receipt/Reply/iş olayı oluşturmadan
  erken `IGNORED` döner.
- Receipt UPDATE/DELETE işlemleri ve geçersiz SendAttempt durum/receipt yeniden
  yazımları PostgreSQL trigger/constraint katmanında reddedilir.
- Testler explicit `TEST_DATABASE_URL` ister ve yalnız adı test/sandbox/ci içeren
  izole veritabanlarını kabul eder. CI veritabanı `growth_ci_test` olarak ayrıldı.
- Bounded deterministic discovery endpoint'i (`POST /research-missions/:id/discover`)
  HTML-like snapshot'tan sektör, faaliyet, lokasyon, domain ve iletişim sinyallerini
  çıkarır; kaynak metni çalıştırmaz veya ham içerik olarak saklamaz.
- İkinci kaynak endpoint'i (`POST /research-candidates/:id/evidence`) yalnızca nihai
  karardan önce kanıt ekler. Kabul için en az iki farklı source origin zorunludur.
- Additive `Job` modeli; stable idempotency key + canonical payload hash conflict guard,
  `QUEUED → RUNNING → RETRYABLE_FAILED/SUCCEEDED/DEAD_LETTER` durumları ve DB check
  constraint'leri eklendi.
- `FOR UPDATE SKIP LOCKED` ile atomik claim, worker lease, stale crash recovery,
  exponential backoff/max-attempts ve deterministic in-process handler registry
  uygulandı. Handler yoksa iş yalnız retry/dead-letter olur; dış provider çağrısı yoktur.
- Europe/Istanbul takvim günü için additive `ManagementReport` snapshot modeli ve
  idempotent `reportKey` eklendi. Company/Lead/Research/Job/Outreach/Event KPI'ları
  salt aggregate olarak hesaplanır; ham iletişim değerleri rapora girmez.
- `UsageReceipt` yalnız gerçekleşmiş, secret-free provider/model kullanım receipt'i
  kaydeder; stable idempotency + conflict guard, integer token/cost alanları ve
  non-negative DB CHECK'leri vardır. Receipt yoksa AI kullanımı raporda `0` olarak
  görünür; bu kod hiçbir AI/provider çağrısı başlatmaz.
- Private `GET /api/reports/management?date=YYYY-MM-DD` endpoint'i deterministik
  günlük snapshot üretir/reuse eder; malformed date ve credential-shaped metadata
  reddedilir.
- `SocialPlatform`, credential-free `SocialConnection`, `MasterContent` ve
  platform-specific `SocialContentVariant` modelleri additive olarak eklendi.
  OAuth access/refresh token yerine yalnız gelecekteki secret-manager opaque ref'i
  kabul edilir.
- Versioned conservative content-policy validation, deterministic content hash ve
  validation receipt'i eklendi. Human approval helper'ı author/reviewer ayrımını
  zorunlu kılar; DRAFT → IN_REVIEW → APPROVED akışı dış publish olmadan tutulur.
- Provider-neutral `SocialProviderAdapter` interface/registry tanımlandı; kayıtlı
  adapter yoksa 503 döner ve bu fazda connect/refresh/upload/publish çağrısı yoktur.
- Private composer API'si master content create/list, platform variant create/validate,
  review ve bağımsız approval geçişlerini sunar. Approved variant schedule edilince
  yalnız `SOCIAL_PUBLISH` internal Job oluşur; adapter/publish çağrısı yoktur.
- Web composer MVP'si dokuz kanalın policy limitlerini, varyant matrisini, review/
  approval/scheduled durumlarını ve güvenli-mod sınırını görünür kılar; UI provider
  ağına bağlanmaz.
- Connection metadata create/list ve kontrollü lifecycle endpoint'leri eklendi;
  private API `CONNECTED` durumunu dış adapter doğrulaması olmadan üretemez.
- Publish readiness endpoint'i variant, bağlı hesap, adapter ve genel execution
  kapısını birlikte raporlar; hiçbir network çağrısı yapmaz ve publish etkin değilken
  `ready: false` döner.
- Delivery monitor ve UTM attribution receipt sözleşmesi bu fazda ekleniyor;
  provider tarafı teslimat iddiası yapılmadan internal Job durumu ve attribution
  metadata'sı ayrı tutulacak.
- `GROWTH_INTERNAL_API_KEY` production env'de zorunlu hale getirildi. Business
  route'ları constant-time `x-api-key` kontrolüyle korunuyor; health/readiness ve
  imzalı Resend webhook kendi kontrolleriyle ayrı tutuluyor.
- Unified Inbox metadata receipt'i provider dedup anahtarı, sender/thread handle,
  message hash ve alınma zamanı tutar; ham mesaj metni saklanmaz. Intent yalnız
  insan review endpoint'iyle sınıflandırılır; otomatik cevap/DM yoktur.
- Phase 8F sonrası tüm dış provider işlemleri için onboarding kapısı açıldı:
  seçili pilot hesap/platform, exact OAuth scopes, secret-manager/rotation sahibi,
  sandbox/paper sınırı ve rollback/onay kanıtı olmadan adapter implementasyonu veya
  publish etkinleştirilmeyecek.

## Taze yerel kanıt

- Phase 8I `pnpm run lint`: PASS
- Phase 8I `pnpm run typecheck`: PASS
- Phase 8I API build: PASS
- Phase 8I `git diff --check`: PASS
- Phase 8I focused Vitest: NOT_RUN — OneDrive worktree/esbuild reparse-point erişim
  hatası; Docker/DB integration kanıtı bu checkout'ta yok. CI kapısı gereklidir.
- Phase 8I PR #43 CI run `33644782795`: SUCCESS — 21 test dosyası, 172 test,
  migration, lint, typecheck ve API/web build; squash merge `293f782`; Issue #42 CLOSED.

- `prisma validate`: PASS
- `prisma generate`: PASS
- `pnpm run lint`: PASS
- `pnpm run typecheck`: PASS
- `pnpm --filter @growth/api run build`: PASS
- `git diff --check`: PASS
- Phase 8H focused Vitest: NOT_RUN — OneDrive worktree/esbuild reparse-point erişim
  hatası; Docker/DB integration kanıtı da bu checkout'ta mevcut değil. CI kapısı
  yeniden doğrulamalıdır.
- Phase 8H PR #40 CI run `33553751055`: SUCCESS — fresh migration, full 170 tests,
  lint, typecheck ve API/web build; squash merge `e9ef322`; Issue #39 CLOSED.

- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- Odaklı testler: PASS — 31/31; Phase 5 dosyası 17/17
- Tam test paketi (Phase 5 baseline): PASS — 141/141, 12 dosya
- Phase 6 sonrası tam test paketi: PASS — 147/147, 13 dosya
- Prisma validate/generate: PASS
- `pnpm build`: PASS — API + web production build
- Baseline DB: 15 migration up to date; mevcut `Company` sayısı 1 olarak korundu
- Fresh DB: `growth_research_extraction_test_20260901` sıfırdan 16/16 migration PASS;
  research activity kolonları ve `RESEARCH_EVIDENCE_ADDED` event tipi uygulandı.
- Fresh DB: `growth_phase6_queue_test_20260901` sıfırdan 17/17 migration PASS; Job
  tablosu, enum, unique idempotency index ve attempts/maxAttempts CHECK doğrulandı.
- Phase 6 odaklı queue testleri: PASS — 6/6 (idempotency, concurrent SKIP LOCKED
  claim, completion, retry/backoff, dead-letter, stale lease, handler tick).
- Phase 6 PR #22 merge: CI run `33539954625` SUCCESS; squash commit `65abee6`;
  Issue #21 CLOSED.
- Fresh DB: `growth_phase7_reporting_test_20260901` sıfırdan 18/18 migration PASS;
  UsageReceipt/ManagementReport tabloları, unique idempotency index'leri ve CHECK'ler
  uygulandı.
- Phase 7 odaklı raporlama testleri: PASS — 4/4 (Istanbul window, usage receipt
  idempotency/conflict, KPI snapshot reuse, endpoint validation).
- Phase 7 sonrası tam test paketi: PASS — 151/151, 14 dosya; API+web build PASS.
- Phase 7 PR #24 merge: CI run `33541029393` SUCCESS; squash commit `8e07273`;
  Issue #23 CLOSED.
- Phase 8A policy/adapter unit testleri: PASS — 5/5. Docker daemon kapalı olduğu
  için Phase 8A'nın local DB migration/full integration testi henüz çalıştırılamadı;
  bu durum CI kapısında yeniden doğrulanacak.
- Phase 8A PR #26 merge: CI run `33542256835` SUCCESS; squash commit `d399100`;
  Issue #25 CLOSED.
- Phase 8B DB integration testleri Docker daemon kapalı olduğundan localde henüz
  çalıştırılamadı; CI migration/full suite bu eksik kanıtın merge kapısıdır.
- Phase 8B local Vitest ve web build, OneDrive worktree reparse erişim hatası
  (`esbuild` config dizinine erişemiyor) nedeniyle çalıştırılamadı; bu iki
  doğrulama da CI kapısında yeniden koşulmalıdır.
- Phase 8B PR #28 merge: CI run `33543718681` SUCCESS (159 test, lint, typecheck,
  migration ve API/web build); squash commit `03b3374`; Issue #27 CLOSED.
- Phase 8C PR #30 merge: CI run `33544546114` SUCCESS (159 test, lint, typecheck,
  migration ve API/web build); squash commit `1e3b1c8`; Issue #29 CLOSED.
- Phase 8D PR #32 merge: CI run `33545554867` SUCCESS (migration, tests, lint,
  typecheck ve API/web build); squash commit `800e3b5`; Issue #31 CLOSED.
- Phase 8E PR #34 merge: CI run `33546195604` SUCCESS (auth tests, regression,
  lint, typecheck ve API/web build); squash commit `ccc5021`; Issue #33 CLOSED.
- Phase 8F PR #36 merge: CI run `33547278295` SUCCESS (167 test, migration, lint,
  typecheck ve API/web build); squash commit `1ea5883`; Issue #35 CLOSED.
- Phase 5 migration'larında veri/tablo/kolon silme veya yeniden yazma yok. Son
  migration yalnız daha güçlü composite FK'lerin kapsadığı redundant simple FK'leri kaldırır.
- Prisma diff artık yalnız Phase 4'ten gelen iki ek OutreachApproval savunma FK'sini
  gösteriyor; Phase 5 drift'i veya eksik tablo/kolon/constraint önerisi yok
- İki bağımsız salt-okunur güvenlik/migration yeniden incelemesi: blocking
  kritik/yüksek/orta bulgu yok; düşük operasyonel riskler aşağıda açık
- Final `git diff --check`: PASS; high-confidence secret-shaped literal taraması: PASS
- Önceki Phase 5 kodu `eb00ac8`, PR #18 squash merge commit'i
  `7c328413262d130aca0b6e8ddaede873a051a42c` olarak `main`'e alındı. Yeni Issue #3
  dilimi için yerel migration/lint/typecheck/test/build kanıtı hazır; CI/PR kanıtı
  merge öncesi bekleniyor.

## Açık sınırlar

- Bu çalışma gerçek Resend API çağrısı yapmadı; API key, webhook secret, domain,
  SPF/DKIM/DMARC ve gerçek mailbox kurulmadı.
- Discovery endpoint'i gerçek web taraması yapmaz; çağıran worker'ın sağladığı bounded
  public-page snapshot'ını deterministic olarak işler. Bu aşamada AI çağrısı yoktur.
- Gerçek müşteriye/potansiyel müşteriye e-posta gönderilmedi; telefon veya sosyal
  medya hesabına dış aksiyon alınmadı.
- Internal API auth boundary vardır: production'da `GROWTH_INTERNAL_API_KEY` zorunlu,
  business route'lar `x-api-key` ile korunur; bu kullanıcı/rol/SSO sistemi değildir
  ve public veya multi-user deploy için yeterli sayılmaz.
- `Reply` yalnız ilerideki metadata sözleşmesi için ayrılmıştır; inbound reply
  işleme Phase 5'te özellikle kapalıdır.
- Bilinen non-blocking borçlar: Vite 5 CJS Node API uyarısı ve beklenen 4xx
  hatalarının error seviyesinde loglanması.
- GitHub Actions non-blocking annotation: checkout/setup-node/pnpm action'larının
  Node 20 runtime'ı runner tarafından Node 24'e zorlanıyor; workflow sonucu SUCCESS.
- Kalan düşük riskler: test DB koruması isim/protokol kapısıdır (ayrı düşük yetkili
  test credential'ı daha güçlü olur); webhook secret'ın provider endpoint'iyle
  operasyonel eşleşmesi ve inbound event aboneliğinin kapalı oluşu go-live'da ayrıca
  doğrulanmalıdır; stale recovery zamanı kullanıcı girdisine bağlanmamalıdır.

## Sonraki adım

Provider OAuth/publish ve gerçek e-posta/telefon iletişimi için seçili hesap, exact
scope, secret-manager/sandbox sınırı ve açık kullanıcı onayı olmadan dış aksiyon yoktur.
- Derin tarama raporu: `DEEP_SCAN_20260919.md` (F/G/P serileri, 11 dış iddia doğrulaması, yöntem ve sınırlar).
- Plan bölümleri: 13 Toolchain (T0-T10) · 14 doğrulama kayıtları · 15 OWASP eşlemesi · 16 dış araştırma ve boşluklar · 17 UNKNOWN · 18 R fazı (R-1 - R-16) · 19 akademik kaynakça · 20 revizyon kaydı.
