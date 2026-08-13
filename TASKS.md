TASKS — Görev listesi formatı ve GitHub Issues senkronizasyonu

================================================================
ÖNEMLİ KURAL
================================================================

GitHub Issues ESAS görev kuyruğudur. Bu dosya GitHub Issues ile ÇELİŞMEZ ve ikinci
bağımsız bir task sistemi değildir — burası yalnızca Issue'ların kısa bir aynası ve
görev formatı referansıdır.

Issue #1 tamamlanmadan (CI PASS + gerçek doğrulama) Issue #2 implementasyonuna
geçilmez.

================================================================
GÖREV FORMATI
================================================================

Her görev şu alanları içermelidir:
- ID: kısa-kebabcased-id
- Başlık: Kısa açıklama
- Öncelik: HIGH / MEDIUM / LOW
- Sorumlu ajan/rol: (Codex / Claude Code / GitHub Copilot / Gemini CLI / Qwen Code)
- Durum: TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE
- Bağımlılıklar: (varsa)
- Acceptance criteria: Net, test edilebilir kabul kriterleri

================================================================
GITHUB ISSUES (AYNA)
================================================================

NOT: Bu ortamda GitHub CLI (gh) kurulu/authenticate değil, bu yüzden Issue'lar bu
oturumda otomatik olarak GitHub üzerinde açılamadı. Aşağıdaki üç Issue MASTER_PLAN
Faz 0-2'ye karşılık gelen HEDEF yapıdır. Köksal veya gh CLI erişimi olan bir ajan
bunları gerçek GitHub Issue'larına dönüştürmelidir (öneri komutları en altta).

--- Issue #1 — Phase 0: Foundation ---
- Öncelik: HIGH
- Sorumlu: Claude Code
- Durum: IN_PROGRESS
- Bağımlılıklar: None
- Acceptance criteria:
  - pnpm install çalışır
  - pnpm lint / typecheck / test / build geçer
  - PostgreSQL Docker Compose ile çalışır
  - /api/health HTTP 200 döner
  - GitHub Actions CI (install→lint→typecheck→test→build) PASS

--- Issue #2 — Data Models (Phase 1) ---
- Öncelik: HIGH
- Sorumlu: Claude Code / Codex review
- Durum: TODO
- Bağımlılıklar: Issue #1 DONE olmalı
- Acceptance criteria:
  - Prisma şemasına çekirdek modeller eklenir: Company, Contact, Lead, Activity,
    FollowUp, Opportunity, Source/Channel
  - Migration çalışır ve geri alınabilir
  - Entity Resolution için temel benzersizlik/duplicate-check kuralları var
  - Event Store için temel tablo/şema var

--- Issue #3 — Research / Verification / Evidence (Phase 2) ---
- Öncelik: MEDIUM
- Sorumlu: Claude Code
- Durum: TODO
- Bağımlılıklar: Issue #2 DONE olmalı
- Acceptance criteria:
  - Company Discovery iskeleti çalışır
  - Verification Pipeline temel akışı var
  - Confidence Gate düşük güvenli veriyi engeller
  - Evidence Store'a kanıt kaydı yapılır
  - Web Security Gateway + prompt-injection koruması temel seviyede var

================================================================
ISSUE OLUŞTURMA KOMUTLARI (gh CLI mevcut olduğunda)
================================================================

gh issue create --title "Phase 0: Foundation" --body-file .github/ISSUE_1_BODY.md
gh issue create --title "Data Models (Phase 1)" --body-file .github/ISSUE_2_BODY.md
gh issue create --title "Research / Verification / Evidence (Phase 2)" --body-file .github/ISSUE_3_BODY.md

================================================================
YEREL KISA LİSTE (geçmiş kayıt — korunuyor)
================================================================

- foundation-scaffold (DONE) — temel dosyalar oluşturuldu
- toolchain-fixes (IN_PROGRESS) — lint/typecheck düzenlemeleri
- git-root-fix (DONE, 2026-08-13) — .git yanlış iç içe klasördeydi, köke taşındı

Yeni görev eklerken bu dosyaya bir satır ve detay açıklaması ekleyin (yalnızca
GitHub Issue'ların aynası olarak; çelişki durumunda GitHub Issue esastır).
