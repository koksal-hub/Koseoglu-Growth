# STATUS — Kısa, güncel durum

last_update: 2026-09-01T21:12:00+03:00
last_actor: Codex (Issue #25 social foundation)

CURRENT PHASE: PHASE 8A SOCIAL COMMAND CENTER FOUNDATION — CI/REVIEW GATE
ACTIVE ISSUE: #25 — Social Command Center foundation (safe/no provider)
ACTIVE BRANCH: `codex/phase8-social-foundation-v1` (`main` `8e07273` tabanı)

## Uygulanan dar kapsam

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

## Taze yerel kanıt

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
- Authentication/authorization hâlâ yoktur. Business API'leri private/local
  geliştirme sınırındadır; public veya multi-user deploy edilemez.
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

Issue #25 için fresh DB migration/full integration testi, CI ve PR merge kapısını
tamamla. Gerçek OAuth/token refresh, medya yükleme, sosyal yayın/DM, AI çağrısı,
Resend API çağrısı, müşteri gönderimi, inbound reply, auth/public deploy hâlâ
kapsam dışıdır; bunlar ayrı açık güvenlik/operasyon onayı gerektirir.
