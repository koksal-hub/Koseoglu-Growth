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
- Durum: IN_PROGRESS (schema + entity resolution + testler lokalde PASS;
  CI PASS doğrulanınca DONE)
- Bağımlılıklar: Issue #1 DONE olmalı (DONE — CI PASS ile doğrulandı)
- Acceptance criteria:
  - [x] Prisma şemasına çekirdek modeller eklendi: Company, Contact, Lead,
    Activity, FollowUp, Opportunity, Evidence, Event (Source/Channel: ayrı
    tablo yerine Company/Contact/Lead üzerinde SourceChannel enum alanı —
    overengineering'den kaçınıldı)
  - [x] Migration oluşturuldu ve uygulandı (geri alınabilir — yalnızca
    CREATE TABLE/ADD CONSTRAINT, DROP/DELETE yok)
  - [x] Entity Resolution: deterministik normalizasyon + öncelik sıralı
    duplicate detection (tax number → domain → phone → email domain →
    address → normalized name → similarity), 22 unit test ile doğrulandı
  - [x] Event Store: Event modeli (entityType/entityId polimorfik referans,
    metadata JSON) + Evidence modeli (Company/Lead/Event ile ilişkili)
  - [ ] GitHub Actions CI PASS (Postgres servisiyle) — bekleniyor, bkz.
    STATUS.md

--- Issue #2b — Phase 0/1 Hardening (Öncelik 0-4 kapanış planı) ---
- Öncelik: HIGH
- Sorumlu: Devin
- Durum: REVIEW (PR açıldı; CI PASS doğrulanınca DONE)
- Bağımlılıklar: Issue #2
- Acceptance criteria:
  - [x] `.github/workflows/ci.yml` repoda mevcut (Postgres service +
    migrate deploy + lint→typecheck→test→build) — push edildi, önceki
    workflow-scope blocker'ı bu ortamda oluşmadı
  - [x] Graceful shutdown (SIGTERM/SIGINT → server.close + prisma
    $disconnect) + unhandledRejection/uncaughtException handler'ları
  - [x] `/api/health` (liveness) + `/api/ready` (DB `SELECT 1`, düşerse 503)
  - [x] `prisma.ts` doğrulanmamış env fallback'i kaldırıldı
  - [x] Activity "en az bir Lead/Contact" invariant'ı: createActivity helper
    + additive CHECK constraint migration
  - [x] confidence 0..1 CHECK constraint'leri (Company + Evidence, additive)
  - [x] Entity resolution: free-email blacklist (EMAIL_DOMAIN skip) + PHONE
    düşük güvenli destekleyici sinyal (0.5, öncelik sırası düşürüldü)
  - [x] Nullable email + unique bypass edge-case'i şemada dokümante + testle
    sabitlendi
  - [x] Negatif testler (Activity invariant, aralık dışı confidence, gmail
    EMAIL_DOMAIN eşleşmemesi, ortak telefon) — test sayısı 31 → 44
  - [x] Frontend test altyapısı (vitest + jsdom + RTL, App smoke testi)
  - [x] Frontend düzeltmeleri: lang="tr", #root null guard, vite dev proxy
  - [x] Konfig tutarlılığı: workspaces tek kaynak, engines/packageManager/
    .nvmrc, LOG_LEVEL + CORS_ORIGINS senkronu, env şeması sertleştirme,
    helmet/cors/rate-limit, docker-compose (db+migrate+api) çalışır durumda
  - [ ] GitHub Actions CI PASS (PR üzerinde) — bekleniyor
- NOT: İyileştirme maddeleri (22-26: central logging, ER ölçeklenebilirlik,
  hata sözleşmesi + metrics, coverage threshold, frontend MVP) ayrı
  PR'larda ele alınacak.

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
