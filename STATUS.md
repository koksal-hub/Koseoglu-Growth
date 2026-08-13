STATUS — Kısa, güncel durum (60 satır limiti — bkz. AGENTS.md)

last_update: 2026-08-13T22:00:00+03:00
last_actor: Claude Code

CURRENT PHASE: PHASE 1 — DATA FOUNDATION (kod tarafı hazır, review gate açık)
ACTIVE WORK: Process + Architecture Review Gate (Phase 1 ile Phase 2 arasına
konuldu — bkz. REVIEW-issue2.md)
ACTIVE BRANCH: chore/process-review-gate (main değil — PR bekliyor)

ISSUE #2 (Data Models): AÇIK. DONE/APPROVED olarak işaretlenmedi — bağımsız
review paketi (REVIEW-issue2.md) hazırlanıyor, kapanış kararı Köksal'a ait.

GERÇEK, DOĞRULANMIŞ DURUM:
- Lokalde: lint/typecheck/test(31/31)/build PASS.
- GitHub Actions CI: `.github/workflows/ci.yml` repo'da untracked (workflow-
  scope OAuth kısıtlaması, bkz. ERRORS.md). GitHub'da şu an ESKİ workflow
  (Postgres servisi yok) çalışıyor — Faz 1'in entegrasyon testleri GERÇEK
  CI'DA HİÇ DOĞRULANMADI. Bu, Faz 2'ye geçmeden önce kapatılması gereken en
  somut açık.

OPEN BLOCKERS:
1. ci.yml push edilemiyor → Köksal'ın web UI'dan eklemesi gerekiyor (yeniden).
2. GitHub Issues gerçek olarak açık değil (gh CLI yok).
3. REVIEW-issue2.md'deki A-I açık noktaları Köksal onayı bekliyor.

NEXT ACTION:
- PR aç (chore/process-review-gate → main), Köksal review etsin.
- Köksal ci.yml'i web UI'dan eklesin → CI gerçekten yeşil olsun.
- REVIEW-issue2.md'deki açık noktalar (A-I) karara bağlanınca Issue #2 kapanır.
- Ardından Phase 2 (Research/Verification/Evidence) başlar.

notes:
- Node/pnpm PATH'te değil: `export PATH="$HOME/.corepack-shims:/c/Program Files/nodejs:$PATH"`.
- Detaylı hata/öğrenim geçmişi için ERRORS.md / LEARNINGS.md (rotasyonlu).
