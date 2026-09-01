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
- Durum: DONE (PR #5 CI PASS sonrası `main` üzerine merge edildi; Issue #2 kapatıldı)
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
  - [x] GitHub Actions CI PASS (Postgres servisiyle)

--- Issue #2b — Phase 0/1 Hardening (Öncelik 0-4 kapanış planı) ---
- Öncelik: HIGH
- Sorumlu: Devin
- Durum: DONE (PR #5 merge commit `8a6e2ec`)
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
  - [x] GitHub Actions CI PASS (PR #5, `build` job'ı yeşil)
- NOT: İyileştirme maddeleri (22-26: central logging, ER ölçeklenebilirlik,
  hata sözleşmesi + metrics, coverage threshold, frontend MVP) ayrı
  PR'larda ele alınacak.

--- İyileştirme 22 — Central Logging ---
- Öncelik: HIGH
- Sorumlu: Codex review
- Durum: DONE (PR #6; GitHub Actions run `33472791803` PASS; merge `2f6f11a`)
- Bağımlılıklar: Issue #2 DONE
- Acceptance criteria:
  - [x] Her istekte correlation id var ve response `x-request-id` başlığında dönüyor
  - [x] Dış request id yalnız sınırlı, log-safe sözleşmeyi sağlarsa kabul ediliyor
  - [x] Authorization, cookie, x-api-key ve set-cookie gerçek log çıktısında maskeleniyor
  - [x] Pino doğrudan bağımlılığı Fastify logger tipiyle aynı major sürümde
  - [x] İzole DB üzerinde lint/typecheck/test (56/56)/build PASS
  - [x] GitHub Actions CI PASS ve PR #6 merge

--- Issue #3 — Research / Verification / Evidence (Phase 2) ---
- Öncelik: MEDIUM
- Sorumlu: Codex
- Durum: IN_PROGRESS (ilk Research Mission dilimi PR #7 ile merge edildi;
  otomatik extraction/ikinci-kaynak politikası henüz yapılmadı)
- Bağımlılıklar: Issue #2 DONE olmalı
- Acceptance criteria:
  - [x] Manuel/fixture tabanlı Company Discovery iskeleti çalışır
  - [x] Mission → candidate → evidence → human decision temel akışı var
  - [x] Confidence Gate düşük güvenli adayın kabulünü ve Lead üretimini engeller
  - [x] Evidence Store'a URL/accessedAt/summary/confidence/provenance kaydı yapılır
  - [x] Dış özet untrusted data kalır; credential/secret taşıyan kaynak URL reddedilir
  - [x] Deterministik duplicate önerisi insan onaylı kanonik bağdan ayrıdır
  - [x] Yerel migration/lint/typecheck/test (71/71)/build PASS
  - [x] İlk dikey dilim için GitHub Actions CI PASS ve PR #7 merge (`4978d2f`)
  - [ ] Otomatik sektör/faaliyet/lokasyon/contact-signal extraction
  - [ ] İkinci kaynak politikası; ileride AI kullanılırsa AI receipt

--- Issue #8 — ContactPoint, Permission ve Suppression Gate (Phase 2b) ---
- Öncelik: HIGH
- Sorumlu: Codex
- Durum: DONE (PR #9; run `33476774205` PASS; squash merge `4272840`;
  Issue #8 completed/closed)
- Bağımlılıklar: Issue #3 Research Mission ilk dikey dilimi merge edilmiş olmalı
- Acceptance criteria:
  - [x] Şirket genel ve kişi iş/personal iletişim noktaları ayrı sınıflanır
  - [x] Kaynak, toplama zamanı, verification receipt, confidence ve retention zorunlulukları
  - [x] E-posta normalizasyonu ve sıkı E.164 telefon doğrulaması
  - [x] Public kaynağın iletişim izni sayılmaması; `UNKNOWN`/unverified deny
  - [x] Ülke, kanal, amaç, veri dayanağı ve iletişim kuralı ayrı receipt olarak saklanır
  - [x] Global opt-out/suppression normalize alıcı hash'iyle bypass edilemez
  - [x] Verified + reviewed ALLOWED için dry-run gate; gerçek gönderim yok
  - [x] Additive migration temiz disposable DB'ye sıfırdan uygulandı
  - [x] Odaklı API/DB regresyonları PASS (26/26)
  - [x] Tam lint/typecheck/test (97/97)/build ve güvenlik/veri taraması PASS
  - [x] GitHub Actions CI PASS ve PR #9 merge

--- Issue #11 — Deterministic Ranking ve Daily Action API (Phase 3) ---
- Öncelik: HIGH
- Sorumlu: Codex
- Durum: DONE (PR #12 CI PASS sonrası `main` üzerine `8d47703` ile merge edildi;
  Issue #11 kapatıldı)
- Bağımlılıklar: Issue #8 DONE
- Acceptance criteria:
  - [x] Aynı kanonik input + policy version aynı input hash/score/receipt üretir
  - [x] Beş bileşen 0..20, total 0..100 ve exact sum DB constraint ile korunur
  - [x] Stale/unknown/low-confidence/future/90 günden eski evidence puan vermez
  - [x] Public/unverified veya permission'sız contact outreach-ready sayılmaz
  - [x] Global suppression terminal `HONOR_SUPPRESSION` aksiyonu üretir
  - [x] Reason/evidence/contact/gate source-time receipt'i ve algorithm/policy version saklanır
  - [x] Daily Action sonuçları score + deterministic name/id tie-breaker ile sıralanır
  - [x] Otomatik Lead/Activity/Outreach/send/provider çağrısı yoktur
  - [x] Temiz DB'de beş migration; Prisma/lint/typecheck; odaklı 9/9; tam 106/106; build PASS
  - [x] GitHub Actions CI PASS (run `33478818433`) ve PR #12 merge

--- Issue #14 — Outreach Draft ve Bağımsız İnsan Onayı (Phase 4) ---
- Öncelik: HIGH
- Sorumlu: Codex
- Durum: DONE (commit `93a5022`; PR #15 run `33482197125` PASS sonrası
  `main` üzerine `39699eb` ile merge edildi; Issue #14 kapatıldı)
- Bağımlılıklar: Issue #11 DONE
- Acceptance criteria:
  - [x] Yalnız güncel `READY_FOR_HUMAN_OUTREACH_REVIEW` ranking receipt'i draft açar
  - [x] Recipient snapshot ham değer yerine pseudonymous SHA-256 hash taşır
  - [x] İnsan-yazarlı içerik revision/content hash geçmişi append-only korunur
  - [x] `DRAFT → IN_REVIEW → APPROVED | REJECTED | EXPIRED` geçişleri uygulanır
  - [x] Review ve karar anında permission/policy/suppression gate yeniden çalışır
  - [x] İçerik yazarlarının hiçbiri approval kararı veremez
  - [x] Approval hash'i DB foreign key'iyle exact revision'a bağlanır
  - [x] Provider/send/Lead/Activity yok; approval dahi `sendAuthorized=false`
  - [x] Sekiz migration temiz DB'ye sıfırdan uygulandı; 29 constraint/FK + 3 trigger doğrulandı
  - [x] Prisma/lint/typecheck; odaklı 10/10; tam 116/116; API+web build PASS
  - [x] GitHub Actions CI PASS (run `33482197125`) ve PR #15 merge (`39699eb`)

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
