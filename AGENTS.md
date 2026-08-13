AGENTS — Köseoğlu Growth Ajan Kuralları

Genel kural: Her ajan göreve başlamadan önce MASTER_PLAN.md, TASKS.md ve STATUS.md
dosyalarını okumalıdır.

================================================================
ROLLER VE SORUMLULUKLAR (2026-08-13 GÜNCELLEME — gerçek duruma uyarlandı)
================================================================

Önceki sürümde beş ayrı ajan rolü (Codex/Copilot/Gemini/Qwen) tanımlıydı. Bu,
2026-08-13 itibarıyla bağımsız bir mimari incelemeyle doğrulandı: `git log`
geçmişinde tek yazar, tek branch, sıfır PR, sıfır ikinci reviewer var. Aşağıdaki
tanım, o kurguyu değil, GERÇEKTEN OLANI yansıtır.

- CLAUDE CODE — Yazar (author)
  - Şu ana kadarki tüm kodun, şemanın, testlerin ve dokümanların fiili yazarı.
  - Kendi yazdığı işi kendi kendine "review edildi" veya "onaylandı" olarak
    işaretleyemez.

- CI (GitHub Actions) — Otomatik doğrulayıcı (verifier)
  - install → migrate deploy → lint → typecheck → test → build.
  - Nesnel, tekrarlanabilir doğrulama sağlar ama bir MİMARİ/TASARIM review'ı
    DEĞİLDİR — yalnızca "bozuk mu, çalışıyor mu" sorusuna cevap verir.

- REVIEWER — Yalnızca gerçekten review yapıldığında var olan bir rol
  - Şu an fiilen bu rolü dolduran: KÖKSAL (proje sahibi), PR bazında.
  - Codex / GitHub Copilot / Gemini CLI / Qwen Code: TANIMLI ama şu an AKTİF
    DEĞİL. Biri gerçekten bir PR'a yorum/onay bıraktığında bu dosyada ve
    STATUS.md'de adıyla, tarihiyle, hangi PR'da olduğu belirtilerek kayda
    geçirilir. Aktif olmayan bir ajanın "review yaptığı" varsayılamaz veya
    yazılamaz.
  - (gelecekte gerçekten devreye giren local/free agent'lar) — aynı kurala
    tabidir: iddia değil, kayıt (commit/PR referansı) gerekir.

Tüm coding agent'lar DEĞİŞTİRİLEBİLİR İŞÇİLERDİR. Hiçbiri projenin hafızası
değildir — proje hafızası repository'nin kendisidir.

================================================================
GITHUB = TEK DOĞRULUK KAYNAĞI
================================================================

- GitHub (Issues, branch'ler, commit geçmişi, PR'lar, CI sonuçları) tek doğruluk
  kaynağıdır (single source of truth).
- AI sohbet geçmişi source of truth DEĞİLDİR. Bir sohbette söylenen hiçbir şey,
  repository'de karşılığı yoksa gerçekleşmiş sayılmaz.
- NOT (bilinen açık): Issue #1/#2/#3, bu ortamda gh CLI/API erişimi olmadığı
  için GitHub'da gerçek Issue olarak hâlâ açılmadı — TASKS.md içinde yalnızca
  hedef yapı olarak var. Bu, "GitHub tek doğruluk kaynağı" ilkesinin şu an
  tam uygulanamadığı bilinen bir boşluktur.
- Her ajan işe başlarken şunları okumalıdır: MASTER_PLAN.md, AGENTS.md,
  STATUS.md, aktif GitHub Issue (varsa), aktif branch, son commit'ler, test/CI
  durumu.

================================================================
GELİŞTİRME AKIŞI — BRANCH + PR ZORUNLU (2026-08-13 GÜNCELLEME)
================================================================

2026-08-13'e kadar tüm commit'ler doğrudan main'e atıldı (bağımsız incelemeyle
doğrulanmış bir gerçek, bir hedef değil). Bundan sonra:

  feature/issue-N (veya chore/kısa-ad) branch → PR açılır → CI PASS →
  Köksal (veya gerçekten devrede olan bir reviewer) PR'ı inceler → merge.

- Main'e doğrudan push YOK.
- CI kırmızıyken yeni işe başlanmaz.
- Bir PR, CI PASS olmadan merge edilmez. CI PASS olması da tek başına yeterli
  DEĞİLDİR — mimari/tasarım riski taşıyan değişiklikler (yeni model, yeni
  şema alanı, yeni dış bağımlılık) için PR açıklamasında "bilinen trade-off'lar"
  bölümü zorunludur (bkz. REVIEW-*.md şablonu).

Her görev şu akıştan geçer:

PLAN → IMPLEMENT → LINT → TYPECHECK → TEST → BUILD → VERIFY → COMMIT → PUSH (branch)
→ PR → CI → REVIEW → MERGE → REPORT

- AI'nın "çalışıyor" demesi KANIT DEĞİLDİR. Kanıt: gerçek komut çıktısı, geçen
  test, GERÇEKTEN GitHub'da çalışmış yeşil CI (yalnızca lokal doğrulama
  yeterli değildir — bkz. ERRORS.md, `.github/workflows/ci.yml`'in birden
  fazla kez push edilemediği ve bu yüzden CI'ın güncel değişiklikleri hiç
  test etmediği vakalar).
- Güvenli development işlemlerinde (kod yazma, test çalıştırma,
  lint/typecheck/build, commit, branch push, PR açma, dokümantasyon
  güncelleme) sürekli kullanıcı onayı istenmez.
- Aşağıdaki durumlarda İŞLEM DURDURULUR ve kullanıcıdan açık onay istenir:
  - production data deletion
  - database reset/drop
  - main'e merge (Köksal onayı olmadan)
  - secret sızıntısı veya secret commit riski
  - payment/ödeme işlemleri
  - gerçek müşteri e-postasına gönderim
  - geri alınamaz (irreversible) production işlemleri

================================================================
MIGRATION DEFINITION OF DONE
================================================================

Bir Prisma migration'ı şu dört kontrolden geçmeden "bitti" sayılmaz:

1. **Temiz/disposable DB testi** — CI'ın Postgres servisi bunu her push'ta
   otomatik sağlar (migrate deploy, sıfırdan bir container'a karşı). Ekstra
   manuel adım gerekmez.
2. **Upgrade path testi** — migration'ı, BİR ÖNCEKİ şemayla kurulmuş ve veri
   içeren bir DB üzerinde uygulayıp hatasız tamamlandığını doğrula. Bu şu an
   OTOMATİK DEĞİL — her yeni migration'da elle yapılmalı (lokal Postgres'i
   önceki migration'a kadar kur, veri ekle, yeni migration'ı uygula, veri
   kaybı/hata olmadığını doğrula).
3. **Destructive SQL kontrolü** — migration.sql, DROP/DELETE/TRUNCATE/ALTER
   COLUMN TYPE (veri kaybı riski taşıyan tip daraltmaları) için taranmalı ve
   PR açıklamasında sonuç belirtilmeli.
4. **Destructive migration varsa** — uygulanmadan önce backup planı VEYA
   restore prosedürü PR açıklamasında yazılı olmalı.

Otomatik/zorunlu bir "down migration" dosyası GEREKMEZ — erken aşamada bunun
bakım maliyeti gerçek faydasından yüksek (bkz. DECISIONS.md).

================================================================
KOTA / SESSION SONU KURALI
================================================================

Claude/Codex kotası veya session sona yaklaşıyorsa:
- yeni büyük işe başlanmaz
- mevcut iş stabil hale getirilir, test edilir
- commit/push edilir (branch'e — main'e değil)
- STATUS.md güncellenir (kısa tutulur, bkz. aşağıdaki limit)
- gerekiyorsa ERRORS.md / LEARNINGS.md güncellenir (rotasyon kuralına uyarak)
- bir HANDOFF oluşturulur

HANDOFF FORMATI:

ISSUE / BRANCH / LAST COMMIT / DONE / CHANGED FILES / TESTS / CI / OPEN ERRORS
/ ROOT CAUSE / REMAINING WORK / NEXT FIRST STEP

================================================================
DOKÜMAN BÜYÜME KURALI (2026-08-13 EK)
================================================================

- STATUS.md **60 satırı geçemez**. Aşarsa eski/tarihsel içerik silinir,
  yalnızca "şu an" bilgisi kalır. Geçmiş, git log ve commit mesajlarındadır —
  STATUS.md bir günlük değildir.
- ERRORS.md ve LEARNINGS.md: **15 girişi geçen dosya**, en eski girişleri
  `ERRORS_ARCHIVE.md` / `LEARNINGS_ARCHIVE.md`'ye taşır, ana dosyada güncel
  ve hâlâ geçerli olanlar kalır.
- LEARNINGS.md'ye yalnızca GERÇEKTEN YAŞANMIŞ bir olaydan çıkan, somut dosya/
  satır/hata referansı olan öğrenimler yazılır. MASTER_PLAN.md'deki bir
  ilkeyi farklı cümlelerle tekrar etmek "öğrenim" DEĞİLDİR — bu, 2026-08-13
  bağımsız incelemesinde tespit edilip temizlenmiş bir hataydı.
- ERRORS.md girişlerine, düzeltmenin KALICI mı yoksa OTURUMLUK mu olduğunu
  belirten bir not eklenir (bkz. şablon). Oturumluk düzeltmeler (örn. PATH
  export, Docker Desktop'ı elle başlatma) TASKS.md'de kalıcı bir altyapı
  görevine dönüştürülmeli, sonsuza kadar "oturumluk" kalmamalı.

================================================================
İLETİŞİM
================================================================

- Ajanlar değişiklik yaptığında STATUS.md'e kısa bir özet bırakır (son işlem,
  değiştirilen dosyalar, açık testler, bir sonraki adım) — 60 satır limitine
  uyarak.
- Hata bulunduğunda ERRORS.md güncellenmelidir (rotasyon kuralına uyarak).
- Önemli teknik öğrenimler LEARNINGS.md içine yazılmalıdır (yalnızca gerçek
  olaylar, plan kopyası değil).
- Aynı anda kritik dosyayı değiştirmeyin; paralel iş için ayrı task/branch
  kullanın.
- Hiçbir ajan ana planı (MASTER_PLAN.md) tek başına değiştiremez.

Bu dosya sürekli olarak ajanlar tarafından referans alınacak temel kuralları
içerir.
