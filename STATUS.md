STATUS — Kısa, güncel durum (master ajanın okuması için)

last_update: 2026-08-14T00:15:00+03:00
last_actor: Devin (Phase 0/1 Hardening — Öncelik 0-4 kapanış planı)

CURRENT PHASE: PHASE 1 — DATA FOUNDATION (hardening)
ACTIVE ISSUE: Phase 0/1 sağlamlaştırma (Köksal'ın önceliklendirilmiş kapanış
planı; Faz 2+ iş akışları bilinçli olarak kapsam dışı)
ACTIVE BRANCH: devin/1786664161-phase01-hardening (PR #5:
https://github.com/koksal-hub/Koseoglu-Growth/pull/5)

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

CURRENT QUALITY STATUS (gerçek, doğrulanmış — lokalde):
- pnpm install: PASS
- pnpm lint: PASS
- pnpm typecheck: PASS
- pnpm test: PASS — 44/44 (4 dosya; +13 yeni test: negatif/edge-case +
  frontend smoke)
- pnpm build: PASS (api + web)
- prisma validate / migrate deploy (yeni CHECK constraint migration dahil):
  PASS
- docker compose up (db+migrate+api): PASS, health/ready 200, SIGTERM'de
  graceful shutdown exit 0
- GitHub Actions CI: PASS (PR #5 üzerinde `build` job'ı yeşil)
- Uçtan uca test (Devin testing agent): PASS — health/ready + DB kesinti/
  geri dönüş, SIGTERM graceful shutdown (exit 0), helmet/rate-limit/CORS,
  DB CHECK kısıtları, web + /api dev proxy, lang="tr". Detay: PR #5 yorumu.

OPEN BLOCKERS:
- Yok. (Önceki "workflow scope" blocker'ı bu ortamda oluşmadı; ci.yml push
  edildi. gh CLI hâlâ yok — Issue yönetimi manuel.)

NEXT ACTION:
- PR #5 review/merge.
- İyileştirme maddeleri (22-26: central logging olgunlaştırma, entity
  resolution blocking/ölçek, hata sözleşmesi + metrics, coverage threshold,
  frontend işlevsel MVP) AYRI PR'larda ele alınacak — bu PR kapsamı dışında.

notes:
- Her ajan bu dosyayı okuyup iş devralmalıdır. Değişiklik yapmadan önce TASKS.md
  ve MASTER_PLAN.md okunmalıdır.
- Bir dosya değiştiğinde SADECE ilgili görünen komutu değil, dört komutun
  (lint/typecheck/test/build) TAMAMINI yeniden çalıştır (bkz. LEARNINGS.md).
- Entegrasyon testleri için Postgres gerekli:
  `docker compose -f docker/docker-compose.yml up -d db` +
  `pnpm exec prisma migrate deploy`.
