# STATUS — Kısa, güncel durum

last_update: 2026-09-02T17:50:00+03:00
last_actor: Codex (Issue #42 research action projection)

CURRENT PHASE: PHASE 8I DETERMINISTIC RESEARCH ACTION QUEUE (SAFE MODE)
ACTIVE ISSUE: #42 — Deterministic research mission action queue
ACTIVE BRANCH: `codex/phase8i-research-action-queue-v1` (`origin/main` `bfd7c88` tabanı)

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

Issue #42 için CI ve read-only araştırma projection kanıtı bekleniyor. Provider
OAuth/publish ve gerçek e-posta/telefon iletişimi için seçili hesap, exact scope,
secret-manager/sandbox sınırı ve açık kullanıcı onayı olmadan dış aksiyon yoktur.
