STATUS — Kısa, güncel durum (master ajanın okuması için)

last_update: 2026-09-01T09:45:20+03:00
last_actor: Codex (Aşama 3 merge ve kapanış kanıtı)

CURRENT PHASE: PHASE 3 — RANKING (COMPLETE)
ACTIVE ISSUE: Yok — Issue #11 completed
ACTIVE BRANCH: codex/ranking-daily-action-v1-docs (`main` `8d47703` tabanı)

CURRENT CODEX CHECKPOINT (2026-09-01):
- Research Mission ilk dikey dilimi PR #7 CI PASS sonrası `main` üzerine
  `4978d2f` ile squash-merge edildi. Issue #3, otomatik extraction ve ikinci
  kaynak politikası henüz yapılmadığı için açık tutuldu.
- `ContactPoint`, `CommunicationPermission` ve global pseudonymous
  `SuppressionEntry` additive modelleri eklendi. Şirket genel, kişi-iş ve kişisel
  iletişim noktaları; kaynak, zaman, doğrulama, confidence, retention, notice ve
  data-processing basis bilgileri ayrı tutulur.
- API, contact point create/list, human verification, append-only permission
  receipt ve dry-run communication gate uçlarını içerir. Public kaynak izin
  sayılmaz; `UNKNOWN`, unverified, düşük confidence, süresi geçmiş kayıt ve
  suppression deny üretir.
- PERSONAL ALLOWED yalnız açık rıza + explicit-consent receipt ile mümkündür.
  Türkiye'ye özgü B2B tacir/esnaf istisnası başka jurisdiction için kaydedilemez.
  Opt-out/suppression kanıt ister ve aynı normalize alıcı için firma değiştirerek
  bypass edilemez.
- Son güvenlik incelemesinden sonra timeline/country DB constraint'leri, daha
  muhafazakâr email/telefon doğrulaması ve kişi verisi için permission-basis
  savunması eklendi. `growth_contact_point_v1_final2_20260901` adlı yeni boş
  DB'ye dört migration sıfırdan uygulandı; schema up to date. Odaklı API/DB
  regresyonları 26/26 PASS; tam suite 97/97 ve API+web build PASS.
- Kod commit'i `8c35d65` olarak push edildi. PR #9, GitHub Actions run
  `33476774205` içindeki migration/lint/typecheck/test/build ve cleanup
  adımlarının tamamı SUCCESS olduktan sonra beklenen head SHA kilidiyle
  squash-merge edildi. `main` HEAD `4272840`; Issue #8 completed olarak kapandı.
- PR #10 kapanış belge senkronu run `33477220349` PASS sonrası `0423c4a`
  olarak merge edildi. Issue #11 açıldı ve güncel `main` tabanlı ayrı worktree kuruldu.
- `CompanyRankingReceipt`, `DailyActionType` ve `COMPANY_RANKING_RECORDED` additive
  şema/migration'ı eklendi. Algoritma ICP, company confidence, current evidence,
  verified contact ve communication permission için beş ayrı 0..20 tamsayı
  üretir; DB 0..100 exact sum, hash/version/actor ve FK constraint'lerini uygular.
- `POST /api/daily-actions/refresh` en çok 100 açık company id için immutable,
  idempotent receipt üretir ve score/name/id ile sıralar. `GET
  /api/companies/:id/ranking-receipts` 1..100 limitlidir.
- Evidence yalnız CURRENT, confidence >=0.7, future olmayan ve en çok 90 günlükse
  puan verir. Contact mevcut permission gate'ini tekrar kullanır. Suppression
  `HONOR_SUPPRESSION`; en ileri durum yalnız `READY_FOR_HUMAN_OUTREACH_REVIEW` olur.
  Lead/Activity/Outreach/send/provider çağrısı yoktur.
- Kod commit'i `91bb5d6` olarak push edildi. PR #12 GitHub Actions run
  `33478818433` içindeki migration/lint/typecheck/test/build ve cleanup
  adımlarının tamamı SUCCESS olduktan sonra beklenen head SHA kilidiyle
  squash-merge edildi. `main` HEAD `8d47703`; Issue #11 completed olarak kapandı.

LAST COMPLETED TASK (Öncelik 0-4, tamamı bu branch'te):

Öncelik 0 — Operasyon/Altyapı:
- `.github/workflows/ci.yml` REPOYA GERÇEKTEN EKLENDİ ve push EDİLDİ.
  Önceki oturumlardaki `workflow` scope blocker'ı bu ortamın git
  kimlik bilgisiyle OLUŞMADI — dosya artık repoda. İçerik: Postgres service
  container + pnpm install + prisma migrate deploy + lint→typecheck→test→build.
- Graceful shutdown (`apps/api/src/index.ts`): SIGTERM/SIGINT →
  `server.close()` + `prisma.$disconnect()`. Docker'da SIGTERM ile exit code 0
  doğrulandı.
- Process-seviyesi hata yakalayıcılar: `unhandledRejection` +
  `uncaughtException` → fatal log + kontrollü çıkış.
- Health/readiness ayrımı: `/api/health` (liveness, DB'ye dokunmaz) +
  `/api/ready` (Prisma `SELECT 1`; DB yoksa 503).

Öncelik 1 — Kod hataları:
- `prisma.ts`: `process.env.DATABASE_URL ?? ''` bypass'ı kaldırıldı →
  `requireDatabaseUrl` (env.ts) erken ve net hata fırlatıyor.
- `createActivity` helper'ı (`apps/api/src/lib/activity.ts`): leadId ve
  contactId ikisi de yoksa `ActivityValidationError`. Defense-in-depth:
  additive migration `20260813234500_add_check_constraints` ile
  `Activity_lead_or_contact_required` CHECK constraint.
- `confidence` 0..1 aralığı DB'de CHECK constraint ile zorunlu
  (`Company_confidence_range`, `Evidence_confidence_range`) — aynı additive
  migration'da; hiçbir DROP/DELETE/TRUNCATE yok.
- Entity resolution sertleştirildi: free/generic email sağlayıcı blacklist'i
  (gmail, hotmail, outlook, yahoo, icloud, yandex, ...) — EMAIL_DOMAIN
  eşleşmesi bu domainlerde atlanıyor (`isFreeEmailProvider`). PHONE eşleşmesi
  düşük güvenli destekleyici sinyale indirildi (0.85 → 0.5) ve öncelik sırası
  email domain/address'in ARKASINA alındı (ortak santral numarası riski,
  kod içinde dokümante).
- Nullable email + `@@unique([companyId, email])` edge-case'i bilinçli
  davranış olarak şemada NOT ile dokümante edildi (Postgres NULL'ları unique
  index'te ayrı sayar; kısıtlanacaksa partial unique index önerisi notta).

Öncelik 2 — Test kapsamı:
- prisma-models.test.ts: Activity invariant'ı (helper + DB CHECK), aralık
  dışı confidence (1.5 / -1, Company + Evidence), aynı şirkette iki NULL
  email'in yazılabildiği edge-case testi eklendi.
- entity-resolution.test.ts: gmail.com email-domain'inin EŞLEŞMEDİĞİ,
  kurumsal domain'in eşleştiği, ortak telefon senaryosunun 0.5 güvenle ve
  düşük öncelikle döndüğü negatif/riskli senaryo testleri eklendi.
- Frontend test altyapısı kuruldu: vitest + jsdom + @testing-library/react;
  `apps/web/src/App.test.tsx` render smoke testi (jsdom pragma ile).

Öncelik 3 — Frontend:
- `index.html`: `lang="tr"`.
- `main.tsx`: `#root` için null guard (non-null assertion kaldırıldı).
- `apps/web/vite.config.ts`: `/api` → `http://localhost:3000` dev proxy.

Öncelik 4 — Konfigürasyon:
- Kök `package.json`: npm tarzı `workspaces` alanı kaldırıldı (tek kaynak:
  `pnpm-workspace.yaml`); var olmayan `packages/*` referansı workspace
  tanımından çıkarıldı; `engines` (node>=24, pnpm>=11) + `packageManager`
  (pnpm@11.21.0) eklendi; `.nvmrc` (24) eklendi.
- `.env.example` ↔ kod senkronu: `LOG_LEVEL` ve `CORS_ORIGINS` hem
  `.env.example`'a hem `envSchema`'ya eklendi.
- Env şeması sertleştirildi: `PORT` → `z.coerce.number()`, `NODE_ENV` →
  `z.enum(['development','test','production'])`, `LOG_LEVEL` → pino level
  enum'u.
- Güvenlik plugin'leri: `@fastify/helmet`, `@fastify/cors` (env-tabanlı
  `CORS_ORIGINS` allowlist; boşsa cross-origin reddedilir),
  `@fastify/rate-limit` (100 istek/dk) `buildServer`'da kayıtlı.
- `docker/docker-compose.yml` çalışır durumda: `db` + one-shot `migrate`
  (prisma migrate deploy) + `api` servisleri; `env_file` artık opsiyonel
  (`required: false`), `.env.example`'dan türetme talimatı dosyanın başında.
  `docker/Dockerfile.api` + kök `.dockerignore` eklendi. Stack gerçekten
  ayağa kaldırıldı: migrate PASS, `/api/health` ve `/api/ready` 200 döndü.

CURRENT QUALITY STATUS (gerçek, doğrulanmış — bu branch):
- pnpm install: PASS
- pnpm lint: PASS
- pnpm typecheck: PASS
- pnpm test: PASS — 106/106 (9 dosya; Ranking için 9 API/DB testi)
- pnpm build: PASS (api + web)
- prisma format / validate / generate: PASS
- prisma migrate deploy/status: PASS — beş migration `growth_ranking_v1_final_20260901`
  temiz DB'sine sıfırdan uygulandı
- Ranking DB check: 8 gerçek receipt constraint katalogda doğrulandı; test sonrası
  CompanyRankingReceipt ve Ranking Event sayıları 0
- docker compose up (db+migrate+api): PASS, health/ready 200, SIGTERM'de
  graceful shutdown exit 0
- GitHub Actions CI: PASS — PR #12 run `33478818433`; migration/lint/typecheck/
  test/build ve cleanup adımlarının tamamı SUCCESS
- Uçtan uca test (Devin testing agent): PASS — health/ready + DB kesinti/
  geri dönüş, SIGTERM graceful shutdown (exit 0), helmet/rate-limit/CORS,
  DB CHECK kısıtları, web + /api dev proxy, lang="tr". Detay: PR #5 yorumu.

OPEN BLOCKERS:
- Aşama 3 için açık kod/kalite/CI blocker'ı yoktur; Issue #11 kapanmıştır.
- Authentication/authorization hâlâ yoktur. Business API'leri
  yalnız private/local geliştirme içindir; public veya multi-user deploy edilemez.
- Bilinen, bu dilimi bloklamayan teknik borç: Vite 5 CJS Node API deprecation
  uyarısı ve merkezi error handler'ın beklenen 4xx workflow/validation hatalarını
  error seviyesinde `Unhandled error` diye loglaması. ERRORS.md içinde açıkça kayıtlıdır.

NEXT ACTION:
- Aşama 4 için yalnız outreach draft + insan onayı kapsamını ayrı Issue/branch'te
  tasarla; provider/send entegrasyonu ekleme.
- Authentication/authorization çözülmeden public veya multi-user deploy yapma;
  gerçek gönderim ve müşteri iletişimi için ayrıca açık kullanıcı onayı bekle.

notes:
- Her ajan bu dosyayı okuyup iş devralmalıdır. Değişiklik yapmadan önce TASKS.md
  ve MASTER_PLAN.md okunmalıdır.
- Bir dosya değiştiğinde SADECE ilgili görünen komutu değil, dört komutun
  (lint/typecheck/test/build) TAMAMINI yeniden çalıştır (bkz. LEARNINGS.md).
- Entegrasyon testleri için Postgres gerekli:
  `docker compose -f docker/docker-compose.yml up -d db` +
  `pnpm exec prisma migrate deploy`.
