STATUS — Kısa, güncel durum (60 satır limiti — bkz. AGENTS.md)

last_update: 2026-08-13T23:10:00+03:00
last_actor: Claude Code

CURRENT PHASE: PHASE 1 — DATA FOUNDATION (kod hazır, review gate açık)
ACTIVE WORK: AI-ENGINEERING-STANDARD.md onaylandı ve uygulandı; PR #4
merge onayı bekliyor.
ACTIVE BRANCH: chore/process-review-gate (main değil — PR #4 açık)

ISSUE #2 (Data Models): AÇIK. DONE/APPROVED olarak işaretlenmedi — kapanış
kararı Köksal'a ait (PR #4 merge ile birlikte).

GERÇEK, DOĞRULANMIŞ DURUM:
- Lokalde: lint/typecheck/test(33/33)/build PASS.
- **PR #4 güncel head'i için GitHub Actions CI GERÇEKTEN PASS** (SSH ile
  push, 3 kez doğrulandı — OAuth workflow-scope kısıtlaması SSH'i
  etkilemiyor). Run: bkz. PR #4 açıklaması (güncel head'e göre tutulur).
- PR #4 hâlâ OPEN, MERGED DEĞİL — merge kararı Köksal'a ait.
- AI-WORKFLOW.md → AI-ENGINEERING-STANDARD.md olarak yeniden adlandırıldı,
  bağımsız denetimden geçen düzeltmeler eklendi (Risk B escalation açığı,
  Aggregator kuralı, AŞAMA 1 pilot tanımı, 4 KPI). AGENTS.md 54 satıra
  indirildi, STANDARD'a pointer veriyor.
- AŞAMA 1 pilotu (2-4 free/local scout, manuel, task başına) ONAYLANDI —
  henüz gerçek bir bilette denenmedi.

OPEN BLOCKERS:
1. GitHub Issues gerçek olarak açık değil (gh CLI yok).
2. PR #4 Köksal'ın merge onayını bekliyor.
3. AŞAMA 1 pilotu için free/local araç bu ortamdan otomatik çağrılamıyor
   (Ollama/Antigravity bağlantısı yok) — manuel yürütülmeli.

NEXT ACTION:
- Köksal PR #4'ü inceleyip merge ederse Issue #2 kapanır, Phase 2 başlar.
- AŞAMA 1 pilotu ilk gerçek bilette denenir, 4 KPI elle tutulur.

notes:
- Node/pnpm PATH'te değil: `export PATH="$HOME/.corepack-shims:/c/Program Files/nodejs:$PATH"`.
- Git remote SSH (`git@github.com:...`), HTTPS/OAuth değil.
- Detaylı hata/öğrenim geçmişi için ERRORS.md / LEARNINGS.md (rotasyonlu).
