TASKS — GitHub Issues'a pointer

================================================================
GERÇEK GÖREV KUYRUĞU: GITHUB ISSUES
================================================================

https://github.com/koksal-hub/Koseoglu-Growth/issues

Bu dosya ikinci, bağımsız bir görev sistemi DEĞİLDİR. Görev durumu, öncelik ve
kabul kriterleri GitHub Issues üzerinde tutulur. Çelişki durumunda GitHub Issue
esastır, bu dosya değil.

================================================================
BİLİNEN AÇIK — Issue #1/#2/#3 henüz gerçek GitHub Issue değil
================================================================

Bu ortamda GitHub CLI (`gh`) kurulu/authenticate değil ve kullanılan git
kimlik bilgisinin (OAuth App) `workflow` scope'u yok — muhtemelen aynı token
`issues:write` iznine de sahip değil (doğrulanmadı). Bu yüzden Issue #1/#2/#3,
MASTER_PLAN.md Faz 0-2'ye karşılık gelen HEDEF yapı olarak yalnızca bu dosyada
ve commit mesajlarında var; GitHub'da gerçek Issue olarak henüz açılmadı.

Bu, "GitHub tek doğruluk kaynağı" ilkesinin (ADR-002) şu an tam
uygulanamadığı bilinen bir boşluktur — düzeltilene kadar öyle kalacak.

Açma komutları (gh CLI veya web UI erişimi olduğunda):

gh issue create --title "Phase 0: Foundation" --body "..."
gh issue create --title "Data Models (Phase 1)" --body "..."
gh issue create --title "Process + Architecture Review Gate" --body "..."
gh issue create --title "Research / Verification / Evidence (Phase 2)" --body "..."

================================================================
GÖREV FORMATI (Issue açarken kullanılacak şablon)
================================================================

- Başlık: Kısa açıklama
- Öncelik: HIGH / MEDIUM / LOW
- Durum: TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE
- Bağımlılıklar: (varsa)
- Acceptance criteria: Net, test edilebilir kabul kriterleri

================================================================
KALICI ALTYAPI GÖREVLERİ (ERRORS.md'den — oturumluk kalmaması gerekenler)
================================================================

Bunlar her oturumda tekrar "workaround" edilmek yerine bir kez kalıcı
çözülmesi gereken açık işler (bkz. AGENTS.md → Doküman Büyüme Kuralı):

- infra-workflow-scope-pat: GitHub'a `workflow` scope'lu bir Personal Access
  Token bağlanmalı — aksi halde `.github/workflows/ci.yml`'e her dokunuşta
  push reddedilmeye devam eder (bkz. ERRORS.md →
  github-push-workflow-scope-eksik).
- infra-node-pnpm-path: Node/pnpm'in kullanılan shell ortamının PATH'ine
  kalıcı eklenmesi (bkz. ERRORS.md → pnpm-path-erisilemiyor).
- infra-docker-autostart: Docker Desktop'ın oturum açılışında otomatik
  başlaması (bkz. ERRORS.md → docker-daemon-baslangicta-calismiyordu).
- infra-onedrive-relocation: Proje kökünün OneDrive senkronizasyonu dışına
  taşınması değerlendirilmeli (bkz. LEARNINGS.md → OneDrive içinde git repo).
