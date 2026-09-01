# STATUS — Kısa, güncel durum

last_update: 2026-09-01T20:27:49+03:00
last_actor: Codex (Issue #3 deterministic discovery extraction)

CURRENT PHASE: PHASE 2 RESEARCH EXTRACTION — CI/REVIEW GATE
ACTIVE ISSUE: #3 — Research, Verification ve Evidence pipeline
ACTIVE BRANCH: `codex/research-extraction-v2` (`main` `3991d33` tabanı)

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

## Taze yerel kanıt

- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- Odaklı testler: PASS — 31/31; Phase 5 dosyası 17/17
- Tam test paketi: PASS — 141/141, 12 dosya
- Prisma validate/generate: PASS
- `pnpm build`: PASS — API + web production build
- Baseline DB: 15 migration up to date; mevcut `Company` sayısı 1 olarak korundu
- Fresh DB: `growth_research_extraction_test_20260901` sıfırdan 16/16 migration PASS;
  research activity kolonları ve `RESEARCH_EVIDENCE_ADDED` event tipi uygulandı.
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

Issue #3 değişiklikleri için migration/lint/typecheck/test/build CI'sini, bağımsız
güvenlik/veri incelemesini ve PR merge kapısını tamamla. Gerçek web crawler, AI çağrısı,
Resend API çağrısı, müşteri gönderimi, inbound reply, auth/public deploy veya sosyal
hesap yayını hâlâ kapsam dışıdır; bunlar ayrı faz ve onay gerektirir.
