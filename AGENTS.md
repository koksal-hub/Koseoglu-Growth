AGENTS — Köseoğlu Growth Ajan Kuralları

Genel kural: Her ajan göreve başlamadan önce MASTER_PLAN.md, TASKS.md ve STATUS.md
dosyalarını okumalıdır.

================================================================
ROLLER VE SORUMLULUKLAR (korunuyor)
================================================================

- CODEX — Başmühendis / Reviewer
  - Mimari kararlar, kritik inceleme, güvenlik, DB ve API tasarımı.

- CLAUDE CODE — Ana geliştirici
  - Uzun süreli geliştirme, backend/frontend, Docker, Prisma, API, test.

- GITHUB COPILOT — VS Code yardımcı
  - Küçük değişiklikler, boilerplate, hızlı fix.

- GEMINI CLI — Test/İkinci görüş
  - Test oluşturma, başarısız test analizi, alternatif çözüm önerisi.

- QWEN CODE — Yedek işçi
  - Dokümantasyon, tekrar eden düşük riskli işler, yardımcı görevler.

- (gelecekteki local/free agent'lar) — aynı kurallara tabidir.

Tüm coding agent'lar (Claude Code, Codex, Copilot, gelecekteki local/free agent'lar)
DEĞİŞTİRİLEBİLİR İŞÇİLERDİR. Hiçbiri projenin hafızası değildir — proje hafızası
repository'nin kendisidir.

================================================================
GITHUB = TEK DOĞRULUK KAYNAĞI (2026-08 EK)
================================================================

- GitHub (Issues, branch'ler, commit geçmişi, PR'lar, CI sonuçları) tek doğruluk
  kaynağıdır (single source of truth).
- AI sohbet geçmişi (Claude/Codex/Copilot konuşmaları) source of truth DEĞİLDİR.
  Bir sohbette söylenen hiçbir şey, repository'de karşılığı yoksa gerçekleşmiş
  sayılmaz.
- Her ajan işe başlarken şunları okumalıdır:
  - MASTER_PLAN.md
  - AGENTS.md
  - STATUS.md
  - aktif GitHub Issue
  - aktif branch
  - son commit'ler
  - test/CI durumu

================================================================
GÖREV AKIŞI (2026-08 EK — genişletilmiş)
================================================================

Her görev şu akıştan geçmelidir:

PLAN → IMPLEMENT → LINT → TYPECHECK → TEST → BUILD → VERIFY → COMMIT → PUSH → CI → REPORT

- AI'nın "çalışıyor" demesi KANIT DEĞİLDİR. Kanıt: gerçek komut çıktısı, geçen
  test, yeşil CI.
- Güvenli development işlemlerinde (kod yazma, test çalıştırma, lint/typecheck/build,
  commit, push, PR açma, dokümantasyon güncelleme) sürekli kullanıcı onayı istenmez.
- Aşağıdaki durumlarda İŞLEM DURDURULUR ve kullanıcıdan açık onay istenir:
  - production data deletion
  - database reset/drop
  - secret sızıntısı veya secret commit riski
  - payment/ödeme işlemleri
  - gerçek müşteri e-postasına gönderim
  - geri alınamaz (irreversible) production işlemleri

================================================================
KOTA / SESSION SONU KURALI (2026-08 EK)
================================================================

Claude/Codex kotası veya session sona yaklaşıyorsa:
- yeni büyük işe başlanmaz
- mevcut iş stabil hale getirilir
- test edilir
- commit/push edilir
- STATUS.md güncellenir
- gerekiyorsa ERRORS.md / LEARNINGS.md güncellenir
- bir HANDOFF oluşturulur

HANDOFF FORMATI:

ISSUE:
BRANCH:
LAST COMMIT:
DONE:
CHANGED FILES:
TESTS:
CI:
OPEN ERRORS:
ROOT CAUSE:
REMAINING WORK:
NEXT FIRST STEP:

================================================================
İLETİŞİM (korunuyor)
================================================================

- Ajanlar değişiklik yaptığında STATUS.md'e kısa bir özet bırakır (son işlem,
  değiştirilen dosyalar, açık testler, bir sonraki adım).
- Her değişiklik STATUS.md içinde belgelenmelidir.
- Hata bulunduğunda ERRORS.md güncellenmelidir.
- Önemli teknik öğrenimler LEARNINGS.md içine yazılmalıdır.
- Aynı anda kritik dosyayı değiştirmeyin; paralel iş için ayrı task/branch kullanın.
- Hiçbir ajan ana planı (MASTER_PLAN.md) tek başına değiştiremez.

Bu dosya sürekli olarak ajanlar tarafından referans alınacak temel kuralları içerir.
