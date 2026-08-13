# AI-ENGINEERING-STANDARD — Ekonomik ve Kaliteli Çoklu-Ajan Kod Geliştirme Anayasası

> Proje-bağımsız ortak yöntem. Growth, MYLojistik, Ultra Finans ve diğer yazılım
> projelerine kopyalanabilir. Amaç: **kabul edilen değişiklik başına minimum
> premium/ücretli AI kredisi** (toplam token değil — bkz. Bölüm 0-EK).
>
> BU DOSYA HER OTURUMDA OKUNMAZ. Yalnızca yeni proje kurulumunda, faz/süreç
> değişikliğinde veya bu standart güncellenirken okunur. Günlük çalışma kuralları
> için bkz. `AGENTS.md` (≤60 satır, bu dosyaya pointer verir).
>
> Son mimari araştırma: 2026-08-13. Codex, Claude Code, GitHub Copilot ve Google
> Antigravity'nin resmi dokümantasyonundaki güncel ajan/subagent, worktree,
> review, instruction, permission ve maliyet prensipleri dikkate alınmıştır.
> Ürün özellikleri ve kotalar değişebilir; araç özel ayarlar uygulanmadan önce
> güncel resmi doküman tekrar kontrol edilir. NOT: Bu araştırmanın kaynak
> ayrımı (resmi vs üçüncü parti) her satırda netleştirilmemiştir — bkz.
> 2026-08-13 EK bölümü, madde D için bir örnek düzeltme.
>
> ================================================================
> 2026-08-13 EK — BAĞIMSIZ DENETİMDEN GEÇMİŞ ONAYLANMIŞ DÜZELTMELER
> ================================================================
>
> Bu bölümdeki içerik, taze bağlamlı bir ajan tarafından adversarial
> denetlendi ve Köksal tarafından onaylandı. Aşağıdaki maddeler, bu
> dosyanın geri kalanındaki karşılık gelen bölümleri GÜNCELLEr/DÜZELTİR —
> çelişki varsa BU BÖLÜM esastır.
>
> **A) North Star (Bölüm 1) — teyit edildi, değişmedi:** Hedef "toplam
> token azaltmak" değil, **kabul edilen değişiklik başına premium kredi
> azaltmak**. [ÖNERİ — bu projede henüz ölçülmüş bir "free worker premium
> turu azalttı" vakası yok; tek somut veri, free pool hiç yokken premium
> ajanların ~296K token harcadığı bir gündü.]
>
> **B) Risk B — Escalation Gate'te yapısal açık (düzeltildi):** "Reviewer'lar
> çelişiyor" tetikleyicisi Risk B'de yalnızca 1 reviewer olduğu için hiç
> devreye giremiyordu. EKLENEN KURAL: Risk B denetçisi kendi bulgusundan
> emin değilse VEYA diff schema/security/migration dosyalarına dokunuyorsa,
> tek başına karar vermez — 2. taze denetçi otomatik tetiklenir.
>
> **C) Reviewer routing (ekonomik düzeltme):** Risk B akışı artık: free/local
> taze reviewer VARSA önce o; YOKSA geçici fallback taze Claude subagent'ı;
> free reviewer kritik/çelişkili bulgu üretirse premium/Codex escalation.
> DÜRÜST NOT: Bu yazıldığı an itibarıyla hiçbir free/local reviewer kurulu
> DEĞİL — yani bu politika şimdilik "her zaman taze Claude" olarak işler.
> Taze Claude da PREMIUM kredi tüketir; bu nihai model değil, yalnız
> AŞAMA 1 pilotu boyunca geçici varsayılandır.
>
> **D) Paralellik hedefi düzeltildi:** "Read-heavy paralellik sınırsız"
> yanlış hedefi optimize ediyordu (free token azaltmak). Asıl israf edilen
> kaynak, worker çıktısının Premium Author tarafından OKUNMASI için harcanan
> premium dikkat/token'dır. [ÖNERİ, veriye dayanmıyor] Görev başına 2-4
> bağımsız free/local scout ile başla; fayda ölçülürse artır, gürültü
> artıyorsa azalt.
>
> **E) Aggregator kuralı netleştirildi:**
> KANIT YOK → premium task packet'e girmez (quarantine'de tutulur, silinmez).
> KANIT + DÜŞÜK GÜVEN → silinmez, düşük öncelikle pakete girer.
> KANIT + REPRODUCTION/TEST → yüksek öncelik.
>
> **F) KPI seti (4 ana metrik, onaylandı):** `PREMIUM_REWORK_ROUNDS`,
> `FREE_FINDINGS_ACCEPTED_RATE`, `DEFECTS_FOUND_BEFORE_MERGE`,
> `ESCALATION_RATE`. AŞAMA 1'de her PR açıklamasına elle 4 satır olarak
> tutulur, script gerekmez.
>
> **G) AŞAMA 1 pilotu (onaylandı, başladı):** 3-5 gerçek task, task başına
> 2-4 free/local scout (ELLE çalıştırılır — script/entegrasyon yok),
> Claude Author, CI, free/local taze reviewer (yoksa madde C'deki
> fallback), yalnız gerektiğinde premium escalation. AI-Factory/JSON
> router/LiteLLM bu aşamada KURULMAZ. PRATİK UYARI: Claude Code bu
> ortamdan Ollama/Antigravity'ye otomatik bağlanamıyor — pilot, Köksal'ın
> (veya Claude'un elle kopyala-yapıştır ile) bir free aracı manuel çağırıp
> çıktısını Author'a aktarmasıyla yürür. En az 10 gerçek bilet + en az
> 3-5'inde bu pilot tamamlanmadan AŞAMA 2'ye (script/Ollama entegrasyonu/
> JSON contract) geçilmez.
>
> **H) Dosya konumu (bu değişiklik, Bölüm 8 ile birlikte uygulanmıştır):**
> Bu dosya `AI-WORKFLOW.md`'den `AI-ENGINEERING-STANDARD.md`'ye yeniden
> adlandırıldı — Bölüm 8'deki "seyrek okunan global standart" rolüne
> taşındı. `AGENTS.md` artık ≤60 satır ve bu dosyaya pointer veriyor.
> Ayrı bir GitHub repository'ye taşıma (`koksal-hub/ai-engineering-
> standard`) HENÜZ YAPILMADI — yalnızca 4 proje AŞAMA 2'yi geçip gerçek
> bir tekrar/darboğaz ortaya çıkarsa değerlendirilecek.
>
> **I) SSH ile GitHub push, OAuth App workflow-scope kısıtlamasını
> gerçekten atlıyor [KANITLANDI]** — bu depoda üç ayrı push ile
> doğrulandı, gerçek CI (install→migrate deploy→lint→typecheck→test→
> build) yeşil oldu. Root-cause economics ilkesinin en somut kanıtı: aynı
> hata beş-altı kez workaround'landıktan sonra kalıcı çözüldü.
>
> ================================================================

================================================================
0. TEK CÜMLEYLE ANA KURAL
================================================================

**5 mantıksal rol kullan; 5 pahalı LLM'i aynı anda çalıştırma.**

Normal işte varsayılan akış:

PLANCI → UYGULAYICI → DETERMINISTIK TEST/CI → TAZE DENETÇI → MERGE

Düşük riskte Denetçi bile gerekmeyebilir. Yüksek riskte ikinci bağımsız Denetçi
ve kullanıcı onayı eklenir.

================================================================
1. EKONOMİK NORTH STAR
================================================================

Bu sistem aşağıdaki sırayla optimize edilir:

1. Doğruluk / veri güvenliği / geri alınabilirlik.
2. Çalışan ve test edilmiş kod.
3. AI kredi ve token verimliliği.
4. Geliştirme hızı.
5. Araç bağımsızlığı.

Hız uğruna kaliteyi, kalite görüntüsü uğruna da gereksiz token harcamasını kabul
etme.

Önemli ayrım:

- **ROL** = yapılması gereken fonksiyon.
- **AJAN** = bu fonksiyonu o anda yapan model/session.

Beş rol tanımlanması, beş ücretli ajan açılması anlamına GELMEZ.

================================================================
2. BEŞ MANTIKSAL ROL
================================================================

## ROL 1 — PLANCI / MİMAR

Görev:
- Büyük hedefi küçük, bağımsız, test edilebilir biletlere böler.
- Acceptance criteria yazar.
- Risk sınıfını belirler.
- Hangi dosyaların gerçekten gerekli olduğunu söyler.
- Mimari sınırları ve geri dönüş noktalarını belirler.

Yapmaması gereken:
- Uygulayıcının yapacağı bütün kodu önceden üretip token harcamak.
- Belirsiz, devasa "projeyi bitir" görevleri vermek.
- Her görevde tüm repository'yi yeniden analiz etmek.

Varsayılan araç:
- Güçlü planlama/reasoning modeli.
- Kullanıcı zaten bir güçlü modele abonelik ödüyorsa önce onu kullan.

## ROL 2 — KEŞİFÇİ / CONTEXT SCOUT

Görev:
- İlgili dosyaları bulur.
- Kod akışını çıkarır.
- Testleri, logları, bağımlılıkları tarar.
- Ana ajana SADECE damıtılmış sonuç döndürür.

Yetki:
- Tercihen READ-ONLY.
- Kod değiştirme yetkisi varsayılan olarak YOK.

Neden ekonomik:
- Ana pahalı ajanın context'ini binlerce satır grep/log/dosya ile kirletmez.
- Read-heavy iş, daha ucuz/free/local modelde yapılabilir.

## ROL 3 — UYGULAYICI / AUTHOR

Görev:
- Tek bir aktif bilet üzerinde kod yazar.
- Gereksiz refactor yapmaz.
- İlgili testleri ekler/günceller.
- Lokal deterministik kalite kapısını çalıştırır.
- Branch'e commit/push eder ve PR hazırlar.

Kural:
- Kendi yazdığı işi "bağımsız review edildi" diye işaretleyemez.

## ROL 4 — DENETÇİ / REVIEWER / QA

Görev:
- Yazarın uzun konuşma geçmişini görmeden mümkün olduğunca taze context ile çalışır.
- "Yazar doğru söylüyor" varsayımı yapmaz.
- İddiaları kod, diff, test ve gerçek komut çıktısına karşı doğrular.
- Bug, güvenlik açığı, yanlış varsayım, veri kaybı, edge-case ve test boşluğu arar.

Varsayılan yetki:
- READ-ONLY.
- Kod düzeltmez; bulgu yazar.
- Düzeltme gerekiyorsa tekrar Uygulayıcıya döner.

Taze context neden önemli:
- Self-review körlüğünü azaltır.
- Ana session'daki eski varsayımları otomatik devralmaz.
- Review çıktısı, yazarın savunmasını değil diff'in gerçeğini merkez alır.

## ROL 5 — RELEASE / VERIFIER

Görev:
- Lint, typecheck, unit/integration test, build, migration validation ve CI.
- PR'ın gerçekten green olduğunu doğrular.
- Gerekirse yalnızca hata logunu ilgili ajana verir.

Varsayılan uygulama:
- Script + GitHub Actions + test araçları.
- LLM kullanımı varsayılan olarak YOK.

Bu rol, en ucuz "ajan"dır: deterministik doğrulama AI kredisi tüketmez.

================================================================
3. ALTIN KURAL: AI'NIN YAPMAMASI GEREKEN İŞİ AI'YA VERME
================================================================

Aşağıdakileri önce kod/script/CI yapsın:

- format
- lint
- typecheck
- unit/integration test
- build
- migration validate/deploy testi
- secret/dependency kontrolleri
- dosya var mı / branch ne / git status ne
- deterministik regex/normalizasyon/constraint testleri

AI ancak şunlarda devreye girsin:

- niyet/iş kuralı yorumu
- mimari trade-off
- karmaşık hata kök nedeni
- edge-case keşfi
- güvenlik mantığı
- kod review
- belirsiz tasarım kararı

Bir linter'ın bedavaya bulacağı hatayı güçlü modele sordurmak kredi israfıdır.

================================================================
4. RİSK ROUTER — KAÇ AJAN GEREKTİĞİNE BÖYLE KARAR VER
================================================================

## A — DÜŞÜK RİSK

Örnek:
- typo
- README
- basit UI metni
- format
- küçük config
- açıkça testle kapsanan küçük refactor

Akış:
UYGULAYICI → CI

Ekstra reviewer: 0.

## B — ORTA RİSK

Örnek:
- normal feature
- API business logic
- veri validation
- orta refactor
- yeni test mantığı
- CI'dan geçse bile mantıksal hata ihtimali olan kod

Akış:
PLANCI → UYGULAYICI → CI → 1 TAZE DENETÇI → MERGE

Ekstra reviewer: 1.

## C — YÜKSEK RİSK

Örnek:
- DB schema / migration
- auth / authorization
- secret yönetimi
- ödeme
- production data write/delete
- gerçek müşteri iletişimi
- güvenlik
- kritik finans mantığı
- cross-system mimari
- geri dönüşü pahalı temel karar

Akış:
PLANCI → UYGULAYICI → CI → GÜÇLÜ DENETÇI → gerekirse 2. BAĞIMSIZ DENETÇI
→ KULLANICI ONAYI → MERGE

Ekstra reviewer: 1 veya 2; **her zaman 3 değil**.

Kural:
Ajan sayısını görevin büyüklüğüne değil, yanlış kararın MALİYETİNE göre artır.

================================================================
5. KÖKSAL İÇİN VARSAYILAN ARAÇ DAĞILIMI
================================================================

Bu dağılım araçlara kilit değildir; fiyat/kota/kalite değişirse rol başka araca
aktarılabilir.

### PLANCI / MİMAR
- ChatGPT: plan, acceptance criteria, mimari karşılaştırma, son karar desteği.
- Amaç: pahalı kod ajanına belirsiz görev bırakmamak.

### ANA UYGULAYICI
- Claude Code: orta/büyük kodlama görevlerinde ana Author.
- Çoğu kodlama işinde dengeli model; en pahalı/derin modeli yalnız gerçekten
  zor mimari veya çok aşamalı sorunlarda kullan.
- Subagent açmak otomatik olarak ucuzluk sağlamaz; her subagent ayrı model işi
  yaptığı için kota/token tüketir.

### UCUZ/FREE KEŞİFÇİ VE RUTİN DENETÇİ
- Google Antigravity Individual: güncel bireysel plan uygun olduğu sürece temel
  haftalık kota ile read-heavy keşif, test-gap arama ve rutin fresh review için.
- Otomatik ücretli overage/fallback KAPALI tutulur; kota biterse beklenir veya
  başka mevcut araca geçilir.
- Yerel Ollama: log özetleme, grep sonuçlarını sıkıştırma, basit boilerplate,
  düşük riskli sınıflandırma. Kritik mimari için tek nihai hakem yapılmaz.

### KRİTİK DENETÇİ
- Codex: DB/migration, güvenlik, karmaşık mimari, çok zor bug veya yüksek riskli
  PR review için saklanır.
- Mümkün olduğunda dedicated review/read-only akışı kullanılır.
- Rutin dosya taramasında Codex kotası yakılmaz.

### DETERMINISTIK HAKEM
- GitHub Actions / testler / scriptler.
- Her zaman model review'dan önce.

Not:
- GitHub Copilot mevcutsa read-only explore/code-review/task yardımcıları rutin
  ikinci göz olarak kullanılabilir; ancak zorunlu bağımlılık değildir.
- Araç satın alma kararı "ajan sayısını artırmak" için değil, ölçülen darboğazı
  çözmek için verilir.

================================================================
6. GÜNCEL CODE-AGENT MİMARİLERİNDEN ALINAN ORTAK DERSLER
================================================================

2026-08-13 resmi ürün dokümantasyonu karşılaştırmasının vendor-neutral sonucu:

### Codex'ten alınan dersler
- `AGENTS.md` kalıcı ve katmanlı proje talimatı için doğru ortak yüzeydir.
- Subagent'lar ayrı context/thread ile read-heavy işleri ana context'ten ayırır.
- Çoklu ajan tek ajana göre daha fazla token tüketir.
- Paralellik önce exploration/test/triage/summarization gibi READ-HEAVY işlerde
  kullanılmalıdır; eşzamanlı write-heavy ajanlarda conflict/koordinasyon artar.
- Dedicated review, diff'i inceleyip çalışma ağacını değiştirmeden bulgu
  üretebilir.
- Git worktree, paralel yazma gerektiğinde izolasyon sağlar.
- Permission/sandbox sınırı kaldırılmamalı; full-access/yolo varsayılan değildir.

### Claude Code'dan alınan dersler
- Subagent = ayrı context, tek odaklı iş, özetle geri dönüş.
- Agent team = iletişim kuran bağımsız session'lar; daha fazla token ve
  koordinasyon maliyeti. Yalnız gerçek paralel değer varsa kullan.
- Paralel edit için worktree kullan; agent team kendi başına dosya izolasyonu
  sağlamaz.
- `CLAUDE.md` her session'a yüklenir; kısa ve net tutulmalıdır. Büyük/özel
  prosedürleri path-rule veya skill'e taşı.
- Command hook deterministik kontrol için LLM hook'tan daha ucuz ve güvenilirdir.
- Subagent model/permission/max-turns sınırları ile maliyet ve yetki kısıtlanabilir.

### GitHub Copilot'tan alınan dersler
- `AGENTS.md`, farklı AI araçları arasında paylaşılan standing rules için uygun.
- Explore/code-review gibi read-only ajanlar yazan ajandan ayrı tutulabilir.
- Subagent'lar ayrı context ile ana session'ı kirletmeden çalışabilir.
- Tool/agent profilleri mümkün olduğunca minimum yetkiyle tanımlanmalıdır.

### Google Antigravity'den alınan dersler
- Güncel bireysel katman ücretsiz bir başlangıç kotası sunar; kota ve model
  erişimi zamanla değişebilir.
- Kullanım `/usage`/quota ekranından izlenebilir.
- Ücretli kredi overage otomatik açılmamalı; maliyet kontrolü için "Never"/
  kapalı yaklaşımı kullan.
- Gemini CLI bireysel yolunun yerini Antigravity CLI aldığı için yeni ortak
  workflow eski Gemini CLI varsayımına bağlanmaz.

================================================================
7. CONTEXT MİMARİSİ — KREDİYİ EN ÇOK BURADA KURTAR
================================================================

En büyük gizli maliyetlerden biri aynı repo bilgisinin her ajana tekrar tekrar
okutulmasıdır.

### HER AJANA VERİLECEK MİNİMUM CONTEXT PACKET

Varsayılan olarak yalnız:

1. `AGENTS.md`
2. Aktif GitHub Issue / acceptance criteria
3. İlgili dosya veya PR diff'i
4. Güncel CI/test sonucu
5. Gerekliyse SADECE ilgili DECISION/architecture bölümü

Şunları otomatik okutma:
- bütün chat geçmişi
- bütün ERRORS arşivi
- bütün LEARNINGS arşivi
- bütün repository
- tüm MASTER_PLAN (rutin bugfix'te)
- başka ajanların ham düşünce/transcript çıktıları

### MASTER_PLAN NE ZAMAN OKUNUR?

- yeni faz
- mimari karar
- scope değişikliği
- proje yönü değişikliği

Rutin test fix'inde her seferinde baştan yükleme.

### STATUS NE İÇİN?

Yalnız handoff/resume için kısa anlık durum.
Günlük tarihi arşiv değildir.

### TAZE REVIEWER CONTEXT'I

Reviewer'a şunları ver:
- acceptance criteria
- PR diff
- ilgili testler/CI
- kritik mimari sınırlar

Şunları verme:
- Author'ın uzun savunması
- Author'ın bütün sohbet geçmişi
- "her şey doğru, onayla" yönlendirmesi

Reviewer bulguyu önce bağımsız çıkarsın; sonra Author açıklamasıyla karşılaştır.

================================================================
8. ORTAK TALİMAT DOSYALARI — TEK KAYNAK, İNCE ADAPTÖRLER
================================================================

Amaç aynı kuralı 4 farklı ajan dosyasında kopyalamamak.

### `AGENTS.md`
- Vendor-neutral ortak çalışma kuralları.
- Git/branch/PR/CI/approval/security sınırları.
- Kısa tutulur.
- Codex ve Copilot gibi destekleyen araçlar doğrudan okuyabilir.

### `CLAUDE.md`
- Claude Code için İNCE adaptör.
- Aynı kuralları tekrar yazmaz.
- Proje başlangıç komutları + "AGENTS.md ve aktif Issue'yu oku" gibi minimal
  yönlendirme içerir.
- Tercihen 200 satırın çok altında kalır.

### Araç-özel agent/skill dosyaları
- Sadece o aracın başka yerde ifade edilemeyen ayarı varsa.
- Universal politika tekrar edilmez.

### `AI-ENGINEERING-STANDARD.md` (bu dosya)
- Her session'da otomatik yüklenmek zorunda DEĞİLDİR.
- Orkestrasyon/ekonomi politikasıdır.
- Plancı, yeni proje kurulumu, faz geçişi veya süreç tartışmasında okur.

Kural:
**Bir talimatı bir kez yaz.** Aynı cümleyi AGENTS + CLAUDE + STATUS + prompt
+dört yerde tekrar etme.

================================================================
9. PARALELLİK KURALI
================================================================

Paralellik varsayılan değil, optimizasyondur.

### PARALEL YAPILABİLİR
- codebase exploration
- log triage
- test-gap analizi
- security review
- farklı hipotezlerle bug analizi
- birbirinden bağımsız modüller

### PARALEL YAPILMAZ
- aynı dosyayı değiştiren iki ajan
- birbirinin sonucuna bağımlı ardışık görevler
- schema + consumer kodu aynı anda birbirinden habersiz değiştirmek
- aynı branch'e iki writer

### PARALEL WRITE GEREKİRSE

Her writer için:
- ayrı branch
- tercihen Git worktree
- net dosya sahipliği
- ayrı PR veya kontrollü merge sırası

Örnek:

- `feature/issue-12-api`
- `feature/issue-12-ui`
- `test/issue-12-adversarial`

Reviewer branch'e yazmaz; PR diff'ini okur.

================================================================
10. ÜÇ STANDART ÇALIŞMA MODU
================================================================

## MOD 1 — EKONOMİ MODU (varsayılan)

Kullan:
- günlük küçük/orta işler

Akış:
Plan → tek Author → local verify → CI → gerekirse 1 ucuz fresh reviewer → merge

## MOD 2 — KALİTE MODU

Kullan:
- normal feature
- business logic
- orta refactor

Akış:
Plan → Author → CI → fresh reviewer → Author fix → CI → merge

## MOD 3 — KRİTİK MOD

Kullan:
- schema/migration
- auth/security
- ödeme/finans
- production writes
- irreversible karar

Akış:
Plan → Author → CI → güçlü reviewer → gerekirse bağımsız ikinci reviewer
→ fix → CI → kullanıcı onayı → merge

Kritik Mod pahalıdır; sadece gerekçeyle kullan.

================================================================
11. MODEL / EFFORT ROUTING
================================================================

En güçlü model her işte kullanılmaz.

### UCUZ / HIZLI MODEL
- grep sonucu özetleme
- dosya keşfi
- boilerplate
- basit test üretimi
- log sınıflandırma
- doküman biçimlendirme

### ORTA / DENGELİ MODEL
- çoğu feature kodu
- normal bugfix
- API business logic
- refactor

### GÜÇLÜ / DERİN MODEL
- mimari
- güvenlik
- veri modeli
- migration
- zor concurrency
- kritik reviewer
- birkaç denemede çözülemeyen hata

Kural:
Modeli görevin PRESTİJİNE değil, gereken muhakeme derinliğine göre seç.

================================================================
12. KREDİ / TOKEN KONTROLÜ
================================================================

### Kural 1 — Multi-agent = ekstra maliyet

Her subagent kendi model/tool işini yaptığı için token/kota tüketir.
"Daha hızlı" her zaman "daha ucuz" değildir.

### Kural 2 — Lean prompt

Prompt yalnız şunları içersin:
- hedef
- gerekli context
- hard constraints
- approval sınırı
- acceptance criteria
- beklenen çıktı

Aynı kuralı üç kez tekrarlama.
İlgisiz tool ve doküman yükleme.

### Kural 3 — Tur sınırı

Destekleyen araçlarda:
- subagent max-turns
- timeout
- concurrency limiti
- permission limiti

kullan.

Ajan 20 tur aynı yerde dönüyorsa "daha çok düşün" değil, DUR → kök neden /
insan veya güçlü reviewer escalation.

### Kural 4 — Tekrar maliyeti

Aynı workaround ikinci kez tekrarlanıyorsa üçüncü kez workaround yapma.
Kalıcı root-cause bileti aç.

### Kural 5 — Usage görünürlüğü

Her PR/Issue için minimum kayıt:
- rol
- kullanılan araç/model (biliniyorsa)
- sonuç
- rework oldu mu
- kota/usage bilgisi araç gösteriyorsa yaklaşık değer

Mükemmel token muhasebesi için yeni sistem kurma. Önce en pahalı tekrarları gör.

================================================================
13. DETERMİNİSTİK HOOK / CI KATMANI
================================================================

Hooks ancak tekrar eden gerçek bir ihtiyaç varsa eklenir.

Tercih sırası:
1. normal script
2. package script / pre-commit
3. CI
4. command hook
5. prompt/agent hook (yalnız script karar veremiyorsa)

Neden:
- Command/script deterministiktir.
- LLM hook ek model çağrısı ve ekstra kredi demektir.

Her edit sonrası bütün suite'i çalıştırmak şart değildir; ama PR öncesi tam kalite
kapısı ve CI zorunludur.

================================================================
14. SECURITY / CREDENTIAL KURALI
================================================================

ASLA:
- PAT/API key'i chate yapıştırma
- token'ı git remote URL içine gömme
- secret'ı repo dosyasına commit etme
- sırf ajan rahatsız olmasın diye full-access/yolo açma
- reviewer'a gereksiz write yetkisi verme

TERCİH:
- OS/Git Credential Manager
- SSH veya güvenli credential helper
- secret store / GitHub Secrets
- least privilege
- read-only reviewer
- workspace sınırı

Açık kullanıcı onayı gerektirenler:
- production data delete/reset/drop
- gerçek customer send
- payment
- secret rotation/exposure
- irreversible production action
- kritik main merge (proje politikası öyle belirlenmişse)

================================================================
15. HANDOFF CONTRACT — AJANDAN AJANA HAM CHAT TAŞIMA
================================================================

Raw transcript taşıma. Aşağıdaki kısa paket yeterli:

ISSUE:
GOAL:
BRANCH / PR:
LAST COMMIT:
CHANGED FILES:
ACCEPTANCE CRITERIA:
TEST / CI:
KNOWN RISKS:
OPEN BLOCKER:
EXACT NEXT STEP:

Reviewer için ayrıca:
AUTHOR CLAIMS (opsiyonel, review bittikten sonra gösterilebilir):

Handoff GitHub Issue/PR comment veya kısa STATUS üzerinden yapılır.
Sohbet geçmişi source of truth değildir.

================================================================
16. DEFINITION OF DONE — KOD DEĞİŞİKLİĞİ
================================================================

Bir görev DONE değildir, ta ki:

- Scope acceptance criteria ile uyumlu.
- İlgisiz refactor yok.
- İlgili testler var ve geçiyor.
- Lint/typecheck/build geçiyor.
- Migration varsa migration DoD geçiyor.
- Secret sızıntısı yok.
- Branch/PR kullanıldı (proje kuralı öyleyse).
- CI gerçek GitHub run'ında PASS.
- Risk sınıfının istediği bağımsız review tamamlandı.
- Açık kritik blocker yok.
- Main'e merge politikası sağlandı.

"Ajan çalışıyor dedi" = DONE değildir.

================================================================
17. MIGRATION / DB İÇİN EK KRİTİK MOD
================================================================

Migration varsa minimum:
- disposable temiz DB'ye deploy
- mümkünse mevcut/verili DB üstünde upgrade path testi
- destructive SQL taraması
- veri kaybı riski varsa backup/restore planı
- schema değişikliği için güçlü independent review

Her migration için yapay down-migration üretmek zorunlu değildir; gerçek rollback /
forward-fix stratejisi risk bazında belirlenir.

================================================================
18. ANTI-PATTERN — YAPMA
================================================================

- 5 pahalı ajanı her görevde paralel açmak.
- 5 ajana repository'nin tamamını ayrı ayrı okutmak.
- Aynı branch/dosyaya iki writer salmak.
- Author'ın kendi kodunu "independent approved" sayması.
- AI'ya lint/typecheck yaptırmak yerine linter çıktısını çalıştırmamak.
- Reviewer'a Author'ın bütün konuşmasını verip aynı varsayımları bulaştırmak.
- Ham log/transcript'i ajanlar arasında taşımak.
- Her yeni fikir için yeni markdown dosyası üretmek.
- Bir sorunu 3., 4., 5. kez workaround ile geçmek.
- En güçlü modeli typo/grep için kullanmak.
- En ucuz modeli kritik schema/security hakemi yapmak.
- Token/API key'i prompt, repo veya remote URL'ye koymak.
- Ücretsiz ajan kotası bitince otomatik ücretli credit fallback bırakmak.
- Kullanılmayan MCP/tool/plugin'leri her session context'ine yüklemek.

================================================================
19. 4 PROJEYE KOPYALAMA ŞABLONU
================================================================

Her yeni proje başında yalnız şunları yap:

1. Bu `AI-ENGINEERING-STANDARD.md` dosyasını kopyala.
2. Kısa proje `AGENTS.md` oluştur.
3. Projeye özel `MASTER_PLAN.md` oluştur.
4. Gerekirse ince `CLAUDE.md` adaptörü oluştur.
5. GitHub Issue + branch + PR + CI temelini kur.
6. Tek bir `verify`/kalite komutu mümkünse standardize et.
7. Risk C işlerde hangi güçlü reviewer'ın kullanılacağını belirle.
8. Free/ucuz reviewer'ın otomatik ücretli fallback'ini kapat.
9. İlk gerçek feature'da sistemi test et; teorik 10 ajan oluşturma.
10. Ölçülen darboğaza göre araç ekle.

Projeler birbirinin kodunu paylaşmak zorunda değildir; ortak olan yalnız geliştirme
metodudur.

================================================================
20. İLERİ SEVİYE — ŞİMDİ KURMA, İHTİYAÇ DOĞARSA
================================================================

Aşağıdakiler gerçek tekrar/maliyet oluşmadan kurulmaz:

- merkezi LLM gateway
- LiteLLM/model router
- otomatik model seçici
- tam token/cost dashboard
- 5+ sürekli çalışan agent team
- sürekli LLM tabanlı CI review
- karmaşık agent orchestration framework

Bu katmanlar ancak şu şartla eklenir:
"Manuel/yalın yöntemle ölçülen problem, yeni altyapının maliyetinden daha büyük."

================================================================
21. TEK SAYFALIK OPERASYON KONTROL LİSTESİ
================================================================

☐ İşin risk sınıfı A/B/C belirlendi mi?
☐ Acceptance criteria net mi?
☐ Uygulayıcıya yalnız gerekli context verildi mi?
☐ Read-heavy keşif pahalı Author yerine Scout'a verilebilir mi?
☐ AI'dan önce deterministik test/CI çalıştı mı?
☐ Reviewer gerekiyorsa taze ve mümkün olduğunca read-only mı?
☐ Paralel writer varsa ayrı branch/worktree ve dosya sahipliği var mı?
☐ Aynı hata ikinci kez tekrarlanıyorsa root-cause çözümüne geçildi mi?
☐ Güçlü model yalnız yüksek değerli muhakemede mi kullanılıyor?
☐ Ücretli fallback istemeden açılmayacak şekilde kapalı mı?
☐ Secret/token güvenli credential store'da mı?
☐ Gerçek CI PASS var mı?
☐ Risk sınıfının istediği review tamam mı?
☐ Merge öncesi kritik blocker sıfır mı?

================================================================
22. KISA KARAR AĞACI
================================================================

"Bunu script/test çözebilir mi?"
→ EVET: AI kullanma.
→ HAYIR:

"İş read-heavy mi?"
→ EVET: ucuz/free Scout veya subagent.
→ HAYIR:

"Kod yazılacak mı?"
→ EVET: tek Author.
→ HAYIR: Planner/Reviewer.

"CI'dan geçse bile ciddi yanlış olabilir mi?"
→ HAYIR: ekstra reviewer yok.
→ EVET: 1 taze reviewer.

"Yanlış karar veri/güvenlik/para/geri dönüş açısından pahalı mı?"
→ EVET: güçlü reviewer + gerekirse ikinci bağımsız reviewer + kullanıcı onayı.

Bu sistemin amacı çok ajan kullanmak değil; **doğru anda doğru ajanı kullanmaktır.**
