# Köseoğlu Growth — 2026 Program Planı

Durum: PLAN (uygulama onayı bekliyor) · Son güncelleme: 2026-09-19
Kanonik klon: C:\Users\KOKSAL\Koseoglu-Growth (OneDrive kopyası bayat, kullanılmaz)
Kural: .cline/rules/20-koseoglu-growth-2026-gates.md · Politika: OUTREACH_COMPLIANCE_POLICY.md

## 1. Amaç ve North Star bağlantısı

North Star: "Kârlı yeni müşteri + net kâr." Program, kâr ölçülebilir hale gelmeden (L6)
bitmiş sayılmaz. Bu plan bir uygulama sırasıdır; MASTER_PLAN.md'yi veya güvenlik/onay
kararlarını tek başına değiştirmez.

## 2. Kanıtlanmış mevcut durum (derin tarama, 2026-09-19)

Not: Bu bölüm ilk kez 2026-09-19 sabah taramasıyla yazıldı. Aşağıdaki değerler
**PR-C merge sonrası (main 7840c35) truth refresh** ile doğrulanmıştır; sabahki
"main=67ca039 / PR #82 OPEN / .env YOK / 23 test dosyası" iddiaları artık geçersizdir.

- Veri modeli: 33 model + **47 enum**; prisma/schema.prisma **1323 satır**;
  **57 endpoint** (24 GET / 33 POST, 14 route dosyası); ADR'ler bu planın §7 listesindedir
  (ayrı ADR dosyası/dizini yok — docs/ mevcut değil).
- Test: **31 API test dosyası + 1 web testi (apps/web/src/App.test.tsx) = 32 dosya / 226 test PASS**
  (PR-C öncesi 31/221).
- Git: **main = origin/main = 7840c35** (PR #85 squash); PR #82 / #83 / #84 / #85 MERGED;
  PR #81 CLOSED ("superseded by #82", 2026-09-19T12:57:22Z); PR #4 OPEN (karar bekliyor);
  açık Issue yok. Yerel dal temiz sayılır: yalnız doküman kirliliği (STATUS.md,
  REMAINING_ROADMAP_PLAN.md, Claude outputs/, DEEP_SCAN_20260919.md, bu plan,
  OUTREACH_COMPLIANCE_POLICY.md).
- Migration truth (PR-C sonrası): **27 migration** (26 commit'li + `20260919130000_pin_recommendation_exposure_index_name`);
  fresh replay **27/27**; upgrade replay **26 → 27**; `migrate diff` (DB → schema) **empty**
  = zero unexpected drift; `OutreachApproval` üzerinde **5 FK** (2 composite invariant dahil:
  `OutreachApproval_revision_belongs_to_draft_fkey`, `OutreachApproval_content_matches_revision_fkey`);
  RecommendationExposure lookup index adı **`rec_exposure_lookup_idx`** (23 bayt) olarak sabitlendi.
- Yazma yolu hâlâ yok: Lead/Activity/FollowUp/Opportunity yalnız okunuyor;
  lib/research.ts:585 createdLead:false; tek yazma tx.company.create (research.ts:534).
- **Runtime boş:** startJobScheduler (lib/job-queue.ts:264) hâlâ hiç çağrılmıyor;
  registerJobHandler çağrısı yok → **job created ≠ job executed** (bkz. §21 SYS-7).
- Web API'ye bağlı değil: apps/web/src/App.tsx statik; fetch/axios yok.
- AI yok: lib/research.ts:472 aiUsed:false; recordUsageReceipt (lib/reporting.ts:330)
  yalnız testte çağrılıyor.
- Kapalı anahtarlar: EMAIL_PROVIDER_MODE=DISABLED (plugins/env.ts:28),
  OUTREACH_TEST_DISPATCH_ENABLED=false, PUBLISH_EXECUTION_DISABLED
  (lib/social-content.ts:241), SEARCH_PROVIDER_EXECUTION_DISABLED
  (lib/visibility-assets.ts:258).
- Yerel ortam: node v24.19.0, pnpm 11.21.0, Docker 29.7.2; `docker-db-1` (postgres:15) ayakta;
  **.env VAR** (DATABASE_URL, TEST_DATABASE_URL, PORT, NODE_ENV, LOG_LEVEL) → DB-backed testler RUN.
- **Exposure / güvenlik bulguları (PR-D1…PR-D5 girdisi):** API her ortamda
  `host: '0.0.0.0'` dinliyor (index.ts:119); `trustProxy` hiç yok (src geneli 0 eşleşme);
  `/ready` timeoutsuz DB sorgusu yapıyor (health.ts:16); auth muafiyeti raw URL ile
  (`index.ts:56-60 request.url.split('?')[0]`); rate-limit tek global `{max:100,timeWindow:'1 minute'}`
  (index.ts:54); `new PrismaPg(url)` opsiyonsuz (statement/pool/connect timeout yok);
  `onClose` kullanımı yok; **40P01 deadlock sınıfı yok** (reporting.ts yalnız 40001/P2034/P2002/23505);
  6 adet `reply.send(await …)` ve dashboard/reporting/health/webhooks route'larında response
  `schema` yok; `@types/node ^20.8.1` iken runtime Node 24.19.0.
- DB envanteri: **`growth_db` canonical değildir** (3/26 migration, `RecommendationExposure` /
  `OutreachApproval` tabloları yok, repo'da karşılığı olmayan `20260813185529_company_domain_not_globally_unique`
  içeriyor) → ayrı **DB-HYGIENE-FORENSIC**, bu planda mutate edilmez. Disposable doğrulama DB'leri:
  `growth_test_20260919_pr_c_fresh` (27/27), `growth_test_20260919_pr_a_fresh` (27/27).
- Hijyen: LICENSE / SECURITY.md / CODEOWNERS yok; coverage eşiği yok;
  Dependabot / CodeQL / secret-scan yok (T5 kapsamı).

**Truth refresh — 2026-09-19 akşam (PR #90 sonrası).** Yukarıdaki satırlar sabahki taramanın
kanıtıdır ve tarihsel kayıt olarak korunur; güncel doğrulanmış değerler şunlardır:

- **Git:** `main` = `origin/main` = `2b80322623e80a7d056010bb947d152b4e69b7ec`; MERGED: #87 (B2A
  migration convergence gate + shadow replay + disposable guard), #88 (BC1 + BC6 money/value
  kontratı), #89 (BC2 + BC3 identity scope + domain evidence), #90 (BC4 lifecycle shipment
  truth); açık PR yalnız #4.
- **Migration:** **29** (fresh 29/29 · upgrade 28→29 · zero drift · convergence gate 11/11 PASS ·
  ≤63 byte object-name politikası). `growth_db` bu çalışmada mutate edilmedi (3 migration).
- **Test:** **33 API+web dosya / 236 test PASS** (fresh 29/29 DB'de); lint, typecheck, build,
  `prisma validate/generate` temiz; `git diff --check` exit 0.
- **Lifecycle:** policy **`customer-lifecycle-signals-v2`**; `REPEAT` artık operasyon sevkiyat
  truth'una bağlıdır (pipeline etiketi tek başına yetmez) → **L6 shipment receipt bağımlılığı
  AÇIK** (`signals.repeatEvidence.operationsShipmentSource = 'NOT_AVAILABLE'`). **BC5 (PORT/HOST
  evidence tipi) PR-D1 kapsamına devredildi.**
- **Sıradaki uygulama dilimi:** **PR-B2B** (DB-6 fingerprint + DIVERGED/UNKNOWN fail-closed,
  DB-7 `db push --accept-data-loss` guard). Kanonik sıra değişmedi; TASKS.md DELTA aynası aynı gün
  hizalandı.


## 3. Sıralama (bağlayıcı)

| Katman | İçerik | Gerekçe | Blast radius | Ön koşul |
|---|---|---|---|---|
| L0 | PR #82 merge, #81 housekeeping, main senkron, .env + izole test DB, 4 komut kanıtı | Tek doğruluk kaynağı | LOCAL | — |
| L1 | apps/mcp (stdio, salt-okunur 5 araç), llms.txt + .md yüzeyi, crawler kimliği + robots, CI sertleştirme | Sıfır schema/dış çağrı; mevcut projeksiyon desenini sarar | MODULE | L0 |
| L2 | apps/worker + handler registry + JobSchedule (cron) + dead-letter alarmı + 08:00 rapor üretimi | Runtime keystone; scheduler olmadan otomasyon ölü kod | CROSS_MODULE + DATA_CONTRACT | L0 |
| L3 | OIDC/SSO + roller (viewer/operator/approver/admin) + audit log | Yazma/gönderim "kim" kanıtı olmadan uyum üretilemez | CROSS_MODULE + DATA_CONTRACT | L2 |
| L4 | Etik/Hukuk Kapısı (10 kontrol) + JurisdictionRule, IysCheckReceipt, DeliverabilityReceipt, ContactFrequencyReceipt, ChannelPolicyReceipt, AiContentDisclosure, İYS ret job'ı | Gönderimi mümkün kılan kapı; L6/L8'den önce şart | DATA_CONTRACT + PUBLIC_API | L2, L3 |
| L5 | KVKK: RetentionPolicy, ErasureReceipt, DataSubjectRequest, anonimleştirme/silme job'ı, ihlal kaydı | Gerçek veri büyümeden yaptırım hazır olmalı | DATA_CONTRACT | L4 |
| L6 | Fiyat/teklif motoru (J1) → Opportunity yazma → teklif→kazanılan→gelir→maliyet→brüt kâr → rapor metrikleri | Para yazımı audit ister; RFQ hızı = hızlı ulaşma | DATA_CONTRACT + PUBLIC_API | L2, L3, L4 |
| L7 | GEO/AEO ölçüm hattı, model/prompt sicili, eval harness, prompt-injection seti, AI üretimi | Ölçüm ve şeffaflık olmadan GEO/AI riskli | MODULE | L2, L4 |
| L8 | Canlı: e-posta gönderimi, WhatsApp Cloud API, sosyal OAuth/publish, e-Fatura/MYLojistik, AI provider | Hesap/secret/geri alınamaz → kullanıcı onayı | PRODUCTION | L0–L7 + onay |

### 3.1 Uygulama dilimi eşlemesi (2026-09-19 delta)

**L0 KAPANDI (kanıtlı):** PR #82 MERGED · #81 CLOSED (superseded) · main = origin/main = 7840c35 ·
`.env` + izole test DB'leri mevcut · lint/typecheck/test/build kanıtları alındı (CI + lokal).

Güncel git truth: `main` = `2b80322` (§2 truth refresh) — L0 kapanışının kendi kanıtı tarihsel
olarak korunur; kanonik sıra ve durumlar aşağıdaki tabloda güncellenir.

Kanonik dilim sırası (her dilim kendi kanıtını üretir; §21'deki capability kimlikleriyle):

| Sıra | Dilim | Capability | Ön koşul | Bitiş kanıtı |
|---|---|---|---|---|
| 1 | **PR-C** (#85, MERGED) | DB-1, DB-9 | — | fresh 27/27 · upgrade 26→27 · zero drift · 226 test |
| 2 | **PR-B2A** (#87, MERGED) | DB-2, DB-3, DB-4, DB-5, DB-9 | PR-C | gate 11/11 PASS · fresh 29/29 · upgrade 28→29 · zero drift · bozuk drift fixture'ında FAIL |
| 3 | **PR-B2B** (sıradaki dilim) | DB-6, DB-7 | PR-B2A (#87 MERGED) | fingerprint çıktısı + DIVERGED/UNKNOWN fail-closed testi |
| 4 | **PR-D2** (Fastify security modernization) | SYS-6 (T9) | PR-C | full regression suite PASS |
| 5 | **PR-D1** (Exposure/Proxy) | SYS-1, SYS-2 | PR-D2 | bind adresi + CIDR/forwarded header testleri |
| 6 | **PR-D5** (Pool/Timeout + Readiness) | SYS-12 (T4), SYS-3 | PR-D2 | pool benchmark + `/ready` timeout testi |
| 7 | **PR-D3** (Route Auth + Rate Limit) | SYS-4, SYS-5 | PR-D1 | auth metadata testi + endpoint bazlı limitler |
| 8 | **PR-D4** (Response Contract / PII Guard) | SYS-11 | PR-D3 | şema dışı alan testinin kırılması |
| 9 | **PR-E2** (PG Error Classifier + Report Query) | SYS-9, SYS-10 | PR-D5 | 7 senaryo + latency/query baseline |
| 10 | **PR-E1** (Worker Activation + Heartbeat/Fencing) | SYS-7, SYS-8, SYS-13 | PR-E2 | worker görünürlüğü + tekrar-uygulama testi |
| 11 | **PR-E3** (Observability) | OBS-1, DAT-3 | PR-E1 | izlenebilirlik + redaction testleri |
| 12 | **L6 Revenue Core** | REV-1, RET-2, ACQ-8 | L2/L3/L4 | GP yazımı + 30/60/90 metrikleri |
| 13 | **Closed-loop acquisition/retention/experimentation** | ACQ-1…ACQ-9, DSC, EXP, RET-1 | L6 actual outcome | incrementality/uplift hattı |
| — | **DB-HYGIENE-FORENSIC** (ayrı hat) | DB-8 | kullanıcı kararı | forensic raporu; `growth_db` mutate edilmez |

**Paralel güvenli hat:** read-only / human-controlled acquisition MVP (ACQ-1, ACQ-2, ACQ-3, ACQ-6)
L2 + DAT-1 + gerekli security/compliance gate'lerinden sonra başlayabilir; **canlı outreach ve
autonomous action yok**; L6 sonrası actual quote/shipment/GP/repeat outcome verisiyle kapalı
öğrenme döngüsüne bağlanır. ACQ-5, EXP-1 ve EXP-2 (uplift/causal) actual outcome verisini bekler.

## 4. Katman detayları ve kabul kriterleri

### L0 — Gerçek senkronu
Dilimler: T1 PR #82 incele + merge · T2 PR #81 kapat (superseded) ·
T3 main senkron (ff-only) · T4 .env + izole test DB (test/sandbox/ci segmentli) ·
T5 lint/typecheck/test/build kanıtı · T6 STATUS.md güncelleme.
Kabul: PR #82 MERGED; PR #81 housekeeping kapalı; yerel main ile origin/main eşit; 4 komut PASS (NOT_RUN kalmadı).
Not: PR #4 açık bir süreç kararıdır ve L0 kapanışını bloklamaz; ayrı karar olarak takip edilir.

### L1 — Read yüzeyi, agent erişimi, kalite altyapısı
Dilimler: apps/mcp iskeleti (kendi zod v4 bağımlılığı; API tarafındaki zod v3 değişmez) ·
5 salt-okunur araç (daily_actions, company_insights, evidence_brief, lifecycle,
management_report) · llms.txt + .md sayfa sürümleri + Link header · crawler User-Agent
+ robots politikası + test · CI: coverage eşiği, Dependabot, CodeQL, secret-scan, SBOM.
Kabul: in-process SDK client ile tools/list = 5; olmayan companyId için hata döner,
çökme yok; çıktıda raw contact değeri veya secret yok (test); lint/typecheck/build PASS.

### L2 — Worker ve scheduler (runtime keystone)
Dilimler: apps/worker (ayrı Prisma client + env) · handler registry · JobSchedule
+ tick · dead-letter alarmı · REPORT_DAILY üretimi (teslim L8).
Kabul: CI içinde worker tick testi; üretimde "No handler registered" oluşmaz; stale
lease recovery ve retry/backoff mevcut ADR-017 semantiğiyle uyumlu.

### L3 — Kimlik, rol, denetim
Dilimler: kullanıcı + rol modeli · auth plugin (mevcut x-api-key yanında) · audit log
· onay akışının gerçek kullanıcıya bağlanması.
Kabul: onaylayan ile yazan aynı kişi ise reddedilir; her yazma audit satırı üretir;
rol dışı erişim 403.

### L4 — Outreach etik ve uyum kapısı
10 kontrol ve kabul senaryoları: OUTREACH_COMPLIANCE_POLICY.md (bu fazın kabul sahibi).

### L5 — KVKK operasyonu
Dilimler: RetentionPolicy · ErasureReceipt · DataSubjectRequest · anonimleştirme/silme
job kaydı (worker) · ihlal kaydı · append-only receipt uzlaşması (ADR-038).
Kabul: silme talebinde PII anonimleşir, receipt kayıtları korunur; saklama süresi
dolunca job çalışır.

### L6 — Ticari çekirdek (North Star)
Dilimler: fiyat/tarife motoru iskeleti (J1) · Opportunity yazma yüzeyi · teklif / kazanılan /
kaybedilen · gerçek gelir + maliyet + brüt kâr receipt kaydı · ManagementReport pipeline ve
kâr metrikleri (ADR-039).
Kabul: lead → teklif → kazanılan → brüt kâr zinciri tek testte; rapor bu sayıları gösterir;
RecommendationOutcome.valueMinor ile çift kayıt üretilmez (tek doğruluk kaynağı).

### L7 — Ölçüm ve AI yönetişimi
Dilimler: GEO/AEO ölçüm hattı (Search Console Generative AI raporu; erişim yoksa CSV import)
· llms.txt etkisi · model + prompt sicili · eval harness · prompt-injection regresyon seti
· AI içerik üretimi (LLM Last).
Kabul: AI çıktısı tek başına gerçek sayılmaz (kural/veri ile çapraz doğrulama testi);
her AI çağrısı UsageReceipt üretir.

### L8 — Canlı katman (açık onay)
E-posta gönderimi (domain + SPF/DKIM/DMARC + Resend) · WhatsApp Business Cloud API
· sosyal OAuth/publish (Phase 8G kapısı) · e-Fatura / MYLojistik köprüsü · AI provider
anahtarları. Bu katman kullanıcı hesap/secret/onayı olmadan açılmaz.

## 5. Paralel çalışma ve sıcak dosya kuralı

Kanıt: PR #81 ile #82 aynı dosyaları eklediği için çakıştı (mergeable: CONFLICTING).
Sıcak dosyalar (tek sahip): prisma/schema.prisma, apps/api/src/index.ts, README.md,
STATUS.md, DECISIONS.md.
Kural: paralel izler yalnız kendi dosyalarına dokunur; migration klasörleri ayrı ve additive.
İzin verilen paralellik: L1 ile L2, ve L6 ile L7. L3 → L4 → L5 sıralıdır (aynı çekirdek).

## 6. Dependency kararları (kayıtlı)

- @modelcontextprotocol/server v2 (+ opsiyonel @modelcontextprotocol/fastify): ADD.
  Yalnız izole apps/mcp içinde; Zod v4 orada izole edilir, API tarafındaki zod ^3.22.4
  sürümü değişmez. Lisans: Apache-2.0 (yeni katkılar) / MIT (mevcut kod). Auth opsiyoneldir:
  stdio env-credential; HTTP transport seçilirse OAuth 2.1 resource server şart.
- pg-boss: SKIP. ADR-017 queue yapısı SKIP LOCKED + lease + backoff + dead-letter zaten
  kurulu; eksik olan cron, JobSchedule tablosu + tick ile çözülür.
- graphile-worker: SKIP. Aynı gerekçe + ayrı şema ve migration sahipliği riski.

## 7. ADR listesi (her dilimle birlikte yazılır)
ADR-034 MCP salt-okunur sunucu · ADR-035 worker ve scheduler runtime · ADR-036 kimlik/rol/audit
· ADR-037 etik ve hukuk kapısı · ADR-038 KVKK silme ile append-only receipt uzlaşması
· ADR-039 para modeli (tek doğruluk kaynağı + çoklu para birimi politikası) · ADR-040 AI
şeffaflık ve eval · ADR-041 GEO/AEO ölçüm sözleşmesi.

## 8. Program bitti tanımı (go-live kapıları)
1. 08:00 TR raporu otomatik üretilip teslim ediliyor (L2 + L6).
2. Günlük aksiyon listesi ve şirket istihbaratı gerçek veriyle dolu (L1 + L6).
3. Teklif → kazanılan → gerçek gelir → brüt kâr raporlanıyor (L6).
4. Hiçbir mesaj L4 kapısını geçmeden çıkmıyor (L4).
5. KVKK silme/saklama/DSAR çalışıyor (L5); RBAC + audit aktif (L3); CI yeşil (L0, L1).
6. Hukuk teyidi gelmeden canlı gönderim kapalı (L8).

## 9. Harici gereksinimler (L8 katmanını bloklar)
İYS hesabı ve entegrasyon yetkisi · onay ve aydınlatma metinleri · hedef ülke listesi ·
e-posta domaini + DNS erişimi · WhatsApp Business hesabı · tarife/fiyat verisi ·
hukuk teyidi (İYS fıkra metni, ceza tutarları, ülke bazlı sıkılık farkları).

## 10. Riskler, rollback ve fail-closed davranışı
- OneDrive kopyası karışıklık yaratır → tek kanonik klon kuralı.
- Test veritabanı yoksa testler NOT_RUN kalır ve PASS sayılmaz (G1).
- L4 kapısı atlanırsa domain/hesap kaybı → fail-closed tasarım.
- Rollback: her dilim tek PR + additive migration; yeni app klasörleri izole (kaldırılabilir).

## 11. Doğrulanamayanlar (UNKNOWN olarak işaretli)
İYS madde numaraları ve ceza tutarları (arama snippet kaynaklı) · ülke bazlı B2B sıkılık
farkları · eFTI yürürlük tarihleri. Bu alanlarda hukuk/mevzuat teyidi şart; şimdilik
fail-closed davranış geçerlidir.

## 12. Kaynaklar
Ticaret Bakanlığı İYS sayfası (ticaret.gov.tr, 18.04.2023) · Ticari İletişim ve Ticari
Elektronik İletiler Hakkında Yönetmelik değişikliği (04.01.2020) · ICO PECR rehberi ·
Gmail gönderici kuralları · WhatsApp Business Messaging Policy · FTC CAN-SPAM rehberi ·
Google "Optimizing for generative AI search" (10.07.2026) · llms.txt v2 (10.08.2026) ·
MCP spec 2026-07-28 ve TypeScript SDK v2 · AB AI Act (yürürlük 02.08.2026, şeffaflık
rehberi 20.07.2026) · NIST AI RMF · KVKK resmi site.

## 13. Toolchain (T) fazı — sıralı dilimler

Hedefler npm registry üzerinden 2026-09-19 tarihinde ölçüldü: fastify 5.12.5 · vitest 5.0.1 ·
vite 8.3.0 · zod 4.6.5 · typescript 7.0.2 · eslint 10.11.0 · prisma 8.0.0-rc.15 (stabil 7.10.0) ·
react 19.3.0 · @fastify/cors 11.3.0 · @fastify/helmet 13.1.1 · @fastify/rate-limit 11.2.0 ·
@fastify/swagger 9.8.1 · @testing-library/react 16.3.3 · pnpm 12.4.2 ·
actions checkout@v5 ve setup-node@v5 (her ikisi runs.using: node24).

| Dilim | İş | Risk | Ön koşul |
|---|---|---|---|
| T0a | .gitattributes (* text=auto eol=lf, pnpm-lock.yaml text eol=lf) + lock dosyasını LF olarak normalize et + .gitignore içine .freebuff/ ve reports/ ekle | Çok düşük | — |
| T0b | pnpm supply-chain: minimumReleaseAge 1440 açıkça yazılır, blockExoticSubdeps true; trustPolicy ayrı dilim | Çok düşük | — |
| T1a | CI action major yükseltmesi: checkout@v5, setup-node@v5, pnpm/action-setup@v6 veya pnpm/setup@v1 + concurrency.cancel-in-progress | Çok düşük | — |
| T1b | .github/dependabot.yml (npm + github-actions + docker; minor/patch gruplu, haftalık) | Çok düşük | — |
| T2 | vite.config.ts ve vitest.config.ts dosyalarını .mts yap (Vite CJS uyarısı kapanır) | Çok düşük | — |
| T3 | @types/node ^24; prettier 3 + format:check + CI adımı | Düşük | T0a |
| T4 | Prisma pool: new PrismaPg ile açık bağlantı konfigürasyonu (connectionString, max, zaman aşımları) + process başına pool bütçesi (api, worker, mcp) + test | Düşük | L2 |
| T5 | CI kalite kapıları: coverage eşiği, prisma validate, pnpm audit, secret-scan, CodeQL; SBOM adımında iki-dokümanlı lockfile uyarısına dikkat | Düşük | T0b |
| T6 | ESLint 8 → 10 flat config + typed lint (projectService) | Orta | T3 |
| T7 | Vitest 1 → 5 (+jsdom); projects ile api ve web ayrımı (F-09 çözümü) | Orta | T6 |
| T8 | Zod 3 → 4 (iki adımlı: ^3.22.4 → ^3.25, zod/v4 alt yolu ile → ^4); ardından opsiyonel fastify-type-provider-zod ^7 ve @fastify/swagger 9 (API9 envanteri) | Orta-Yüksek | T7 |
| T9 | Fastify 4 → 5.12.5 + helmet 13 + cors 11 + rate-limit 11 (koordineli yükseltme) | Orta-Yüksek | — (T8 yalnız type-provider/swagger benimsenirse ilişkili) |
| T10 | React 18 → 19 (5 paket: react, react-dom, @types/react, @types/react-dom, @testing-library/react) · Prisma 7 → 8 (RC tamamlanınca) · pnpm 11 → 12 | Yüksek | T7 |

Sıra gerekçesi: T0–T2 davranışı değiştirmeyen gürültü ve kalite işleridir; mevcut kodda
`fastify-type-provider-zod` kullanılmadığı için T8 (zod) ile T9 (fastify) bağımsız ilerleyebilir.
T8 yalnız type-provider/swagger benimsenirse T9 ile ilişkili ön koşul haline gelir; React 19,
Prisma 8 ve pnpm 12 en sona bırakılır (ölçülmüş fayda şartı).

**§21 cross-reference (capability ↔ T dilimi):**
T3 ← SYS-14 (node runtime/types + min-runtime CI) · T4 ← SYS-12 + SYS-3 (pool/timeout + bounded readiness) ·
T5 ← DB-2…DB-7 (CI migration convergence + fingerprint guard) · T9 ← SYS-6 (PR-D2 Fastify security modernization).

**Düzeltme (2026-09-19, PR-D2 planı):** T8 (zod 4) **T9 için zorunlu değildir**. Yukarıdaki
"T8 T9'dan önce zorunludur" gerekçesi yalnız `fastify-type-provider-zod` benimsenirse geçerlidir;
bu repoda o paket **kullanılmıyor** (apps/api/package.json'da yok, §14.1 kaydı da trustProxy/route
kullanımının v5 uyumlu olduğunu doğruluyor). Bu nedenle kanonik sırada **PR-D2 (Fastify 5.12.5 +
helmet 13 + cors 11 + rate-limit 11) T8'den bağımsız** çalışır; T8 yalnız type-provider/swagger
envanteri benimsenirse ön koşul olur.

## 14. Doğrulama kayıtları (dış iddialar)

### 14.1 Toolchain raporu iddiaları (2026-09-19)
| İddia | Verdict | Kanıt / doğrusu |
|---|---|---|
| CI annotation kökü: setup-node u pnpm/action-setup tan önce koymak | YANLIŞ | Gerçek kök neden action runtime: checkout@v4 ve setup-node@v4 node20 çalıştırır, runner node24 e zorlar. Düzeltme: checkout@v5 ve setup-node@v5 (action.yml içinde runs.using: node24). Mevcut sıra (pnpm sonra setup-node) cache: pnpm için zaten doğrudur |
| Vite CJS uyarısı için .mts yeniden adlandırma | DOĞRU | vite.dev troubleshooting: vite.config.ts dosyasını vite.config.mts olarak yeniden adlandırma öneriliyor. Not: Vite artık 8.3.0 |
| Fastify 5 göçü düşük riskli; @fastify/* zaten v5 uyumlu | KISMEN (bağımlılık kısmı yanlış) | Kod tarafı düşük risk: req.connection, reply.redirect, app.use, trustProxy kullanımı yok; listen({port,host}) doğru; route lar plugin. Ancak helmet latest 13.1.1, cors latest 11.3.0, rate-limit latest 11.2.0 (fastify-plugin ^6) — repo sürümleri v5 uyumlu değil |
| Zod type provider (Fastify 5 + zod v4) | DOĞRU | fastify-type-provider-zod uyum matrisi: <=4.x zod v3, >=5.x <7.x zod v4, >=7.x zod 4.2+. v7+ response serileştirmesi z.output tipine göre çalışır |
| PrismaPg kullanınca pooling i pg sürer, connection_limit yok sayılır | DOĞRU | Prisma v7 docs: relational datasources driver adapter ile başlar, pool varsayılanları sürücüden gelir; dönüşüm: connection_limit -> max (varsayılan 10), pool_timeout -> acquire timeout, connect_timeout -> connection timeout |

### 14.2 SEO/GEO/AI-mail/sosyal raporu iddiaları (2026-09-19)
| İddia | Verdict | Kanıt / doğrusu |
|---|---|---|
| Zod 3 to 4 göçü tam olarak 3 temas noktası | EKSİK SAYILMIŞ | Repo ölçümü: error.format() 1, z.string().email() 1, .strict() 52, z.string().datetime() 2, z.record() tek argüman 1, z.coerce 30. Gerçek kapsam 5 desen ve yaklaşık 60 kullanım; .default() ve z.coerce davranış değişiklikleri için kontrat testi şart |
| React 19 için tek bağımlılık hamlesi (RTL ^16) | EKSİK | 5 paket birlikte: react, react-dom, @types/react, @types/react-dom, @testing-library/react@^16 (latest 16.3.3). createRoot kullanımı doğrulandı (main.tsx:10) |
| Node 24 native TS pilotu mümkün; enum/namespace/parameter properties yok | YANLIŞ | constructor(readonly ...) 11 kez var; Node docs parameter properties i dönüşüm gerektiren özellikler listesinde sayar (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX). Ek engeller: import uzantıları zorunlu, tsconfig paths desteklenmez, node_modules içindeki TS reddedilir; Node v26 da --experimental-transform-types kaldırıldı |
| pnpm minimumReleaseAge 1440 ve blockExoticSubdeps | DOĞRU | pnpm supply-chain-security: minimumReleaseAge varsayılanı 1440 dakika; blockExoticSubdeps öneriliyor; ek olarak trustPolicy no-downgrade ve iki-dokümanlı lockfile uyarısı var |
| Dependabot repoda yok | DOĞRU | .github altında yalnız workflows/ci.yml var |
| Svix webhook doğrulaması ders kitabı uyumlu | BÜYÜK ÖLÇÜDE DOĞRU | verifySvixWebhook + 5 dakika tolerans + timingSafeEqual + ham gövde parser (apps/api/src/routes/resend-webhooks.ts:28-52) |

Ayrıca bu turda kapanan UNKNOWN: pnpm-workspace.yaml içindeki allowBuilds anahtarının güncel ve doğru ad olduğu teyit edildi.

## 15. OWASP API Security Top 10 (2023) eşlemesi

| Risk | Durum | Aksiyon |
|---|---|---|
| API1 BOLA | AÇIK — nesne düzeyi yetki yok, tek paylaşılan x-api-key | L3 RBAC |
| API2 Broken Auth | AÇIK — rotasyon, expiry ve kullanıcı kavramı yok | L3 |
| API3 Object Property Auth | İYİ — zod strict ve küratörlü yanıtlar | korunur |
| API4 Resource Consumption | KISMİ — 100/dk bellek-içi limit, gövde limiti, zod max uzunlukları | T5 ve L4 kota |
| API5 Function Level Auth | AÇIK — rol ayrımı yok | L3 |
| API6 Sensitive Business Flows | İYİ — gönderim ve yayın kapıları fail-closed; akış kotası L4 te | L4 |
| API7 SSRF | ŞU AN YOK — crawler dilimiyle doğacak | crawler dilimi: allowlist, iç IP reddi, redirect politikası |
| API8 Misconfiguration | KISMİ — helmet/CORS/prod key var; TLS, reverse proxy ve non-root konteyner yok | T10 ve L8 |
| API9 Inventory Management | AÇIK — 57 endpoint için OpenAPI ve envanter yok | T8 (swagger) |
| API10 Unsafe Consumption | İYİ — sağlayıcı çağrılarında 5 sn timeout, imza doğrulama, bounded şema | korunur |

## 16. Dış araştırma kayıtları ve açık boşluklar

Yapılan araştırmalar: Google AI-optimization (10.07.2026) · llms.txt v2 (10.08.2026) · MCP spec 2026-07-28
ve TypeScript SDK v2 · IETF Web Bot Auth · AB AI Act (yürürlük 02.08.2026, şeffaflık rehberi 20.07.2026) ·
NIST AI RMF · KVKK resmi site (2026) · Gmail gönderici kuralları · FTC CAN-SPAM · WhatsApp Business
Messaging Policy · ICO PECR · Ticaret Bakanlığı İYS (18.04.2023) · AB eFTI (2020/1056) ·
Forrester Predictions 2026 · vite.dev troubleshooting · prisma.io driver adapters ve connection pool ·
fastify-type-provider-zod · npm registry dist-tags · OWASP API Top 10 · OpenTelemetry semconv 1.44.0
(GenAI ve MCP) · Node.js CLI ve Process docs (v26.9.0) · pnpm supply-chain security.

Kapanan boşluk: lojistik ihale ve fiyatlama (kamuya açık FreightBidBench benchmark mevcut).

Açık boşluklar:
1. Test ve QA 2026 normları: coverage eşiği, kontrat testi, mutation testi, flaky test tespiti, Postgres-per-schema paralel test deseni.
2. Gözlemlenebilirlik: OpenTelemetry JS kurulumu, pino ile korelasyon, SLO ve error budget, dead-letter alarm desenleri.
3. Türkiye uyum güncellemeleri: İYS entegrasyon dokümanı ve ceza tutarları, KVKK 2026 rehberleri.
4. Append-only receipt ile KVKK silme uzlaşması: tombstone ve anonimleştirme desenleri; sentetik veri denetimi.
5. Zod v4 uygulama detayı ve Fastify response serializer davranışı (şemada olmayan alanların düşürülmesi).
6. E-posta deliverability ölçüm araçları: seed list, Postmaster, BIMI.
7. Lojistik veri: Türkiye navlun ve ihracat/gümrük veri kaynakları, MERSİS erişimi, e-Fatura entegrasyonu.
8. CRM ve satış platformu benchmark: 2026 ürünlerinde standart olan yetenekler ve bizde eksik olanlar.
9. Gözlemsel veriyle nedensellik: saha deneyi yapamadığımız durumda DML ve hedef-trial taklidi.

## 17. UNKNOWN durumu

KAPANDI: pnpm-workspace.yaml içindeki allowBuilds anahtarının güncel doğru ad olduğu (pnpm docs 12.x).
AÇIK: process.loadEnvFile öğesinin mevcut değişkenleri ezme semantiği ve eklendiği sürüm (nodejs.org/api/process.md) ·
Prisma pg adapter pool tablosunun tam satırları · 196 test PASS iddiası (koşulmadı) ·
L1 auth hook unun bilinmeyen yolda 401 ya da 404 döndürmesi (G-06) · ESLint 10 flat config uyumu (deneme gerekir) ·
R dilimlerinin alan transferi (e-ticaret ve tıbbi literatürden B2B lojistiğe) · FreightBidBench uyarlama maliyeti.

## 18. R fazı — araştırma temelli yetenekler

Giriş kapısı (bağlayıcı): Bir R dilimi ancak L6 kâr çekirdeği gerçek veri üretmeye başladıktan sonra
açılır (veri yoksa model yok; deterministic-first korunur). Her R dilimi ayrı PR ve eval raporu ile alınır.
Kanıtlar özet düzeyinde okundu; bir kısmı sentetik, simülasyon veya e-ticaret verisi kullanır.

| Dilim | Yetenek | Dayanak | Ön veri | Kabul kriteri |
|---|---|---|---|---|
| R-1 | Conformal güven kapısı: kalibrasyonlu eşik ve insana devretme | 2609.17499, 2609.13303 | Elde tutulmuş kalibrasyon seti (en az 200 karar) | alpha=0,1 için deneysel kapsama >= %90; elle eşik ayarı kaldırılır; aşırı engelleme oranı raporlanır |
| R-2 | ROI kısıtlı aksiyon politikası (frekans, maliyet, marj) | 2608.04421 | Günlük temas, maliyet ve kâr receipt kayıtları | Kısıt ihlali %0; kâr ve marj raporu; simülasyon doğrulaması |
| R-3 | Kapasiteli günlük aksiyon ataması (knapsack bandit) | 2608.29850 | Exposure ve outcome receipt kayıtları | Deterministik baseline a karşı offline değerlendirme (IPS) ve çevrimiçi 90/10 |
| R-4 | Harness politikası öğrenimi (prompt, araç, doğrulama; çok amaçlı ödül) | 2607.25415 | Görev başarısı, doğrulayıcı skoru, maliyet, desteksiz iddia | Desteksiz iddia oranı düşer; maliyet ve gecikme kısıtı korunur; politika insan-okunur kalır |
| R-5 | Kanıt kısıtlı açıklama üretimi (rapor ve teklif gerekçesi) | 2606.xxxx (navlun vaka çalışması) | Evidence ve forecast | Her cümle evidence-ID ye bağlı; bağsız cümle 0; evidence-ID F1 ölçülür |
| R-6 | Artımsallık ölçümü (QINI/AUUC ve uplift tuzağı kontrolü) | 2608.00915, KDD 2026 | Outcome receipt kayıtları | Metrik uyumsuzluğu testi; artımsal kâr raporu; ham dönüşüm başarı sayılmaz |
| R-7 | Ajan çıkış denetimi ve RAG PII savunması | 2609.18864, RAG-CT, 2609.15830 | MCP araç envanteri ve çıkış sınırı sözleşmesi | Tüm çıkışlar denetlenir; kaçırılan maruziyet ölçülür; evidence-ID F1 raporu |
| R-8 | Yorumlanabilir kapasite ve güzergâh ataması (SHAP ve eşik) | AIxB 2025 | Opportunity, kâr ve kapasite verisi | HIGH_VALUE sınıflandırması açıklanabilir; SHAP raporu; karar insan onaylı || R-9 | Conformal Cascade ile model yönlendirme ve kapı birleşimi: deferral kuralı kalibrasyonlu tahmin kümesi boyutudur; küme tek cevaba düşerse kabul, yoksa üst modele devret. Dağılımdan bağımsız sonlu örneklem doğruluk garantisi; eğitim gerekmez, yalnız kara kutu API; maliyet alpha nın fonksiyonu olarak karakterize edilmiş | 2607.25018v3 (31.07.2026) | Kalibrasyon seti | alpha için maliyet ve doğruluk eğrisi; garanti altında maliyet düşer |
| R-10 | Kısıtlı override politikası (onay kapısı tasarımı): saha deneyinde sınırsız override stoğu %1,95 azaltıp satışı %1,19 düşürdü; epizot başına 2 override sınırı stoğu %1,28 azaltıp satışı bozmadı; kişiselleştirilmiş politikada +%9,1 satış olasılığı | 2607.00420 (01.07.2026) | Onay ve override kayıtları | Override bütçesi uygulanır; onay/red oranı ve sonuç kalitesi ölçülür |
| R-11 | Aşırı güven yerine uygun güven ölçümü: konuşmaya dayalı açıklama kullanışlı bulunuyor ama uygun öz güveni düşürüyor (aşırı güven riski); öneri cognitive forcing functions. Küme değerli tavsiye için uygun güven metrikleri: AI ya ve öze doğru güven oranı, güven miktarı ve kalitesi | 2608.10434, 2606.06081v2 | Onay oturum kayıtları | Onay ekranı kanıt ID göstermeye zorlar; aşırı güven ve aşırı reddetme oranları raporlanır |
| R-12 | Evidence-first çok LLM şirket grafiği: kanıt doğrulama, ontoloji bağlama, entity resolution, füzyon ve insan incelemesi ayrı durumlar; provenance ve çözülmemiş vakalar korunur; grafik doğrulama sonrası deterministik projeksiyon üretilir | 2609.12360 (11.09.2026) | Evidence ve karar kayıtları | Çözülmemiş vaka kuyruğu; deterministik projeksiyon; belirsizlik tek güvene indirgenmez |
| R-13 | Yapılandırılmış veri ajanlarında translate-and-execute yasağı: aşamalı ajan, doğrudan çevir ve çalıştır yaklaşımının yetki ihlallerini ortadan kaldırıyor; yedi boyut (retrieval semantiği, yetkilendirme, niyet, entity resolution, değerlendirme, hata modları, gecikme) | 2608.xxxx (04.08.2026) | MCP araç envanteri | Her araç yetki kontrolünden geçer; çevir ve çalıştır reddedilir |
| R-14 | Süreç madenciliği eşitliği: yerel deterministik hesap ve LLM yorumu ayrılır (PMAx yaklaşımı); LLM e uzun bağlamda örüntü madenciliği yaptırılmaz (in-context laziness ve zamansal madencilik yetersizliği) | 2603.xxxx (16.03.2026), 2609.06976 (07.09.2026) | Event log | Metrikler deterministik kodla üretilir; LLM yalnız yorumlar |
| R-15 | Ajan belleği aşama kapıları: yazma aşaması eşik benzeri risk geçişi gösterir, yönetim politikaya bağlı ayrışır, geri çağırmada yarar ve risk birlikte büyür. Operasyonel kanıt: 78.933 hook çağrısında 85 kayıtlı hatanın hiçbiri sessiz değil; oturum başı sağlık kapısı, ayrık hata modları ve alarm yorgunluğu bütçesi | 2608.30177 (31.08.2026), 2608.xxxx | Bellek yazma kayıtları | Yazma kapısı en sıkı; sessiz hata yok; alarm bütçesi tanımlı |
| R-16 | Lojistik ihale ve kapasite şeffaflığı: LLM alıcı ajanları hızla yoğunlaşabiliyor (aynı taşıyıcı isteklerin %76 sına kadar); kalan günlük kapasiteyi açıklamak yoğunlaşmayı yaklaşık üçte bir azaltıp alıcı refahını ikiye katlıyor. Sertifikalı aralıklı çift fiyat politikaları ile gerçek zamanlı yük kabulü. FreightBidBench kamuya açık benchmark; surrogate rollout cascade rollout kârının %98 ini %40-56 gecikmeyle koruyor | 2607.19967 (22.07.2026), 2607.16891v2, 2607.07343 (08.07.2026) | Opportunity, kapasite ve fiyat verisi | Politika kamuya açık benchmark ta değerlendirilir; kapasite şeffaflığı veri modeline girer; karar insan onaylı |

## 19. Akademik kaynakça (özet düzeyinde okundu)

2609.11740 (10.09.2026) · 2606.04387 (03.06.2026) · 2605.05772 (07.05.2026) · 2608.04421 (05.08.2026) ·
2608.00915 (02.08.2026) · 2606.27114 (25.06.2026) · 2609.17499 (15.09.2026) · 2609.13303 (10.09.2026) ·
2609.13864 (12.09.2026) · 2608.29850 (30.08.2026) · 2608.21993 (22.08.2026) · 2607.25415 (28.07.2026) ·
2609.15571 (14.09.2026) · 2609.12620 (11.09.2026) · 2606.01527 (01.06.2026) · 2608.21399 (05.08.2026) ·
2609.19180 (15.09.2026) · 2609.15830 (14.09.2026) · 2609.18864 (16.09.2026) · 2609.18674 (16.09.2026) ·
2609.16305 (14.09.2026) · 2511.06642 (10.11.2025) · 2608.10245 (10.08.2026) · 2607.16769 (07.09.2026) ·
2608.10434 (11.08.2026) · 2606.06081v2 (19.08.2026) · 2604.23896 (26.04.2026) · 2607.25018v3 (31.07.2026) ·
2606.15308 (13.06.2026) · 2605.17288 (17.05.2026) · 2607.00420 (01.07.2026) · 2510.12049v6 (14.10.2025) ·
2609.12360 (11.09.2026) · 2609.06037 (05.09.2026) · 2606.29750 (29.06.2026) · 2603.xxxx (16.03.2026) ·
2608.30177 (31.08.2026) · 2609.09848 (09.09.2026) · 2607.20727 (22.07.2026) · 2607.19967 (22.07.2026) ·
2607.16891v2 (28.07.2026) · 2607.07343 (08.07.2026) · 2609.06976 (07.09.2026).

Not: Yukarıdaki tüm kaynaklar arXiv özet düzeyinde okundu; tam metin doğrulaması ilk uygulanacak
dilimler için ayrıca yapılacaktır. Bazı çalışmalar sentetik, simülasyon veya e-ticaret verisi kullanır;
B2B lojistiğe aktarım ayrı bir pilot ve ölçüm gerektirir.

## 20. Revizyon kaydı — önceki bölümlere dokunan değişiklikler

- Bölüm 3 (sıralama): T fazı eklendi; izin verilen paralellik artık L1 ile L2, L6 ile L7 ve T0-T2 dilimleri.
- Bölüm 4 / L1: MCP sunucusu için OpenTelemetry MCP ve GenAI semconv kullanımı; yetki kontrolünden geçmeyen araç yok (R-13).
- Bölüm 4 / L2: dead-letter alarmı yanına alarm yorgunluğu bütçesi ve ayrık hata modları eklendi (R-15).
- Bölüm 4 / L3: BOLA ve rol ayrımı artık açık gerekçe.
- Bölüm 4 / L4: onay ekranı kanıt göstermeye zorlar, override bütçesi tanımlanır, aşırı güven ve aşırı reddetme ölçülür (R-10, R-11).
- Bölüm 4 / L5: sentetik ve DP veri için anonimlik iddiası yasak; alt grup üyelik çıkarımı denetimi şart.
- Bölüm 4 / L6: FreightBidBench değerlendirmesi, kapasite şeffaflığı ve teklif politikası (R-16).
- Bölüm 4 / L7: Cost Router ve Confidence Gate conformal cascade ile birleşir; yönlendirme kararı saldırı yüzeyi sayılır.
- Bölüm 4 / Faz 9: çözülmemiş vakaları koruyan evidence-first grafik ve deterministik projeksiyon (R-12).
- Bölüm 4 / Faz 10: süreç madenciliğinde hesap ve yorum ayrımı; bellek aşama kapıları (R-14, R-15).
- Bölüm 6 (dependency): dotenv ADD yerine REMOVE (process.loadEnvFile); pg-boss 12.33.2 ve graphile-worker 0.18.0 künyesi SKIP gerekçesine eklendi; tsx ertelendi; React 19 beş paket; @testing-library/react 16.
- Bölüm 7 (ADR): ADR-042 EOL ve gitattributes politikası · ADR-043 Prisma pool ve process başına bütçe · ADR-044 OTel GenAI ve MCP gözlemlenebilirlik · ADR-045 crawler SSRF politikası · ADR-046 kalibrasyonlu güven kapısı · ADR-047 ajan çıkış sınırı ve RAG PII savunması · ADR-048 artımsallık ve uplift metrik sözleşmesi · ADR-049 uygun güven ve override bütçesi · ADR-050 conformal cascade (router ve gate birleşimi) · ADR-051 ajan belleği aşama kapıları ve sessiz hatasızlık telemetrisi · ADR-052 yapılandırılmış veri ajanlarında translate-and-execute yasağı · ADR-053 lojistik ihale politikası ve kapasite şeffaflığı.
- Bölüm 11: UNKNOWN listesi bölüm 17 ile senkronlandı.
- Bölüm 2: **truth refresh** — bayat git/ortam iddiaları (main=67ca039, PR #82 OPEN, ".env YOK",
  23 test dosyası) PR-C merge sonrası gerçek durumla değiştirildi (main 7840c35, 47 enum,
  1323 satır schema, 226 test, 27 migration, zero drift, exposure/güvenlik bulguları).
- Bölüm 3: **3.1 Uygulama dilimi eşlemesi** eklendi (PR-C → PR-B2A → PR-B2B → PR-D2 → PR-D1 →
  PR-D5 → PR-D3 → PR-D4 → PR-E2 → PR-E1 → PR-E3 → L6 → closed-loop) + L0 kapanış kanıtı +
  read-only acquisition paralel hattı.
- Bölüm 13: §21 cross-reference'ları (T3←SYS-14, T4←SYS-12/SYS-3, T5←DB-2…DB-7, T9←SYS-6) ve
  **T8→T9 bağımlılık düzeltmesi** (type-provider kullanılmıyor → PR-D2 T8'den bağımsız).
- Bölüm 21 (yeni): **Capability & Revenue-Enabler Matrix** — 46 capability
  (EXISTING 4 · PARTIAL 19 · MISSING 22 · BLOCKED 1), kanonik execution order, read-only
  acquisition paralel hattı ve doküman statüsü notu.
- Doküman statüsü: bu dosya repo'ya alındığında **canonical source-of-truth** sayılır; bu
  docs-only PR öncesinde "working canonical draft" idi. MASTER_PLAN.md'ye bu delta ile
  dokunulmadı (G4).
- Bölüm 2 + 3.1 (2026-09-19 akşam, PR #90 sonrası): **truth refresh** — main `2b80322`, 29 migration,
  33 dosya / 236 test, PR #87 (B2A) ve #88-#90 (BC integrity serisi) MERGED, sıradaki dilim **PR-B2B**;
  BC5 (PORT/HOST) → PR-D1; lifecycle policy `customer-lifecycle-signals-v2` (REPEAT = operasyon
  sevkiyat truth'u, L6 shipment receipt bağımlılığı açık). TASKS.md DELTA aynası aynı gün hizalandı
  (DELTA-02 DONE, DELTA-03 sıradaki). Kanonik sıra değişmedi.

## 21. Capability & Revenue-Enabler Matrix (2026-09-19 delta)

Statü: doküman repo'ya alındığında canonical source-of-truth olur; bu matris "working canonical
draft" iken üretildi. MASTER_PLAN.md'ye bu delta ile dokunulmadı (G4 kuralı).

Kural: her capability en az bir müşteri/gelir mekanizmasına veya **REVENUE ENABLER** gerekçesine
bağlanır; hiçbir maddeye "teknolojik olarak güzel" olduğu için MUST verilmez. Tekilleştirme:
E2=SYS-4 · E3=SYS-5 · E4=SYS-8 · E5=SYS-11 · E6=SYS-12 (T4) · E7=SYS-14 (T3) · E8=SYS-13 ·
E9+E10=SYS-9 · F1–F6=DB-1 (PR-C) · F7–F13=DB-3…DB-7 (PR-B2A/B2B) · F16–F17=DB-8 ·
B7–B11=DSC-3 · A24/L6=ACQ-8+REV-1.
**REV-2 ayrı capability değildir:** neden + karar verici + mesaj + deney bağlı satış hattı,
ACQ-1 / ACQ-2 / ACQ-5 + ACQ-8 zincirinde bağlanır (ayrı dilim açmaz).

Verdict dağılımı (**46 capability**): EXISTING 4 · PARTIAL 19 · MISSING 22 · BLOCKED 1.

### 21.1 Sistem güvenilirliği (hepsi REVENUE ENABLER)

| ID | Capability | Verdict | Pri | Dilim | Müşteri/gelir mekanizması | Kabul & KPI · Risk |
|---|---|---|---|---|---|---|
| SYS-1 | **Exposure Guard** — dev/test varsayılan `127.0.0.1`; `0.0.0.0` yalnız açık izin + aktif auth/security gate ile | MISSING | MUST | PR-D1 | Yanlış NODE_ENV/eksik auth ile API'nin LAN/internete açılmasını önler → müşteri verisi + servis kesintisi | K: dev bind `127.0.0.1`, prod'da HOST yoksa fail-closed · R: açık kalma; dep env şeması |
| SYS-2 | **Trusted Proxy Policy** — Plesk/nginx arkasında gerçek client IP; kör `trustProxy` yok, güvenilen CIDR allowlist | MISSING | MUST | PR-D1 | Yanlış client IP → rate-limit/auth/audit kayıtları yanlış → abuse veya yanlış bloklama | K: forwarded header + `request.ip` testi · R: rate-limit bypass; dep SYS-1, SYS-5 |
| SYS-3 | **Bounded Readiness** — `/ready` DB kontrolü açık timeout ile | MISSING | MUST | PR-D5 | DB yarı-erişilebilirken instance kısa sürede 503 döner → bozuk instance müşteri trafiği almaz | K: yavaş DB'de < N sn 503 · R: LB yanılgısı; dep SYS-12 |
| SYS-4 | **Route Auth Metadata** — raw `request.url.split('?')[0]` kaldırılır; public/private explicit metadata/encapsulation; business route default DENY | MISSING | MUST | PR-D3 | Auth bypass → müşteri/veri sızıntısı; yeni route sessizce public olamaz | K: auth'suz yeni route testi kırar · R: sessiz public endpoint; dep L3 |
| SYS-5 | **Rate-limit Policy** — webhook / expensive (ranking, research) / internal / auth ayrı limitler | MISSING | MUST | PR-D3 | Tek global limit → pahalı endpoint veya webhook seli tüm API'yi düşürür → teklif gecikir | K: endpoint bazlı limit testleri · R: flood; dep SYS-2 |
| SYS-6 | **Fastify 5 + helmet 13 + cors 11 + rate-limit 11** (koordineli) | EXISTING (planlı **T9**) | MUST | PR-D2 | EOL framework = güvenlik yaması almama → breach → müşteri durur | K: full regression suite PASS · R: davranış değişimi (T8 gerekmez — §13 düzeltmesi) |
| SYS-7 | **Worker Activation Contract** — worker active / handler registered / last tick / queue depth / oldest queued job age / dead-letter / stale lease | MISSING | MUST (async öncesi) | L2 | Job yaratılıp çalışmaması → lead/research/outreach sessizce durur → satış hattı kesilir | K: worker kapalıyken dashboard "çalışıyor" demez · R: görünmez duruş; dep OBS-1 |
| SYS-8 | **Job Lease/Heartbeat/Fencing** — lease aşımı + external side effect için idempotency key | PARTIAL | MUST (canlı outbound öncesi) | L2/L4 | Çift müşteri teması → complaint, itibar ve deliverability kaybı | K: lease aşan job ikinci worker'da tekrar uygulanmaz · R: çift e-posta; dep SYS-7 |
| SYS-9 | **PG Error Classifier + Bounded Retry** — 40001/40P01 retry; 23505 generic retry yok; 23503 retry yok; unknown throw; driver-adapter wrapper tanınır | PARTIAL | MUST | PR-E2 | Blind retry = çift etki; retry'siz deadlock = spurious 500 → dashboard/teklif kesintisi | K: 7 senaryo testi + retry limiti · R: sonsuz retry; dep SYS-12 |
| SYS-10 | **Report Query Consolidation** — groupBy/aggregate/kısa snapshot; davranış değişmeden önce baseline | MISSING | MUST (perf) | PR-E2 | Dashboard/rapor DB yükü → günlük fırsat penceresi kaçar (why-now bayatlar) | K: query count + p95 önce/sonra · R: uzun SERIALIZABLE tx; dep SYS-9 |
| SYS-11 | **API Response Contract / PII Leak Guard** — explicit projection/schema | MISSING | MUST | PR-D4 | Internal alanın API'ye sonradan sessizce sızmasını engeller → müşteri/veri güvenliği | K: şema dışı alan testi kırar (6 direct-return route) · R: KVKK; dep SYS-4 |
| SYS-12 | **Prisma Pool & Timeout Policy** — pool max / connect / idle / transaction / statement timeout / shutdown-drain | MISSING (=**T4**) | MUST | PR-D5 | Pool tükenmesi veya sessiz timeout → tüm API yavaşlar → müşteri kaçar | K: instance × pool kapasitesi benchmark · R: default'a kör güven; dep L2 |
| SYS-13 | **Graceful Resource Lifecycle** — `onClose`: scheduler stop → worker stop → in-flight politikası → DB disconnect → gelecekteki crawler/agent temizliği | PARTIAL | V1 | L2 | Deploy sırasında kesilen in-flight iş → müşteri teması/teklif kaybı | K: shutdown sırası testi · R: yarım iş + kilit; dep SYS-7 |
| SYS-14 | **Node Runtime/Types Alignment** — runtime 24.x ↔ `@types/node`; minimum supported Node CI job | PARTIAL (=**T3**) | V1 | T3 | Tip/runtime uyumsuzluğu → üretimde sürpriz hata → müşteri teması kesilir | K: ayrı min-Node CI job · R: v24 runtime vs `@types/node` ^20 |
| SYS-15 | **Toolchain EOL modernizasyonu** (ESLint 8 vb. ayrı maintenance dilimi) | PARTIAL | V2 | T0–T10 | Bakımsız araç zinciri → yavaş teslim + güvenlik açığı | K: T dilimleri PASS · R: revenue-critical işi geciktirme |

### 21.2 Migration / DB truth

| ID | Capability | Verdict | Pri | Dilim | Müşteri/gelir mekanizması | Kabul & KPI · Risk |
|---|---|---|---|---|---|---|
| DB-1 | **Composite FK beyanı + DB invariant/negatif testleri** | PARTIAL → **PR-C teslim** | MUST | PR-C | Constraint kaybı → yanlış approval/yanlış içerik → müşteri güveni ve hukuki risk | K: 5 invariant test + mutation kanıtı · R: kapanıyor |
| DB-2 | **Migration convergence CI gate** (history · fresh replay · upgrade replay · schema convergence · DB invariant) | MISSING | MUST | **PR-B2A** | Migration drift → deploy/runtime arızası → müşteri edinme motorunun kesilmesi | K: bozuk drift fixture'ında CI FAIL, main'de PASS · R: sessiz DROP; dep DB-3 |
| DB-3 | **Dedicated shadow DB + environment fail-closed guard** | MISSING | MUST | **PR-B2A** | Paylaşılan/prod DB'de deneme → veri hasarı ve bozuk release | K: `--from-migrations` diff çalışır; uygunsuz DB adı → FAIL · R: yanlış DB'ye migration |
| DB-4 | **History/checksum integrity** (applied migration edit = FAIL) | MISSING | MUST | **PR-B2A** | Sessizce farklı şema ile koşma → yanlış rapor/brüt kâr (GP) → yanlış fiyatlama | K: checksum mismatch testte FAIL · R: yanlış karar verisi; dep DB-2 |
| DB-5 | **Historical immutable + forward-only enforcement** | EXISTING (kural) → **PARTIAL** (CI enforcement yok) | MUST | **PR-B2A** | Geçmiş migration'ı yeniden yazma → geri alınamaz üretim sapması | K: kural + CI testi · R: kağıtta kalma; dep DB-2 |
| DB-6 | **DB fingerprint + DIVERGED/UNKNOWN fail-closed** | MISSING | MUST | **PR-B2B** | Divergent DB → veri kaybı/bozuk release → satış sisteminin durması | K: 5 durumlu status; DIVERGED'de deploy durur · R: bilinmeyen migration; dep DB-2/DB-4 |
| DB-7 | **`db push --accept-data-loss` guard** (shared/staging/prod-benzeri) | MISSING | MUST | **PR-B2B** | Sessiz kolon/tablo kaybı → bozuk release → teklif/teslim kaydı kaybı | K: negatif test reddeder · R: geri alınamaz şema kaybı |
| DB-8 | **Kanoni(k) DB truth + `growth_db` hijyeni** | BLOCKED (karar) | MUST (rapor) | **DB-HYGIENE-FORENSIC** | Yanlış DB'ye migration/silme → müşteri verisi kaybı | K: ayrı forensic raporu · R: 3/26 + repo dışı migration; **bu dilimde mutate yok** |
| DB-9 | **Explicit short DB object name politikası (≤63 byte)** | PARTIAL (PR-C örneği) | V1 | PR-C / PR-B2A | PostgreSQL truncation → yanlış/çakışan index adı → yavaş dashboard | K: 63-byte kuralı + programatik test · R: tekrar truncation |

### 21.3 Veri doğruluğu & gözlemlenebilirlik

| ID | Capability | Verdict | Pri | Dilim | Müşteri/gelir mekanizması | Kabul & KPI · Risk |
|---|---|---|---|---|---|---|
| DAT-1 | **Provenance**: source / observedAt / availableAt / freshness / confidence / dataOrigin / evidenceGroup | EXISTING (PR #84) | — | L2 | Eski veya yanlış kanıtla temas → müşteri güveni ve teklif kalitesi | K: şema + testler mevcut · R: — |
| DAT-2 | **Entity resolution**: candidate ≠ merge; yıkıcı otomatik merge yok; actual ≠ inferred | EXISTING | — | L2 | Yanlış firmaya teklif / yanlış birleştirme → itibar | K: `entity-resolution.ts` + merge receipts · R: — |
| DAT-3 | **UNKNOWN ≠ ZERO, actual ≠ estimated politikası** | PARTIAL | V1 | PR-E3 | Sıfır varsayımı → yanlış öncelik/karar → kaçan fırsat | K: etiketsiz metrik = 0 · R: yanlış KPI; dep DAT-1 |
| OBS-1 | **Unified observability**: request/workflow/recommendation/company/experiment/job id + model, latency, cost, retry, error class, human override, commercial outcome (PII/secret yok) | PARTIAL | V1 | PR-E3 | Hangi kanalın para ürettiği ölçülemez → bütçe yanlış yere gider | K: uçtan uca izlenebilirlik + redaction testleri · R: PII loglama; dep SYS-7, EXP-1 |

### 21.4 Karar → müşteri (acquisition)

| ID | Capability | Verdict | Pri | Dilim | Müşteri/gelir mekanizması | Kabul & KPI · Risk |
|---|---|---|---|---|---|---|
| ACQ-1 | **Opportunity / why-now radar** + günlük öncelik + next-best-action | MISSING | V1 | Read-only MVP (L2+DAT-1+gate sonrası) → L6 closed-loop | Daha çok nitelikli temas, doğru zamanlama → teklif dönüşümü | K: radar önerisi → teklif oranı · R: bayat sinyal; canlı outreach YOK |
| ACQ-2 | **Decision-maker intelligence** | MISSING | V1 (MVP) / LAB (derin) | Read-only, human-controlled MVP | Doğru muhatap → cevap ve teklif oranı artar | K: karar vericiye ulaşma oranı · R: KVKK/hukuk sınırı; dep L4 |
| ACQ-3 | **Evidence-backed ranking + insan-okur reason receipt + belirsizlik** | PARTIAL | V1 | Read-only MVP (L6 öncesi) | Neden seçildiği görünür → satışçı güveni ve dönüşüm artar | K: reason receipt kapsamı %100 · R: gerekçesiz öneri; dep DAT-1 |
| ACQ-4 | **Relationship capital + reactivation + network-path sinyalleri** | MISSING/PARTIAL | V1 | L6 sonrası | Eski müşteri = en düşük maliyetli iş | K: reaktivasyon dönüşümü · R: spam algısı; dep RET-1, L4 |
| ACQ-5 | **Mesaj konumlandırma deneyleri + mesaj/treatment envanteri + follow-up optimizasyonu** (fiyat yalnız challenger) | MISSING | V1 | **actual outcome (L6+) bekler** | Doğru mesaj → cevap oranı ve teklif artışı | K: cevap/teklif uplift · R: deney disiplini yoksa yanlış öğrenme; dep EXP-1 |
| ACQ-6 | **Grounded sales preparation / company evidence pack + ihtiyaç soyutlaması** | PARTIAL | V1 | Read-only MVP (L6 öncesi) | Hazırlık süresi ↓, temas kalitesi ↑ | K: görüşme hazırlık süresi · R: uydurma iddia; dep DAT-1, L4 |
| ACQ-7 | **Corporate shadow intelligence** | LAB | LAB | R fazı | Kapasite/backup açısı → teklif güveni | R: etik/hukuk sınırı; dep L4 |
| ACQ-8 | **Ticari lineage**: lead→reply→qualified→quote→win→shipment ref→GP→repeat + kısa/uzun vade ayrımı | PARTIAL | MUST (ölçüm temeli) | L6 | Gerçek brüt kâr görünür → doğru yatırım kararı | K: zincir doluluk oranı · R: ölçümsüz harcama; dep REV-1, OBS-1 |
| ACQ-9 | **AI screening + human selling + human review/override telemetry** | PARTIAL | V1 | L7 | İnsan eforu doğru firmalara gider | K: override oranı + kalibrasyon · R: AI plan kapılı; dep L7, EXP-2 |
| ACQ-10 | **Semantic similarity + geospatial/endüstriyel küme sinyalleri** | MISSING | V2/LAB | R fazı | Benzer profil/varlık kümesinden yeni müşteri | K: benzerlik kaynaklı kazanım · R: yanlış benzerlik; dep ACQ-1 |

### 21.5 Discovery · Experimentation · Retention

| ID | Capability | Verdict | Pri | Dilim | Müşteri/gelir mekanizması | Kabul & KPI · Risk |
|---|---|---|---|---|---|---|
| DSC-1 | **Continuous technical SEO + crawlability/indexability + schema.org + entity (hizmet/coğrafya/sektör) netliği** | MISSING/PARTIAL | V1 | L7 sonrası | Inbound nitelikli talep | K: indekslenen uygun sayfa + sorgu→lead · R: vanity metric; dep L7 |
| DSC-2 | **query→page→lead→quote→GP lineage + içerik üretim ekonomisi + içerik→nitelikli talep** | MISSING | MUST (ölçüm) | L7 | İçerik maliyeti ↔ GP ilişkisi → bütçe israfı önlenir | K: içerik başına nitelikli talep ve GP · R: sıralama/mention yanılgısı; dep ACQ-8 |
| DSC-3 | **AI visibility / GEO tekrarlı ölçüm** + mention/citation/shortlist stabilitesi + çoklu model/zaman + agentic-market testi + entity tutarlılığı | PARTIAL (L7) | V1 | L7 | AI-buyer çağında görünürlük ve shortlist'e girme | K: mention/shortlist stabilitesi · R: tek ölçüm yanılgısı; dep EXP-1 |
| EXP-1 | **Experiment registry** + baseline/challenger + treatment/control/holdout + exposure ve rank-shown log + mesaj/kaynak/insan kararı versiyonları | PARTIAL | V1 | **actual outcome (L6+) bekler** | Hangi müdahalenin GP ürettiğini öğrenme kaldıracı | K: deney kapsamı + exposure bütünlüğü · R: tekrar eden hata; dep OBS-1 |
| EXP-2 | **Incrementality / uplift (CATE) readiness** + exploration-exploitation + personalization-backfire + insan prior ↔ AI skor ↔ gerçek sonuç kalibrasyonu | LAB/V1 | LAB | **actual outcome sonrası** | Gerçek artış (incremental brüt kâr) ve gereksiz maliyetin kesilmesi | K: incremental GP · R: yanlış nedensellik; dep EXP-1 |
| RET-1 | **Lifecycle** NEW → DEVELOPING → REPEAT → COOLING → DORMANT → REACTIVATED + ilişki yaşı / anlamlı etkileşim / son temas / son sevkiyat | PARTIAL | V1 | L6 | Tekrar iş = en yüksek marj | K: repeat rate + reaktivasyon oranı · R: bağlam dışı temas; dep ACQ-8 |
| RET-2 | **GP 30/60/90 + ilk→ikinci sevkiyat + sonraki sevkiyat günü + tekrar oranı + reaktivasyon fırsatı** | MISSING | MUST (gelir gerçeği) | L6 | Gerçek kârlılık ve tekrar iş ölçümü | K: 30/60/90 GP, repeat rate · R: yanlış müşteriye yatırım; dep REV-1 |

### 21.6 Gelir çekirdeği

| ID | Capability | Verdict | Pri | Dilim | Müşteri/gelir mekanizması | Kabul & KPI · Risk |
|---|---|---|---|---|---|---|
| REV-1 | **Fiyat/teklif motoru (J1) → Opportunity yazımı → teklif→kazanılan→gelir→maliyet→brüt kâr → rapor metrikleri** | EXISTING (planlı **L6**) | MUST | L6 | Doğrudan para yazımı; RFQ hızı = hızlı ulaşma | K: L6 kabul kriterleri (§4) · R: yanlış fiyat/kayıt; dep L2, L3, L4 |

Not: "neden + karar verici + mesaj + deney bağlı satış hattı" **ayrı capability değildir**;
ACQ-1, ACQ-2, ACQ-5 ve ACQ-8 zincirinde bağlanır (bkz. §21 tekilleştirme kuralı).

### 21.7 Kanonik execution order

Bağlayıcı sıra **§3.1 tablosundadır** (tek sahiplik; burada tekrar edilmez):
`PR-C → PR-B2A → PR-B2B → PR-D2 → PR-D1 → PR-D5 → PR-D3 → PR-D4 → PR-E2 → PR-E1 → PR-E3 → L6 Revenue Core → closed-loop`;
ayrı hat: **DB-HYGIENE-FORENSIC** (`growth_db`, mutate yok). TASKS.md'deki `DELTA-01…DELTA-13`
aynası bu sırayla birebir eşleşir.

Ana zincir: sağlam sistem → doğru veri → doğru karar → doğru müşteri → doğru temas → teklif → iş → brüt kâr → tekrar iş.

### 21.8 Read-only acquisition paralel hattı

ACQ-1, ACQ-2, ACQ-3 ve ACQ-6, L2 + DAT-1 + gerekli security/compliance gate'lerinden sonra
**read-only / human-controlled MVP** olarak L6'dan önce başlayabilir. Kısıtlar: **canlı outreach yok,
autonomous action yok, dış dünyaya yazan ajan yok**; çıktı yalnız insan kararına sunulan
öneri/kanıt paketidir. L6 sonrasında actual quote/shipment/GP/repeat outcome verisiyle **kapalı
öğrenme döngüsüne** bağlanır. ACQ-5, EXP-1 ve EXP-2 (uplift/causal) bu outcome verisini bekler —
outcome olmadan uplift iddiası üretilmez.
