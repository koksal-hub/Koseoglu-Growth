STATUS — Kısa, güncel durum (master ajanın okuması için)

last_update: 2026-08-13T20:55:00+03:00
last_actor: Claude Code (context refresh + Phase 0 foundation verification)

CURRENT PHASE: PHASE 0 — FOUNDATION
ACTIVE ISSUE: #1 — Phase 0: Foundation (GitHub'da henüz açılmadı, bkz. TASKS.md —
gh CLI bu ortamda mevcut değil; Köksal veya gh erişimi olan bir ajan açmalı)
ACTIVE BRANCH: main (PUSH EDİLDİ — son commit: 047e9ad)

LAST COMPLETED TASK:
- Repository yapısı düzeltildi: `.git` yanlışlıkla iç içe bir
  `Koseoglu-Growth/Koseoglu-Growth/` klasöründeydi (0 commit), proje köküne
  taşındı.
- Proje hafıza dosyaları (MASTER_PLAN, AGENTS, TASKS, STATUS, ERRORS, LEARNINGS,
  README) yeni mimari kararlarla EK olarak güncellendi, eski kurallar korundu.
  DECISIONS.md ve REFERENCES.md yeni oluşturuldu.
- Toolchain gerçek şekilde doğrulandı ve bulunan gerçek hatalar düzeltildi
  (detaylar ERRORS.md'de): vitest watch-mode takılması, test'te DATABASE_URL
  eksikliği, pnpm build filter'ının bozuk olması (özyinelemeli hataya yol
  açıyordu), Docker Desktop'ın kapalı olması, ci.yml'de geçersiz pnpm sürümü +
  eksik Node kurulum adımı.
- 3 commit main branch'e PUSH EDİLDİ (2ea83be, d4065a8, 047e9ad).
  https://github.com/koksal-hub/Koseoglu-Growth main branch'te güncel.

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
- GitHub Actions CI: HENÜZ ÇALIŞMADI — .github/workflows/ci.yml, GitHub OAuth
  scope kısıtlaması yüzünden repoda YOK (bkz. OPEN BLOCKERS). CI PASS
  doğrulanmadan Phase 0 DONE sayılmayacak.

OPEN BLOCKERS:
- **CI dosyası GitHub'da yok**: `.github/workflows/ci.yml`, kullanılan
  GitHub kimlik bilgisinin (OAuth App: gist/read:org/repo scope'ları var,
  `workflow` yok) bu yolu push edememesi nedeniyle git takibinden çıkarıldı
  ve push edilemedi. Diğer her şey (kod, dokümanlar) main branch'te.
  ÇÖZÜM: Köksal, aşağıdaki içeriği GitHub web arayüzünden
  (github.com/koksal-hub/Koseoglu-Growth → Add file → Create new file →
  `.github/workflows/ci.yml`) manuel olarak eklemeli. Web UI kendi
  oturum/cookie auth'unu kullandığı için bu scope kısıtlamasına tabi değil.
  Düzeltilmiş (pnpm sürümü + Node kurulum adımı eklenmiş) içerik aşağıda —
  aynısı ayrıca lokal diskte `.github/workflows/ci.yml` olarak duruyor.
  NOT: Bu OAuth scope kısıtlaması `.github/workflows/` altındaki HER gelecek
  değişiklik için tekrar edecektir; kalıcı çözüm workflow scope'lu bir
  Personal Access Token kullanmaktır.
- GitHub Issues bu ortamda otomatik açılamadı (gh CLI yok). Manuel oluşturma
  komutları TASKS.md içinde.

NEXT ACTION:
- Köksal ci.yml'i GitHub web UI'dan ekleyip push/merge edince: bu ortamda
  `git pull` ile senkronize edilecek.
- İlk GitHub Actions CI çalışması izlenip install→lint→typecheck→test→build
  hepsi PASS olduğu doğrulanacak.
- CI PASS doğrulandıktan sonra Issue #1 DONE işaretlenecek ve Issue #2/#3 için
  gh ile (veya manuel) GitHub Issue'ları açılacak.

CI.YML İÇERİĞİ (GitHub web UI'dan eklenecek, düzeltilmiş hali):

```yaml
name: CI

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 11
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - name: Install dependencies
        run: pnpm install
      - name: Lint
        run: pnpm lint
      - name: Typecheck
        run: pnpm typecheck
      - name: Test
        run: pnpm test
      - name: Build
        run: pnpm build
```

notes:
- Her ajan bu dosyayı okuyup iş devralmalıdır. Değişiklik yapmadan önce TASKS.md
  ve MASTER_PLAN.md okunmalıdır.
- Bu ortamda `node`/`pnpm` PATH'te değil; her komuttan önce
  `export PATH="$HOME/.corepack-shims:/c/Program Files/nodejs:$PATH"`
  çalıştırılmalı (bkz. ERRORS.md → pnpm-path-erisilemiyor).
