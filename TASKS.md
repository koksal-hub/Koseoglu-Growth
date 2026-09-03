TASKS — Görev listesi formatı ve GitHub Issues senkronizasyonu

================================================================
ÖNEMLİ KURAL
================================================================

GitHub Issues ESAS görev kuyruğudur. Bu dosya GitHub Issues ile ÇELİŞMEZ ve ikinci
bağımsız bir task sistemi değildir — burası yalnızca Issue'ların kısa bir aynası ve
görev formatı referansıdır.

Issue #1 tamamlanmadan (CI PASS + gerçek doğrulama) Issue #2 implementasyonuna
geçilmez.

================================================================
GÖREV FORMATI
================================================================

Her görev şu alanları içermelidir:
- ID: kısa-kebabcased-id
- Başlık: Kısa açıklama
- Öncelik: HIGH / MEDIUM / LOW
- Sorumlu ajan/rol: (Codex / Claude Code / GitHub Copilot / Gemini CLI / Qwen Code)
- Durum: TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE
- Bağımlılıklar: (varsa)
- Acceptance criteria: Net, test edilebilir kabul kriterleri

================================================================
GITHUB ISSUES (AYNA)
================================================================

NOT: Aşağıdaki kayıt GitHub Issues'ın kısa aynasıdır; geçmişte gh erişimi olmayan
oturumların notları korunur. Çelişki halinde GitHub Issue ve güncel CI kanıtı esastır.

--- Issue #1 — Phase 0: Foundation ---
- Öncelik: HIGH
- Sorumlu: Claude Code
- Durum: IN_PROGRESS
- Bağımlılıklar: None
- Acceptance criteria:
  - pnpm install çalışır
  - pnpm lint / typecheck / test / build geçer
  - PostgreSQL Docker Compose ile çalışır
  - /api/health HTTP 200 döner
  - GitHub Actions CI (install→lint→typecheck→test→build) PASS

--- Issue #2 — Data Models (Phase 1) ---
- Öncelik: HIGH
- Sorumlu: Claude Code / Codex review
- Durum: DONE (PR #5 CI PASS sonrası `main` üzerine merge edildi; Issue #2 kapatıldı)
- Bağımlılıklar: Issue #1 DONE olmalı (DONE — CI PASS ile doğrulandı)
- Acceptance criteria:
  - [x] Prisma şemasına çekirdek modeller eklendi: Company, Contact, Lead,
    Activity, FollowUp, Opportunity, Evidence, Event (Source/Channel: ayrı
    tablo yerine Company/Contact/Lead üzerinde SourceChannel enum alanı —
    overengineering'den kaçınıldı)
  - [x] Migration oluşturuldu ve uygulandı (geri alınabilir — yalnızca
    CREATE TABLE/ADD CONSTRAINT, DROP/DELETE yok)
  - [x] Entity Resolution: deterministik normalizasyon + öncelik sıralı
    duplicate detection (tax number → domain → phone → email domain →
    address → normalized name → similarity), 22 unit test ile doğrulandı
  - [x] Event Store: Event modeli (entityType/entityId polimorfik referans,
    metadata JSON) + Evidence modeli (Company/Lead/Event ile ilişkili)
  - [x] GitHub Actions CI PASS (Postgres servisiyle)

--- Issue #2b — Phase 0/1 Hardening (Öncelik 0-4 kapanış planı) ---
- Öncelik: HIGH
- Sorumlu: Devin
- Durum: DONE (PR #5 merge commit `8a6e2ec`)
- Bağımlılıklar: Issue #2
- Acceptance criteria:
  - [x] `.github/workflows/ci.yml` repoda mevcut (Postgres service +
    migrate deploy + lint→typecheck→test→build) — push edildi, önceki
    workflow-scope blocker'ı bu ortamda oluşmadı
  - [x] Graceful shutdown (SIGTERM/SIGINT → server.close + prisma
    $disconnect) + unhandledRejection/uncaughtException handler'ları
  - [x] `/api/health` (liveness) + `/api/ready` (DB `SELECT 1`, düşerse 503)
  - [x] `prisma.ts` doğrulanmamış env fallback'i kaldırıldı
  - [x] Activity "en az bir Lead/Contact" invariant'ı: createActivity helper
    + additive CHECK constraint migration
  - [x] confidence 0..1 CHECK constraint'leri (Company + Evidence, additive)
  - [x] Entity resolution: free-email blacklist (EMAIL_DOMAIN skip) + PHONE
    düşük güvenli destekleyici sinyal (0.5, öncelik sırası düşürüldü)
  - [x] Nullable email + unique bypass edge-case'i şemada dokümante + testle
    sabitlendi
  - [x] Negatif testler (Activity invariant, aralık dışı confidence, gmail
    EMAIL_DOMAIN eşleşmemesi, ortak telefon) — test sayısı 31 → 44
  - [x] Frontend test altyapısı (vitest + jsdom + RTL, App smoke testi)
  - [x] Frontend düzeltmeleri: lang="tr", #root null guard, vite dev proxy
  - [x] Konfig tutarlılığı: workspaces tek kaynak, engines/packageManager/
    .nvmrc, LOG_LEVEL + CORS_ORIGINS senkronu, env şeması sertleştirme,
    helmet/cors/rate-limit, docker-compose (db+migrate+api) çalışır durumda
  - [x] GitHub Actions CI PASS (PR #5, `build` job'ı yeşil)
- NOT: İyileştirme maddeleri (22-26: central logging, ER ölçeklenebilirlik,
  hata sözleşmesi + metrics, coverage threshold, frontend MVP) ayrı
  PR'larda ele alınacak.

--- İyileştirme 22 — Central Logging ---
- Öncelik: HIGH
- Sorumlu: Codex review
- Durum: DONE (PR #6; GitHub Actions run `33472791803` PASS; merge `2f6f11a`)
- Bağımlılıklar: Issue #2 DONE
- Acceptance criteria:
  - [x] Her istekte correlation id var ve response `x-request-id` başlığında dönüyor
  - [x] Dış request id yalnız sınırlı, log-safe sözleşmeyi sağlarsa kabul ediliyor
  - [x] Authorization, cookie, x-api-key ve set-cookie gerçek log çıktısında maskeleniyor
  - [x] Pino doğrudan bağımlılığı Fastify logger tipiyle aynı major sürümde
  - [x] İzole DB üzerinde lint/typecheck/test (56/56)/build PASS
  - [x] GitHub Actions CI PASS ve PR #6 merge

--- Issue #3 — Research / Verification / Evidence (Phase 2) ---
- Öncelik: MEDIUM
- Sorumlu: Codex
- Durum: DONE (PR #20 CI run `33538344289` PASS; squash merge `805fd45`;
  Issue #3 kapalı)
- Bağımlılıklar: Issue #2 DONE olmalı
- Acceptance criteria:
  - [x] Manuel/fixture tabanlı Company Discovery iskeleti çalışır
  - [x] Mission → candidate → evidence → human decision temel akışı var
  - [x] Confidence Gate düşük güvenli adayın kabulünü ve Lead üretimini engeller
  - [x] Evidence Store'a URL/accessedAt/summary/confidence/provenance kaydı yapılır
  - [x] Dış özet untrusted data kalır; credential/secret taşıyan kaynak URL reddedilir
  - [x] Deterministik duplicate önerisi insan onaylı kanonik bağdan ayrıdır
  - [x] Yerel migration/lint/typecheck/test (71/71)/build PASS
  - [x] İlk dikey dilim için GitHub Actions CI PASS ve PR #7 merge (`4978d2f`)
  - [x] Bounded deterministic sector/activity/location/contact-signal extraction
    (`POST /research-missions/:id/discover`); dış içerik untrusted data olarak kalır
  - [x] İkinci kaynak politikası: farklı source origin sayımı ve ACCEPT öncesi en az
    iki bağımsız kaynak; kanıt ekleme endpoint'i ile regresyon testi
  - [x] Bu dilimde AI çağrısı yapılmadı; discovery event metadata'sında
    `extractionMethod=deterministic`, `aiUsed=false` açıkça kayıtlı

--- Issue #8 — ContactPoint, Permission ve Suppression Gate (Phase 2b) ---
- Öncelik: HIGH
- Sorumlu: Codex
- Durum: DONE (PR #9; run `33476774205` PASS; squash merge `4272840`;
  Issue #8 completed/closed)
- Bağımlılıklar: Issue #3 Research Mission ilk dikey dilimi merge edilmiş olmalı
- Acceptance criteria:
  - [x] Şirket genel ve kişi iş/personal iletişim noktaları ayrı sınıflanır
  - [x] Kaynak, toplama zamanı, verification receipt, confidence ve retention zorunlulukları
  - [x] E-posta normalizasyonu ve sıkı E.164 telefon doğrulaması
  - [x] Public kaynağın iletişim izni sayılmaması; `UNKNOWN`/unverified deny
  - [x] Ülke, kanal, amaç, veri dayanağı ve iletişim kuralı ayrı receipt olarak saklanır
  - [x] Global opt-out/suppression normalize alıcı hash'iyle bypass edilemez
  - [x] Verified + reviewed ALLOWED için dry-run gate; gerçek gönderim yok
  - [x] Additive migration temiz disposable DB'ye sıfırdan uygulandı
  - [x] Odaklı API/DB regresyonları PASS (26/26)
  - [x] Tam lint/typecheck/test (97/97)/build ve güvenlik/veri taraması PASS
  - [x] GitHub Actions CI PASS ve PR #9 merge

--- Issue #11 — Deterministic Ranking ve Daily Action API (Phase 3) ---
- Öncelik: HIGH
- Sorumlu: Codex
- Durum: DONE (PR #12 CI PASS sonrası `main` üzerine `8d47703` ile merge edildi;
  Issue #11 kapatıldı)
- Bağımlılıklar: Issue #8 DONE
- Acceptance criteria:
  - [x] Aynı kanonik input + policy version aynı input hash/score/receipt üretir
  - [x] Beş bileşen 0..20, total 0..100 ve exact sum DB constraint ile korunur
  - [x] Stale/unknown/low-confidence/future/90 günden eski evidence puan vermez
  - [x] Public/unverified veya permission'sız contact outreach-ready sayılmaz
  - [x] Global suppression terminal `HONOR_SUPPRESSION` aksiyonu üretir
  - [x] Reason/evidence/contact/gate source-time receipt'i ve algorithm/policy version saklanır
  - [x] Daily Action sonuçları score + deterministic name/id tie-breaker ile sıralanır
  - [x] Otomatik Lead/Activity/Outreach/send/provider çağrısı yoktur
  - [x] Temiz DB'de beş migration; Prisma/lint/typecheck; odaklı 9/9; tam 106/106; build PASS
  - [x] GitHub Actions CI PASS (run `33478818433`) ve PR #12 merge

--- Issue #14 — Outreach Draft ve Bağımsız İnsan Onayı (Phase 4) ---
- Öncelik: HIGH
- Sorumlu: Codex
- Durum: DONE (commit `93a5022`; PR #15 run `33482197125` PASS sonrası
  `main` üzerine `39699eb` ile merge edildi; Issue #14 kapatıldı)
- Bağımlılıklar: Issue #11 DONE
- Acceptance criteria:
  - [x] Yalnız güncel `READY_FOR_HUMAN_OUTREACH_REVIEW` ranking receipt'i draft açar
  - [x] Recipient snapshot ham değer yerine pseudonymous SHA-256 hash taşır
  - [x] İnsan-yazarlı içerik revision/content hash geçmişi append-only korunur
  - [x] `DRAFT → IN_REVIEW → APPROVED | REJECTED | EXPIRED` geçişleri uygulanır
  - [x] Review ve karar anında permission/policy/suppression gate yeniden çalışır
  - [x] İçerik yazarlarının hiçbiri approval kararı veremez
  - [x] Approval hash'i DB foreign key'iyle exact revision'a bağlanır
  - [x] Provider/send/Lead/Activity yok; approval dahi `sendAuthorized=false`
  - [x] Sekiz migration temiz DB'ye sıfırdan uygulandı; 29 constraint/FK + 3 trigger doğrulandı
  - [x] Prisma/lint/typecheck; odaklı 10/10; tam 116/116; API+web build PASS
  - [x] GitHub Actions CI PASS (run `33482197125`) ve PR #15 merge (`39699eb`)

--- Issue #17 — Resend Test Sandbox, Send Attempts ve Signed Webhook Receipts (Phase 5) ---
- Öncelik: HIGH / RISK C
- Sorumlu: Codex; iki bağımsız salt-okunur güvenlik/veri incelemesi zorunlu
- Durum: DONE (PR #18 run `33534095475` PASS; squash merge `7c328413`; Issue #17 kapalı)
- Bağımlılıklar: Issue #14 DONE; gerçek müşteri iletişimi için ayrıca açık kullanıcı onayı
- Acceptance criteria:
  - [x] Gerçek müşteri adresi/içeriği kabul etmeyen sabit Resend test-simulation adapter'i
  - [x] Default-disabled ve doğrulanmış env capability'sine bağlı yürütme; public send route yok
  - [x] Approved exact revision/hash + current permission/suppression gate yeniden kontrolü
  - [x] Stable idempotency key, UNKNOWN sonucu ve stale dispatch recovery
  - [x] Exact provider payload hash set-once; config/body değişen retry provider öncesi bloklanır
  - [x] Kalıcı `invalid_idempotent_request` ile retryable concurrent 409 ayrımı
  - [x] Exact raw body ile signed webhook doğrulaması; duplicate/unordered event koruması
  - [x] Erken webhook/provider-response yarışında tag + exact test-recipient korelasyonu
  - [x] Bounce/complaint yalnız test recipient için suppression üretir
  - [x] Inbound `email.received` persistent receipt/Reply/business event oluşturmaz
  - [x] Receipt UPDATE/DELETE, SendAttempt DELETE ve invalid state rewrite DB guard'ları
  - [x] PostgreSQL + ayrık test/sandbox/ci DB adı zorunluluğu
  - [x] Canonical PREPARED INSERT ve null-safe durum şekli DB guard'ları
  - [x] 15 migration hem mevcut veriyi koruyarak hem sıfırdan PASS
  - [x] Prisma/lint/typecheck; odaklı 31/31; tam test 135/135 PASS
  - [x] API+web build ve iki bağımsız yeniden inceleme; blocking bulgu yok
  - [x] Final diff/secret scan
  - [x] Commit `eb00ac8`, push, PR #18 ve GitHub Actions run `33534095475` PASS
  - [x] Risk C `main` merge için kullanıcı açık onayı alındı; PR #18 `main`'e merge edildi
- Kapsam dışı: gerçek provider çağrısı, secret/domain kurulumu, müşteri e-postası,
  inbound reply işleme, auth/public deploy ve sosyal hesap yayını.

--- Issue #21 — Durable Queue, Worker, Scheduler ve Crash Recovery (Phase 6) ---
- Öncelik: HIGH
- Sorumlu: Codex
- Durum: DONE (PR #22 CI run `33539954625` PASS; squash merge `65abee6`;
  Issue #21 kapalı)
- Bağımlılıklar: Issue #17 DONE; gerçek dış provider işlemleri hâlâ kapsam dışı
- Acceptance criteria:
  - [x] Additive PostgreSQL `Job` modeli ve açık durum geçişleri
  - [x] Canonical JSON payload hash'i ile stable idempotency key; aynı key'de
    farklı payload/type 409 conflict
  - [x] `FOR UPDATE SKIP LOCKED` atomik claim ve worker lease sahipliği
  - [x] Exponential backoff, max-attempts, retryable failure ve dead-letter
  - [x] Stale lease crash recovery; attempt sayısı sessizce sıfırlanmaz
  - [x] Deterministic in-process handler registry ve scheduler tick; provider,
    müşteri, sosyal medya veya e-posta dış aksiyonu yok
  - [x] Disposable DB migration, lint/typecheck ve queue regression 6/6 PASS
  - [x] Tam test/build, secret scan, PR CI PASS ve Issue #21 kapanışı

--- Issue #23 — Reporting, Observability ve Cost Attribution (Phase 7) ---
- Öncelik: HIGH
- Sorumlu: Codex
- Durum: DONE (PR #24 CI run `33541029393` PASS; squash merge `8e07273`;
  Issue #23 kapalı)
- Bağımlılıklar: Issue #21 DONE; auth/public deploy hâlâ kapsam dışı
- Acceptance criteria:
  - [x] Europe/Istanbul günlük window ve additive idempotent `ManagementReport`
  - [x] Company/Lead/Research/Job/Outreach/Event aggregate KPI'ları; raw contact
    değerleri raporlanmıyor
  - [x] Secret-free `UsageReceipt` ledger'ı; token/cost integer CHECK'leri ve
    idempotency conflict guard
  - [x] Receipt yoksa AI kullanımı `0`; provider/AI çağrısı başlatılmıyor
  - [x] Private management report endpoint'i ve invalid date/metadata reddi
  - [x] Fresh disposable DB 18/18 migration ve odaklı reporting 4/4 PASS
  - [x] Tam test/build, secret scan, PR CI PASS ve Issue #23 kapanışı

--- Issue #25 — Social Command Center Foundation (Phase 8A, safe/no provider) ---
- Öncelik: HIGH / RISK C
- Sorumlu: Codex
- Durum: DONE (PR #26 CI run `33542256835` PASS; squash merge `d399100`;
  Issue #25 kapalı)
- Bağımlılıklar: Issue #23 DONE; gerçek OAuth veya publish için ayrıca açık onay
- Acceptance criteria:
  - [x] Dokuz hedef platform için enum ve credential-free SocialConnection metadata
  - [x] MasterContent + platform-specific SocialContentVariant + stable publish key
  - [x] Versioned deterministic content policy/hash/validation receipt
  - [x] Human approval status transition ve author != reviewer guard
  - [x] Provider-neutral adapter interface/registry; concrete network adapter yok
  - [x] Credential-shaped media/scopes ve token değerleri reddediliyor
  - [x] Local unit policy tests 5/5; lint/typecheck PASS
  - [x] Fresh DB migration, full test/build, CI PASS ve Issue #25 kapanışı

--- Issue #27 — Social Composer, Approval API ve Publish-Job Scheduling (Phase 8B) ---
- Öncelik: HIGH / RISK C
- Sorumlu: Codex
- Durum: DONE (PR #28 CI run `33543718681` PASS; squash merge `03b3374`;
  Issue #27 kapalı)
- Bağımlılıklar: Issue #25 DONE; gerçek provider/publish için ayrıca açık onay
- Acceptance criteria:
  - [x] Private master content create/list ve review/approval endpoint'leri
  - [x] Platform variant validation, content hash ve idempotency API'si
  - [x] Author != reviewer approval guard ve açık status geçişleri
  - [x] Approved schedule yalnız `SOCIAL_PUBLISH` Job enqueue eder; network yok
  - [x] Web composer MVP dokuz platform ve safe-mode sınırını gösterir
  - [x] API/web typecheck ve lint kanıtı; local DB kanıtı Docker yokluğu nedeniyle
    açıkça NOT_RUN
  - [x] Phase 8B UI/API unit testleri ve web build CI'da PASS (159 test)
  - [x] Fresh DB migration, full test/build, CI PASS ve Issue #27 kapanışı

--- Issue #29 — Social Connection Lifecycle ve Fail-Closed Publish Gate (Phase 8C) ---
- Öncelik: HIGH / RISK C
- Sorumlu: Codex
- Durum: DONE (PR #30 CI run `33544546114` PASS; squash merge `1e3b1c8`;
  Issue #29 kapalı)
- Bağımlılıklar: Issue #27 DONE; gerçek provider/OAuth için ayrıca açık onay
- Acceptance criteria:
  - [x] Credential-free connection metadata create/list endpoint'leri
  - [x] Kontrollü status transition; private route `CONNECTED` üretemez
  - [x] Publish readiness bütün blocker'ları raporlar ve execution disabled iken
    daima `ready: false` döner
  - [x] Credential-shaped scopes/ref input persistence öncesi reddedilir
  - [x] Fresh DB migration, full test/build, CI PASS ve Issue #29 kapanışı

--- Issue #31 — Social Delivery Monitor ve UTM Attribution Receipt (Phase 8D) ---
- Öncelik: HIGH / RISK C
- Sorumlu: Codex
- Durum: DONE (PR #32 CI run `33545554867` PASS; squash merge `800e3b5`;
  Issue #31 kapalı)
- Bağımlılıklar: Issue #29 DONE; gerçek provider/site analytics için ayrıca açık onay
- Acceptance criteria:
  - [x] Internal SOCIAL_PUBLISH job ve variant state için provider-unverified delivery view
  - [x] HTTPS destination + UTM validation ve credential-shaped query rejection
  - [x] Immutable/idempotent attribution receipt; farklı payload conflict
  - [x] Attribution metadata ham ziyaret/lead/quote/satış iddiası oluşturmaz
  - [x] Fresh DB migration, full test/build, CI PASS ve Issue #31 kapanışı

--- Issue #33 — Fail-Closed Internal API Authentication Boundary (Phase 8E) ---
- Öncelik: HIGH / RISK A
- Sorumlu: Codex
- Durum: DONE (PR #34 CI run `33546195604` PASS; squash merge `ccc5021`;
  Issue #33 kapalı)
- Bağımlılıklar: Business API'leri public/multi-user deploy edilmeden önce auth zorunlu
- Acceptance criteria:
  - [x] Production env'de `GROWTH_INTERNAL_API_KEY` yoksa startup validation fail
  - [x] Configured key için constant-time `x-api-key` kontrolü ve 401/403 ayrımı
  - [x] Development/test key'siz local uyumluluk; CORS preflight bloklanmıyor
  - [x] Health/readiness ve signed Resend webhook istisnaları korunuyor
  - [x] Auth unit tests, full CI PASS ve Issue #33 kapanışı

--- Issue #35 — Safe Unified Inbox Receipts ve Human Classification (Phase 8F) ---
- Öncelik: HIGH / RISK B
- Sorumlu: Codex
- Durum: DONE (PR #36 CI run `33547278295` PASS; squash merge `1ea5883`;
  Issue #35 kapalı)
- Bağımlılıklar: Issue #33 DONE; provider inbox/DM için ayrıca açık onay
- Acceptance criteria:
  - [x] Metadata-only inbound receipt; raw message body persistence yok
  - [x] Platform/account/external message key ile duplicate receipt idempotency
  - [x] Human classification: LEAD/CUSTOMER/QUESTION/COMPLAINT/SPAM/OTHER
  - [x] Credential-shaped sender/key input rejection
  - [x] Fresh DB migration, full test/build, CI PASS ve Issue #35 kapanışı

--- Issue #37 — Provider OAuth Onboarding ve Pilot Approval Gate (Phase 8G) ---
- Öncelik: HIGH / RISK A
- Sorumlu: Codex + kullanıcı explicit approval
- Durum: WAITING_APPROVAL (kod/publish başlamaz)
- Bağımlılıklar: Seçili provider hesabı, exact scopes, secret-manager ve sandbox/paper sınırı
- Acceptance criteria:
  - [ ] Hesap/platform sahipliği ve pilot kapsamı yazılı olarak onaylandı
  - [ ] Güncel provider API/policy, rate limit ve app review koşulları doğrulandı
  - [ ] Secret-manager ref/rotation/expiry sahibi belirlendi; token DB/log/job payload'a girmez
  - [ ] Sandbox/paper adapter contract testleri ve rollback/delivery monitor hazır
  - [ ] Ayrı go-live kararı olmadan live publish/DM/customer contact disabled

--- Issue #39 — SEO/GEO Visibility Asset Contract (Phase 8H) ---
- Öncelik: HIGH / RISK B
- Sorumlu: Codex
- Durum: DONE (PR #40 CI `33553751055` PASS; squash merge `e9ef322`; Issue #39 kapalı)
- Bağımlılıklar: Phase 8 sosyal güvenlik/auth sınırları; dış provider için ayrıca explicit approval
- Acceptance criteria:
  - [x] HTTPS canonical URL, locale, title/description ve target intent validator'ı
  - [x] Credential-shaped structured metadata ve query/tracking URL reddi
  - [x] Additive `SearchVisibilityAsset` migration ve idempotent assetKey sözleşmesi
  - [x] `DRAFT → IN_REVIEW → APPROVED` ve author != reviewer guard'ı
  - [x] Readiness açıkça `NOT_RUN` / execution disabled döner; search provider çağrısı yok
  - [x] Lint, typecheck, focused tests, build ve CI kanıtı

--- Issue #42 — Deterministic Research Mission Action Queue (Phase 8I) ---
- Öncelik: HIGH / RISK B
- Sorumlu: Codex
- Durum: DONE (PR #43 CI `33644782795` PASS; squash merge `293f782`; Issue #42 kapalı)
- Bağımlılıklar: ResearchMission / Evidence / ContactPoint safety gates
- Acceptance criteria:
  - [x] Active/paused mission için bounded action listesi döner
  - [x] PROPOSED/NEEDS_MORE_EVIDENCE adaylarına deterministic action üretir; final adayları dışlar
  - [x] İki bağımsız kaynak, confidence ve email/phone contact-signal eksikleri reason code üretir
  - [x] Stable priority + candidate id sıralaması ve limit validation vardır
  - [x] Dış network/AI/send/Lead/Activity write yoktur
  - [x] Focused regression, lint, typecheck, build ve CI kanıtı raporlanır

================================================================
ISSUE OLUŞTURMA KOMUTLARI (gh CLI mevcut olduğunda)
================================================================

gh issue create --title "Phase 0: Foundation" --body-file .github/ISSUE_1_BODY.md
gh issue create --title "Data Models (Phase 1)" --body-file .github/ISSUE_2_BODY.md
gh issue create --title "Research / Verification / Evidence (Phase 2)" --body-file .github/ISSUE_3_BODY.md

================================================================
YEREL KISA LİSTE (geçmiş kayıt — korunuyor)
================================================================

- foundation-scaffold (DONE) — temel dosyalar oluşturuldu
- toolchain-fixes (IN_PROGRESS) — lint/typecheck düzenlemeleri
- git-root-fix (DONE, 2026-08-13) — .git yanlış iç içe klasördeydi, köke taşındı

Yeni görev eklerken bu dosyaya bir satır ve detay açıklaması ekleyin (yalnızca
GitHub Issue'ların aynası olarak; çelişki durumunda GitHub Issue esastır).

--- Issue #45 — Research application: measurement and recommendation exposure lineage ---
- Öncelik: HIGH / MUST / RISK B
- Sorumlu: Codex
- Durum: DONE (PR #46 CI run `33646914245` PASS; squash merge `a249724`; Issue #45 kapalı)
- Bağımlılıklar: Phase 8I research action projection; ranking receipt; auth boundary
- Acceptance criteria:
  - [x] `RecommendationExposure` migration ve private create/list API'si
  - [x] `RecommendationOutcome` ayrı, idempotent ve conflict-guarded API'si
  - [x] recommendation type/id, algorithm/input hash, mode, position, actor/time
    lineage'ı ve unknown outcome sınırı
  - [x] Gerçek provider, network, customer contact veya otomatik exploration yok
  - [x] Araştırma uygulama planı ve ADR-028 ile kaynakların kanıt/proposal ayrımı
  - [x] Lint, typecheck, migration, full test ve API/web build CI kanıtı

--- Issue #48 — Management report recommendation funnel ---
- Öncelik: HIGH / MUST / RISK B
- Sorumlu: Codex
- Durum: DONE (PR #49 CI run `33648922655` PASS; squash merge `7ebe663`; Issue #48 kapalı)
- Bağımlılıklar: RecommendationExposure/Outcome measurement contract; ManagementReport
- Acceptance criteria:
  - [x] Günlük report metrics içinde exposure/outcome toplamları
  - [x] Recommendation type, mode ve outcome type kırılımları
  - [x] `exposuresWithoutOutcomes` unknown/not recorded olarak korunur
  - [x] Yeni alanlar snapshot input hash ve idempotent reuse davranışına dahildir
  - [x] Dış provider/customer/social action veya otomatik exploration yok
  - [x] Regression, lint, typecheck, migration ve API/web build CI kanıtı

--- Issue #51 — Read-only customer lifecycle signal projection ---
- Öncelik: MEDIUM / V2 / RISK B
- Sorumlu: Codex
- Durum: DONE (PR #52 CI run `33680946827` PASS; squash merge `e862e08`; Issue #51 kapalı)
- Bağımlılıklar: Company/Lead/Opportunity/Activity; existing auth boundary
- Acceptance criteria:
  - [x] Bounded NEW/DEVELOPING/REPEAT/COOLING/DORMANT/REACTIVATED projection
  - [x] Read-only `/api/companies/:id/lifecycle` endpoint'i
  - [x] High-value için currency/threshold policy yoksa NOT_CLASSIFIED
  - [x] Lead metadata timestamp'i interaction sayılmaz; reactivation gap regression
  - [x] Canonical state write, dış CRM/provider/customer contact yok
  - [x] Regression, lint, typecheck, migration ve API/web build CI kanıtı

--- Issue #54 — Expand lifecycle projection regression matrix ---
- Öncelik: LOW / V2 / RISK B
- Sorumlu: Codex
- Durum: DONE (PR #55 CI run `33681822535` PASS; squash merge `22bb643`; Issue #54 kapalı)
- Acceptance criteria:
  - [x] DEVELOPING, COOLING ve DORMANT deterministic regression vakaları
  - [x] Read-only davranış ve mevcut güvenlik sınırları korunur
  - [x] Lint, typecheck, migration, 23 test dosyası / 182 test ve build CI kanıtı

--- Issue #57 — Structured outcome provenance for CRM attribution ---
- Öncelik: HIGH / MUST / RISK B
- Sorumlu: Codex
- Durum: DONE (PR #58 CI run `33682847191` PASS; squash merge `8e8782b`; Issue #57 kapalı)
- Bağımlılıklar: RecommendationOutcome measurement contract; auth boundary
- Acceptance criteria:
  - [x] Opsiyonel pairwise `sourceType/sourceId` alanları ve additive migration
  - [x] CRM lead/opportunity/event, human note ve operations record türleri
  - [x] Provenance alanları idempotency/conflict karşılaştırmasına dahil
  - [x] Source ID lookup, otomatik linking, yeni kayıt veya dış action yok
  - [x] Regression, lint, typecheck, migration ve API/web build CI kanıtı

--- Issue #60 — Local source existence gate for outcome provenance ---
- Öncelik: HIGH / MUST / RISK B
- Sorumlu: Codex
- Durum: DONE (PR #61 CI run `33685338110` PASS; squash merge `a9ca90a`; Issue #60 kapalı)
- Bağımlılıklar: RecommendationOutcome structured provenance; local CRM models
- Acceptance criteria:
  - [x] CRM lead/opportunity/event sourceId local existence validation
  - [x] Missing source 404; existing idempotent receipt reuse remains stable
  - [x] Human note/operations metadata remains lookup-free
  - [x] Automatic linking, external lookup, new record or customer action yok
  - [x] Regression, lint, typecheck, migration ve API/web build CI kanıtı

--- Issue #63 — Human-approved recommendation outcome provenance ---
- Öncelik: HIGH / MUST / RISK B
- Sorumlu: Codex
- Durum: DONE (PR #64 CI `33689347614` PASS; squash merge `3e5ecb5`; Issue #63 kapalı)
- Bağımlılıklar: RecommendationOutcome structured provenance; local source existence gate; auth boundary
- Acceptance criteria:
  - [x] Additive immutable RecommendationOutcomeProvenanceReview receipt ve migration
  - [x] Yalnız CRM lead/opportunity/event kaynakları review edilebilir
  - [x] Review anında local source existence tekrar doğrulaması
  - [x] `recordedBy` ile bağımsız reviewer ve APPROVED/REJECTED kararı
  - [x] `reviewKey` idempotency/conflict ve outcome başına tek review
  - [x] HUMAN_NOTE/OPERATIONS_RECORD metadata-only; dış lookup/linking/provider/customer action yok
  - [x] Migration, 23 test dosyası / 182 test, lint, typecheck ve API/web build CI kanıtı

--- Issue #66 — Provenance review quality metrics ---
- Öncelik: HIGH / MUST / RISK B
- Sorumlu: Codex
- Durum: DONE (PR #67 CI `33780845257` PASS; squash merge `7de1757`; Issue #66 kapalı)
- Bağımlılıklar: ManagementReport; RecommendationOutcome; provenance review receipt
- Acceptance criteria:
  - [x] Raw recommendation outcome toplamları değişmeden korunur
  - [x] Review receipt sayısı `reviewedAt` ile ve karar kırılımıyla raporlanır
  - [x] CRM outcome'ları `occurredAt` ile APPROVED/REJECTED/WITHOUT_REVIEW ayrılır
  - [x] HUMAN_NOTE/OPERATIONS_RECORD CRM kalite kovalarından dışlanır
  - [x] Eksik review approval sayılmaz; snapshot hash ve idempotent reuse korunur
  - [x] Migration, 23 test dosyası / 182 test, lint, typecheck ve API/web build CI kanıtı

--- Issue #71 — Contact signal quality metrics ---
- Öncelik: HIGH / MUST / RISK B
- Sorumlu: Codex
- Durum: IN_PROGRESS (kod/test hazır; CI ve merge bekleniyor)
- Bağımlılıklar: ContactPoint/CommunicationPermission safety gate; ManagementReport
- Acceptance criteria:
  - [x] `collectedAt` penceresinde contact point toplamı ve EMAIL/PHONE kırılımı
  - [x] `verifiedAt` penceresinde doğrulama kararları ve VERIFIED kalite sayısı
  - [x] Toplanan noktaların verification status kırılımı
  - [x] `checkedAt` penceresinde izin toplamı ve dört izin durumu kırılımı
  - [x] Ham e-posta/telefon değerleri ve secret'lar report payload'ına girmez
  - [x] Crawler/provider/OAuth/send/lead/customer action yok
  - [x] Regression, lint, typecheck, migration ve API/web build CI kanıtı
