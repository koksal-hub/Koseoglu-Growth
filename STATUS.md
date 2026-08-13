STATUS — Kısa, güncel durum (master ajanın okuması için)

last_update: 2026-08-13T20:45:00+03:00
last_actor: Claude Code (context refresh + Phase 0 foundation verification)

CURRENT PHASE: PHASE 0 — FOUNDATION
ACTIVE ISSUE: #1 — Phase 0: Foundation (GitHub'da henüz açılmadı, bkz. TASKS.md —
gh CLI bu ortamda mevcut değil; Köksal veya gh erişimi olan bir ajan açmalı)
ACTIVE BRANCH: main (ilk commit lokalde yapıldı — 2ea83be — henüz remote'a push
edilmedi, bkz. OPEN BLOCKERS)

LAST COMPLETED TASK:
- Repository yapısı düzeltildi: `.git` yanlışlıkla iç içe bir
  `Koseoglu-Growth/Koseoglu-Growth/` klasöründeydi (0 commit), proje köküne
  taşındı.
- Proje hafıza dosyaları (MASTER_PLAN, AGENTS, TASKS, STATUS, ERRORS, LEARNINGS,
  README) yeni mimari kararlarla EK olarak güncellendi, eski kurallar korundu.
  DECISIONS.md ve REFERENCES.md yeni oluşturuldu.
- Toolchain gerçek şekilde doğrulandı ve bulunan 4 gerçek hata düzeltildi
  (detaylar ERRORS.md'de): vitest watch-mode takılması, test'te DATABASE_URL
  eksikliği, pnpm build filter'ının bozuk olması (özyinelemeli hataya yol
  açıyordu), Docker Desktop'ın kapalı olması.
- İlk commit main branch'e lokalde yapıldı (2ea83be).

CURRENT QUALITY STATUS (gerçek, doğrulanmış — 2026-08-13T20:35 itibarıyla):
- node: v24.19.0 (PATH'te değildi, `/c/Program Files/nodejs` eklendi)
- pnpm: 11.21.0 (corepack shim ile; bkz. ERRORS.md)
- git: 2.55.0
- docker: 29.6.1 — daemon başlangıçta kapalıydı, başlatıldı, ÇALIŞIYOR
- pnpm install: PASS
- pnpm lint: PASS
- pnpm typecheck: PASS
- pnpm test: PASS (1/1, health test)
- pnpm build: PASS (apps/api + apps/web)
- docker compose (Postgres): PASS, container "healthy"
- /api/health canlı sunucuya karşı gerçek curl ile doğrulandı: HTTP 200,
  {"status":"ok"}
- GitHub Actions CI: HENÜZ ÇALIŞMADI — commit remote'a push edilmedi (bkz.
  OPEN BLOCKERS). CI PASS doğrulanmadan Phase 0 DONE sayılmayacak.

OPEN BLOCKERS:
- **Push engellendi**: `git push origin main`, kullanılan GitHub OAuth
  token'ının `workflow` scope'u olmadığı için `.github/workflows/ci.yml`
  dosyasını reddetti ("refusing to allow an OAuth App to create or update
  workflow ... without `workflow` scope"). Yerel credential cache temizlendi
  ama GitHub aynı OAuth App yetkisini (workflow scope'suz) sessizce yeniden
  verdi. Çözüm için Köksal'ın https://github.com/settings/applications
  üzerinden ilgili OAuth App'i (Git Credential Manager) REVOKE etmesi ve
  push'u tekrar tetiklemesi GEREKİYOR, ya da `workflow` scope'lu bir Personal
  Access Token sağlaması gerekiyor. Kullanıcıya soruldu, yanıt bekleniyor.
- GitHub Issues bu ortamda otomatik açılamadı (gh CLI yok). Manuel oluşturma
  komutları TASKS.md içinde.

NEXT ACTION:
- Köksal OAuth App'i revoke edince veya PAT sağlayınca: `git push -u origin
  main` tekrar denenecek.
- Push başarılı olunca GitHub Actions CI sonucu doğrulanacak (install → lint
  → typecheck → test → build hepsi PASS olmalı).
- CI PASS doğrulandıktan sonra Issue #1 DONE işaretlenecek ve Issue #2/#3 için
  gh ile (veya manuel) GitHub Issue'ları açılacak.

notes:
- Her ajan bu dosyayı okuyup iş devralmalıdır. Değişiklik yapmadan önce TASKS.md
  ve MASTER_PLAN.md okunmalıdır.
- Bu ortamda `node`/`pnpm` PATH'te değil; her komuttan önce
  `export PATH="$HOME/.corepack-shims:/c/Program Files/nodejs:$PATH"`
  çalıştırılmalı (bkz. ERRORS.md → pnpm-path-erisilemiyor).
