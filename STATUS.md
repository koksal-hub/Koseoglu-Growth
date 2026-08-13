STATUS — Kısa, güncel durum (master ajanın okuması için)

last_update: 2026-08-13T21:00:00+03:00
last_actor: Claude Code (Phase 0 foundation — CI PASS ile doğrulandı)

CURRENT PHASE: PHASE 0 — FOUNDATION — **DONE**
ACTIVE ISSUE: #1 — Phase 0: Foundation (GitHub'da henüz açılmadı, bkz. TASKS.md
— gh CLI bu ortamda mevcut değil; kabul kriterleri karşılandı, Issue açılınca
DONE olarak kapatılmalı)
ACTIVE BRANCH: main (GitHub ile senkron, son commit: 2caacb6)

LAST COMPLETED TASK:
- `.github/workflows/ci.yml`, GitHub OAuth scope kısıtlaması yüzünden ben push
  edemediğim için Köksal tarafından GitHub web UI'dan eklendi (4fe5e32), Node
  sürümü 24'e güncellendi (c609b8b).
- İlk gerçek CI çalışması FAILURE verdi: `pnpm lint`, kök dizine eklenen
  `vitest.config.ts`'in hiçbir tsconfig `include`'unda olmaması yüzünden
  ESLint'in tip-farkında parser'ında hata veriyordu (detay: ERRORS.md →
  eslint-vitest-config-tsconfig-disinda). `tsconfig.base.json`'a `"*.ts"`
  eklenerek düzeltildi, lokalde lint/typecheck/test/build tekrar PASS oldu,
  push edildi (2caacb6).
- **GitHub Actions CI, commit 2caacb6 için gerçekten PASS verdi**:
  https://github.com/koksal-hub/Koseoglu-Growth/actions/runs/31728265957
  (conclusion: success) — API üzerinden doğrulandı, tahmin değil.

CURRENT QUALITY STATUS (gerçek, doğrulanmış):
- pnpm install: PASS (lokal + CI)
- pnpm lint: PASS (lokal + CI)
- pnpm typecheck: PASS (lokal + CI)
- pnpm test: PASS (lokal + CI, 1/1)
- pnpm build: PASS (lokal + CI)
- docker compose (Postgres): PASS, container healthy
- /api/health: HTTP 200 (canlı sunucuya karşı doğrulandı)
- GitHub Actions CI: **PASS** (main branch, commit 2caacb6)

OPEN BLOCKERS:
- GitHub Issues bu ortamda otomatik açılamadı (gh CLI yok). Issue #1/#2/#3
  için manuel oluşturma komutları TASKS.md içinde — Köksal veya gh erişimi
  olan bir ajan açmalı.
- Kalıcı not: Bu repoda `.github/workflows/*` altına git push ile değişiklik
  yapmak, kullanılan GitHub kimlik bilgisinin `workflow` scope'u olmadığı
  sürece HER SEFERİNDE aynı şekilde reddedilecek (bkz. ERRORS.md →
  github-push-workflow-scope-eksik). Bu klasöre dokunan gelecek değişiklikler
  ya `workflow` scope'lu bir PAT gerektirir ya da GitHub web UI'dan manuel
  yapılmalı.

NEXT ACTION (PHASE 1'e geçiş):
- GitHub Issue #1'i (gh CLI veya web UI ile) açıp CI PASS kanıtıyla DONE
  olarak kapat.
- Issue #2 (Data Models / Phase 1) aç: Company, Contact, Lead, Activity,
  FollowUp, Opportunity, Source/Channel modelleri + Entity Resolution temel
  kuralları + Event Store temel şeması (bkz. MASTER_PLAN.md Faz 1, TASKS.md
  Issue #2 acceptance criteria).

notes:
- Her ajan bu dosyayı okuyup iş devralmalıdır. Değişiklik yapmadan önce TASKS.md
  ve MASTER_PLAN.md okunmalıdır.
- Bu ortamda `node`/`pnpm` PATH'te değil; her komuttan önce
  `export PATH="$HOME/.corepack-shims:/c/Program Files/nodejs:$PATH"`
  çalıştırılmalı (bkz. ERRORS.md → pnpm-path-erisilemiyor).
- Bir dosya değiştiğinde SADECE ilgili görünen komutu değil, dört komutun
  (lint/typecheck/test/build) TAMAMINI yeniden çalıştır (bkz. LEARNINGS.md).
