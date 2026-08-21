AGENTS — Köseoğlu Growth Ajan Kuralları (≤60 satır)

Tam metodoloji/gerekçe: AI-ENGINEERING-STANDARD.md (seyrek okunur — yeni
proje/faz/süreç değişikliğinde). Bu dosya HER oturumda okunur, kısa kalır.

Her ajan başlarken okur: MASTER_PLAN.md, STATUS.md, aktif GitHub Issue/PR,
son commit'ler.

ROLLER (gerçek durum — detay: STANDARD Bölüm 2)
- Claude Code = Yazar. Kendi işini kendi "onaylandı" işaretleyemez.
- CI (GitHub Actions) = otomatik doğrulayıcı; mimari review DEĞİL.
- Reviewer = fiilen Köksal (PR bazında) veya taze bağlamlı bir subagent.
  Codex/Copilot/Gemini/Qwen/free-local: tanımlı ama aktif değil; biri
  gerçekten review yaparsa PR referansıyla kayda geçirilir, iddia edilmez.

RİSK YÖNLENDİRME (detay: STANDARD Bölüm 7/10-11/EK)
- RISK A (düşük): Uygulayıcı → CI → merge. Ekstra ajan yok.
- RISK B (orta): Uygulayıcı → CI → free/local taze reviewer (yoksa taze
  Claude fallback) → kritik/çelişkiliyse premium escalation → merge.
  Reviewer emin değilse veya schema/security/migration'a dokunuyorsa
  2. taze denetçi otomatik tetiklenir.
- RISK C (kritik: şema/auth/secret/ödeme/prod veri): + 2. bağımsız denetçi
  + Köksal onayı zorunlu.

GELİŞTİRME AKIŞI — BRANCH + PR ZORUNLU
feature/issue-N (veya chore/kısa-ad) → PR → CI PASS → Köksal (veya gerçek
reviewer) onayı → merge. Main'e doğrudan push YOK. CI kırmızıyken yeni işe
başlanmaz. "Çalışıyor" demek kanıt değildir — kanıt: GERÇEKTEN GitHub'da
yeşil CI (yalnız lokal doğrulama yeterli değil).

DURDUR VE ONAY İSTE: production data deletion, DB reset/drop, main'e
merge, secret sızıntısı, ödeme, gerçek müşteri e-postası, geri alınamaz
production işlemi.

MIGRATION DEFINITION OF DONE
1. Temiz DB testi (CI otomatik sağlar). 2. Upgrade path testi (ELLE —
önceki migration + veri üzerine yeni migration uygula, doğrula).
3. Destructive SQL taraması (DROP/DELETE/TRUNCATE). 4. Destructive ise
backup/restore planı PR'da yazılı. Zorunlu down-migration YOK.

DOKÜMAN BÜYÜME KURALI
STATUS.md ≤60 satır (yalnız "şu an"; geçmiş git log'da). ERRORS.md/
LEARNINGS.md 15 girişi geçince eskiler *_ARCHIVE.md'ye taşınır.
LEARNINGS.md yalnız gerçek olaylardan gelir, plan/standart kopyası değil.
**Aynı hata 2. kez tekrar ederse workaround değil kök neden zorunlu.**

İLETİŞİM
Değişiklik sonrası STATUS.md kısa özetle güncellenir. Kritik dosyayı
paralel değiştirmeyin, ayrı branch kullanın. MASTER_PLAN.md'yi tek ajan
değiştiremez.

Session sonu/kota yaklaşınca: işi stabilize et, test et, branch'e (main'e
değil) push et, STATUS.md güncelle, HANDOFF bırak: ISSUE/BRANCH/COMMIT/
DONE/CHANGED FILES/TESTS/CI/OPEN ERRORS/REMAINING WORK/NEXT STEP.
