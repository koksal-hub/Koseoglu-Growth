STATUS — Kısa, güncel durum (master ajanın okuması için)

last_update: 2026-08-13T21:25:00+03:00
last_actor: Claude Code (Issue #2 — Phase 1: Data Foundation)

CURRENT PHASE: PHASE 1 — DATA FOUNDATION
ACTIVE ISSUE: #2 — Data Models (GitHub'da henüz açık Issue olarak yok, bkz.
TASKS.md; kapsam ve kabul kriterleri Köksal'ın talimatına göre işlendi)
ACTIVE BRANCH: main (henüz push edilmedi — bkz. NEXT ACTION)

LAST COMPLETED TASK:
- Prisma şemasına Faz 1 çekirdek modelleri eklendi: Company, Contact, Lead,
  Activity, FollowUp, Opportunity, Evidence, Event (+ SourceChannel enum'u
  Company/Contact/Lead üzerinde alan olarak, ayrı bir tablo değil —
  overengineering'den kaçınıldı).
- Prisma 7'nin yeni mimarisine geçildi: `prisma.config.ts` (migrate/CLI için
  DATABASE_URL) + `@prisma/adapter-pg` ile çalışma zamanı client'ı
  (`apps/api/src/lib/prisma.ts`). Detay: ERRORS.md → prisma7-datasource-url-kaldirildi.
- Deterministik Entity Resolution modülü yazıldı
  (`apps/api/src/lib/entity-resolution.ts`): normalizeCompanyName,
  normalizeDomain, normalizeTaxNumber, normalizeEmail, normalizePhone,
  stringSimilarity, findDuplicateCompany (öncelik sırası: tax number →
  domain → phone → email domain → address → normalized name → similarity →
  [AI, Faz 2'ye ertelendi, ADR-003 LLM Last]).
- İlk migration oluşturuldu ve lokal Postgres'e uygulandı:
  `prisma/migrations/20260813181338_init_data_foundation/` — yalnızca
  CREATE TABLE/ALTER TABLE ADD CONSTRAINT, hiçbir DROP/DELETE/TRUNCATE yok
  (elle doğrulandı).
- `.github/workflows/ci.yml`'e Postgres servisi + `prisma migrate deploy`
  adımı eklendi (Faz 1'den itibaren entegrasyon testleri gerçek DB'ye karşı
  çalışıyor). Root `postinstall` script'i `prisma generate` çalıştıracak
  şekilde eklendi.
- `apps/api/tsconfig.json`'daki bir kapsam boşluğu düzeltildi: typecheck
  artık `test/**/*`'i de kapsıyor (detay: ERRORS.md →
  apps-api-tsconfig-test-disinda).

CURRENT QUALITY STATUS (gerçek, doğrulanmış — 2026-08-13T21:19 itibarıyla,
lokalde):
- pnpm install: PASS
- pnpm lint: PASS
- pnpm typecheck: PASS (artık test dosyaları dahil)
- pnpm test: PASS — 31/31 (3 dosya: health.test.ts, entity-resolution.test.ts
  [22 unit test, DB gerektirmez], prisma-models.test.ts [8 entegrasyon testi,
  gerçek Postgres'e karşı, temizlik doğrulandı — testten sonra DB'de 0 satır])
- pnpm build: PASS (dist/ yalnızca src/'ten üretiliyor, test dosyası sızmıyor
  — doğrulandı)
- prisma validate / generate / migrate dev / migrate deploy: hepsi lokal
  Postgres'e karşı PASS
- GitHub Actions CI: **HENÜZ ÇALIŞMADI bu değişiklikler için** — commit
  henüz push edilmedi.

TEST KAPSAMI (Issue #2 acceptance criteria'sına karşılık):
- company name normalization: PASS (Köseoğlu Lojistik / Koseoglu Lojistik /
  KÖSEOĞLU LOJİSTİK LTD ŞTİ → aynı normalized key, testte doğrulandı)
- domain normalization: PASS (https://www.example.com/ / www.example.com /
  example.com → aynı, testte doğrulandı)
- duplicate company detection: PASS (tax number, domain, normalized name,
  similarity öncelik sırası test edildi; gerçek duplicate olmayan şirket
  için null döndüğü de test edildi)
- unique constraints: PASS (Company.domain, Company.taxNumber,
  Contact.[companyId,email] — gerçek Postgres'e karşı P2002 hatası
  doğrulandı)
- temel model ilişkileri: PASS (Company↔Contact↔Lead↔Activity↔FollowUp↔
  Opportunity, gerçek include/relation sorgularıyla doğrulandı)
- Evidence oluşturma: PASS (Company VE Event ile ilişkilendirilmiş halde)
  Event oluşturma: PASS (entityType/entityId + metadata JSON)
- Company self-merge (duplicate → MERGED + mergedIntoId): PASS

OPEN BLOCKERS:
- `.github/workflows/ci.yml` bu oturumda tekrar değiştirildi (Postgres
  servisi eklendi). Daha önce doğrulandığı gibi, bu dosyaya git push ile
  dokunmak kullanılan GitHub kimlik bilgisinin `workflow` scope'u olmaması
  yüzünden reddedilecek. Köksal'ın bu değişikliği GitHub web UI'dan manuel
  uygulaması GEREKECEK (aynı yöntem, bkz. ERRORS.md →
  github-push-workflow-scope-eksik). İçerik bu commit'te
  `.github/workflows/ci.yml` olarak lokalde hazır.
- GitHub Issues bu ortamda otomatik açılamadı (gh CLI yok).

NEXT ACTION:
- Commit + push (ci.yml push denenecek, muhtemelen reddedilecek — reddedilirse
  önceki oturumdaki gibi ci.yml hariç push edilip Köksal'a içerik verilecek).
- Push sonrası GitHub Actions CI sonucu GERÇEKTEN doğrulanacak (Postgres
  servisiyle install→migrate deploy→lint→typecheck→test→build hepsi PASS
  olmalı).
- CI PASS doğrulanmadan Issue #2 DONE değildir.

notes:
- Her ajan bu dosyayı okuyup iş devralmalıdır. Değişiklik yapmadan önce TASKS.md
  ve MASTER_PLAN.md okunmalıdır.
- Bu ortamda `node`/`pnpm` PATH'te değil; her komuttan önce
  `export PATH="$HOME/.corepack-shims:/c/Program Files/nodejs:$PATH"`
  çalıştırılmalı (bkz. ERRORS.md → pnpm-path-erisilemiyor).
- Bir dosya değiştiğinde SADECE ilgili görünen komutu değil, dört komutun
  (lint/typecheck/test/build) TAMAMINI yeniden çalıştır (bkz. LEARNINGS.md).
