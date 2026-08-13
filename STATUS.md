STATUS — Kısa, güncel durum (60 satır limiti — bkz. AGENTS.md)

last_update: 2026-08-13T22:52:00+03:00
last_actor: Claude Code

CURRENT PHASE: PHASE 1 — DATA FOUNDATION (kod hazır, review gate açık)
ACTIVE WORK: Process + Architecture Review Gate (Phase 1 ile Phase 2 arasına
konuldu — bkz. REVIEW-issue2.md) + AI-WORKFLOW v2 öneri raporu (onay bekliyor)
ACTIVE BRANCH: chore/process-review-gate (main değil — PR #4 bekliyor)

ISSUE #2 (Data Models): AÇIK. DONE/APPROVED olarak işaretlenmedi — kapanış
kararı Köksal'a ait.

GERÇEK, DOĞRULANMIŞ DURUM:
- Lokalde: lint/typecheck/test(33/33)/build PASS.
- **GitHub Actions CI: GERÇEKTEN PASS.** SSH ile push engeli aşıldı (OAuth
  workflow-scope kısıtlaması SSH'i etkilemiyor — 2 kez gerçek push ile
  KANITLANDI). install → migrate deploy → lint → typecheck → test → build
  zinciri GitHub'da gerçekten yeşil:
  https://github.com/koksal-hub/Koseoglu-Growth/actions/runs/31737810292
- PR #4 açıklaması güncel ve doğru.

OPEN BLOCKERS:
1. GitHub Issues gerçek olarak açık değil (gh CLI yok).
2. REVIEW-issue2.md'deki A-I açık noktaları Köksal onayı bekliyor (C
   escalate edildi, A/B/D/F kod düzeltmesiyle çözüldü).
3. AI-WORKFLOW v2 öneri raporu 1 taze ajanla denetleniyor, Köksal onayı
   bekliyor — henüz repo'ya commit edilmedi.

NEXT ACTION:
- AI-WORKFLOW raporu tamamlanınca Köksal'a sun.
- Köksal PR #4'ü ve raporu inceleyip onaylayınca: PR merge, Issue #2 kapanır.
- Ardından Phase 2 (Research/Verification/Evidence) başlar.

notes:
- Node/pnpm PATH'te değil: `export PATH="$HOME/.corepack-shims:/c/Program Files/nodejs:$PATH"`.
- Git remote artık SSH (`git@github.com:...`), HTTPS/OAuth değil.
- Detaylı hata/öğrenim geçmişi için ERRORS.md / LEARNINGS.md (rotasyonlu).
