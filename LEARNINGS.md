LEARNINGS — Teknik öğrenimler

Her önemli öğrenme kısa not olarak eklenmelidir:
- tarih: ISO
- konu: kısa başlık
- açıklama: ne öğrenildi, neden önemli
- etkisi: gelecekte ne değişmeli

Bu dosya günlük sohbet özeti DEĞİLDİR. Sadece yeniden kullanılabilecek kalıcı
teknik bilgi yazılır.

================================================================

- tarih: 2026-08-13T15:00:00+03:00
- konu: monorepo-typecheck
- açıklama: root tsc çağrısı tüm paketleri root config ile kontrol edip JSX
  hatalarına sebep oldu; paket seviyesinde tsc -p kullanmak daha güvenli.
- etkisi: root typecheck script paketleri ayrı ayrı çağıracak şekilde düzenlendi.

- tarih: 2026-08-13T20:00:00+03:00
- konu: LLM Last
- açıklama: LLM her akışın son çaresi olmalı; önce deterministik kod (parsing,
  kural motoru, DB sorgusu) denenir. AI'ı önce çağırmak maliyeti artırır, sonucu
  tekrarlanamaz kılar ve hata ayıklamayı zorlaştırır.
- etkisi: Yeni her özellik önce "bunu deterministik kodla çözebilir miyim?"
  sorusuyla tasarlanır.

- tarih: 2026-08-13T20:00:00+03:00
- konu: evidence-backed research
- açıklama: Araştırma/discovery çıktıları kanıt (kaynak URL, zaman damgası, ham
  içerik) olmadan güvenilir sayılmaz. Kanıtsız iddia, aksiyon katmanına geçemez.
- etkisi: Evidence Store, Discovery/Verification pipeline'ının zorunlu parçası.

- tarih: 2026-08-13T20:00:00+03:00
- konu: confidence gating
- açıklama: Düşük güvenilirlikli (confidence) veri otomatik aksiyona (outreach,
  CRM yazma) dönüşmemeli; ya insan onayına düşmeli ya da tamamen reddedilmeli.
- etkisi: Confidence Gate, Verification Pipeline ile Outreach arasında zorunlu
  bir kapı olarak tasarlandı.

- tarih: 2026-08-13T20:00:00+03:00
- konu: trusted memory only
- açıklama: Sistem hafızası (uzun vadeli AI belleği) yalnızca doğrulanmış, kalıcı
  ve tekrar kullanılabilir bilgi içermeli; ham sohbet çıktısı veya doğrulanmamış
  web verisi hafızaya doğrudan yazılmamalı.
- etkisi: Memory Quality Gate, Continuous Learning (Faz 10) öncesi zorunlu adım.

- tarih: 2026-08-13T20:00:00+03:00
- konu: web content is untrusted / prompt-injection protection
- açıklama: Dış web sayfaları, e-postalar veya dokümanlar arasına gizlenmiş
  talimatlar ("ignore previous instructions" tarzı) agent'ı ele geçirmeye
  çalışabilir. Web'den gelen içerik asla komut olarak yorumlanmamalı, yalnızca
  veri olarak işlenmeli.
- etkisi: Web Security Gateway, tüm dış içerik alım noktalarında zorunlu.

- tarih: 2026-08-13T20:00:00+03:00
- konu: research/action privilege separation
- açıklama: Veri toplayan bileşenler ile geri dönüşü olan aksiyon alan
  bileşenler farklı yetki sınırlarında çalışmalı. Bir prompt-injection veya
  hatalı çıkarım, doğrudan gerçek bir e-posta göndermeye veya veri silmeye
  dönüşmemeli.
- etkisi: Discovery/Verification worker'ları ile Outreach/Action worker'ları
  arasında açık bir onay/handoff sınırı var (Human Approval Gate, Faz 4).

- tarih: 2026-08-13T20:00:00+03:00
- konu: entity resolution before AI
- açıklama: Şirket/kişi eşleştirme ve mükerrer kayıt önleme önce deterministik
  kurallarla (domain, vergi no, telefon normalize, fuzzy-match eşiği) yapılmalı;
  AI yalnızca belirsiz sınır durumlarında ikinci görüş olarak kullanılmalı.
- etkisi: Entity Resolution, Faz 1 Data Foundation'ın parçası, discovery/ranking
  öncesinde zorunlu.

- tarih: 2026-08-13T20:00:00+03:00
- konu: event-driven sales history
- açıklama: Satış/etkileşim geçmişi mutasyona uğrayan durum (state) yerine
  değişmez olay (event) akışı olarak saklanmalı; bu, ranking, attribution ve
  process mining için yeniden hesaplanabilir bir temel sağlar.
- etkisi: Event Store, Faz 1'de temel şemasıyla kuruluyor; Company Event
  Intelligence (Faz 9) bunun üzerine inşa edilecek.

- tarih: 2026-08-13T20:00:00+03:00
- konu: idempotency
- açıklama: Queue/worker sistemi retry yaptığında aynı işin iki kez uygulanması
  (örn. aynı e-postanın iki kez gönderilmesi) önlenmeli; her iş idempotency
  key ile işaretlenmeli.
- etkisi: Faz 6 (Queue/Worker/Scheduler) tasarımının zorunlu gereksinimi.

- tarih: 2026-08-13T20:00:00+03:00
- konu: CI as judge
- açıklama: Bir görevin "bitti" sayılması için sübjektif değerlendirme değil,
  CI'ın (lint/typecheck/test/build PASS) nesnel sonucu esas alınır.
- etkisi: AGENTS.md görev akışına COMMIT → PUSH → CI → REPORT adımları zorunlu
  eklendi; "çalışıyor" demek kanıt sayılmaz.

- tarih: 2026-08-13T20:00:00+03:00
- konu: model-independent architecture
- açıklama: Tek bir LLM sağlayıcısına sabitlenmek, fiyat/performans/erişim
  riskini tek noktaya yığar. Model çağrıları soyutlama katmanından geçmeli.
- etkisi: AI entegrasyonları başından itibaren sağlayıcıdan bağımsız arayüz
  arkasında tasarlanacak (henüz çoklu sağlayıcı bağlanmadı, yalnızca mimari
  ilke).

- tarih: 2026-08-13T20:00:00+03:00
- konu: cost observability
- açıklama: AI çağrı maliyeti (token, istek sayısı, model) görünür olmazsa
  Cost Router gibi optimizasyonlar kör tasarlanır.
- etkisi: AI cost observability, genel observability (Faz 7) ile birlikte
  planlanıyor, ayrı bir sonradan-ekleme değil.

- tarih: 2026-08-13T20:00:00+03:00
- konu: real data before advanced ML
- açıklama: Sales forecasting, uplift modelling gibi ileri istatistiksel
  yöntemler yeterli gerçek, temiz, event-driven veri birikmeden anlamlı sonuç
  üretmez.
- etkisi: Bu özellikler bilinçli olarak Faz 10'a (future) ertelendi; erken
  fazlarda uygulanmayacak.

- tarih: 2026-08-13T20:00:00+03:00
- konu: explainable ranking before black-box scoring
- açıklama: Lead ranking, satış ekibinin "neden bu lead yüksek puan aldı"
  sorusuna cevap verebilmeli; açıklanamayan bir skor güven kaybettirir.
- etkisi: Explainable Lead Ranking (Faz 3), kara kutu ML skorlamadan önce
  gelir; ileri ML modelleri ancak açıklanabilirlik korunarak eklenir.

- tarih: 2026-08-13T20:15:00+03:00
- konu: OneDrive içinde git repo
- açıklama: Proje klasörü OneDrive senkronizasyonu altında (`OneDrive\Masaüstü\`);
  bu oturumda dizin listelemede geçici tutarsızlıklar gözlendi (muhtemelen
  Files On-Demand/senkron gecikmesi). Ayrıca büyük node_modules ağaçları
  OneDrive'a senkronize olmaya çalışabilir ve yavaşlığa/kilitlenmeye yol açabilir.
- etkisi: node_modules zaten .gitignore'da; ayrıca OneDrive'ın bu klasörü
  "Always keep on this device" yapması veya proje klasörünün OneDrive
  senkronizasyonu dışına (örn. C:\dev\...) taşınması önerilir — bu kullanıcı
  kararı gerektirir, otomatik yapılmadı.

- tarih: 2026-08-13T20:28:00+03:00
- konu: pnpm workspace filter söz dizimi
- açıklama: pnpm `--filter` içinde düz `apps/*` bir PAKET ADI deseni olarak
  yorumlanır, klasör yolu olarak değil. Klasör yoluna göre filtrelemek için
  `--filter "./apps/*"` (başında `./` ile) yazılmalı. Yanlış kullanım, `-w`
  bayrağıyla birleştiğinde workspace kök script'inin kendini yeniden
  tetiklemesine (özyinelemeli hataya) yol açabilir.
- etkisi: Tüm çoklu-paket pnpm script'lerinde (`build`, gelecekteki
  `dev:all` vb.) yol tabanlı filtrelerde her zaman `./` öneki kullanılacak.

- tarih: 2026-08-13T20:58:00+03:00
- konu: "yerelde geçti" CI'da geçti anlamına gelmez
- açıklama: Kök dizine `vitest.config.ts` eklendikten sonra yalnızca `pnpm
  test` yeniden çalıştırıldı, `pnpm lint` tekrar çalıştırılmadı. ESLint'in
  tip-farkında linting'i (`parserOptions.project` → tsconfig.base.json)
  yeni dosyanın hiçbir tsconfig `include`'unda olmadığını GitHub Actions'ta
  ilk gerçek CI çalışmasında yakaladı — yerel doğrulama bunu kaçırmıştı.
- etkisi: Bir dosya eklendiğinde/değiştiğinde SADECE ilgili görüneni değil,
  dört komutun (lint/typecheck/test/build) TAMAMI yeniden çalıştırılmalı;
  "çalışıyor" demek her komutu tekrar tekrar doğrulamadan kanıt sayılmaz
  (bkz. AGENTS.md → CI as judge kuralı).

- tarih: 2026-08-13T20:26:00+03:00
- konu: vitest watch-mode varsayılanı
- açıklama: Vitest, `CI` ortam değişkeni set değilse varsayılan olarak watch
  modunda çalışır ve asla bitmez. GitHub Actions gibi CI ortamlarında `CI=true`
  otomatik set edildiği için sorun görünmeyebilir, ama yerel/otomasyon dışı
  ortamlarda script sonsuza kadar asılı kalır.
- etkisi: `test` script'i her zaman açıkça `vitest run` olmalı; interaktif
  izleme için ayrı bir `test:watch` script'i tanımlanmalı.

- tarih: 2026-08-13T21:05:00+03:00
- konu: Prisma 7 — driver adapter zorunluluğu
- açıklama: Prisma 7, önceki sürümlerden farklı olarak `schema.prisma`
  içindeki `datasource.url`'ü kaldırdı. Migrate/CLI artık `prisma.config.ts`
  dosyasından URL okuyor; `PrismaClient` çalışma zamanında bir driver adapter
  (Postgres için `@prisma/adapter-pg` + `pg`) ile kurulmak zorunda. Bu,
  major sürüm yükseltmelerinde "sadece package.json'daki sürüm numarasına
  bakmak yetmez" prensibinin somut bir örneği.
- etkisi: Yeni bir Prisma projesi kurulurken (veya major sürüm
  güncellemesinde) `prisma generate`/`validate` gerçekten çalıştırılıp
  hata mesajları okunmalı; dokümantasyona veya eski örneklere güvenmemeli.

- tarih: 2026-08-13T21:05:00+03:00
- konu: pnpm monorepo'da CLI araçları için phantom dependency riski
- açıklama: `@prisma/client`, yalnızca `apps/api/package.json`'da
  tanımlıyken, proje KÖKÜNDEN çalıştırılan `prisma generate` onu
  çözemedi ("Could not resolve @prisma/client") — çünkü pnpm'in izole
  node_modules yapısı, bir paketin bağımlılığını başka bir workspace
  paketinin (veya kökün) görmesine izin vermez. Bu, npm/yarn'ın "hoisted"
  (düz, tek node_modules) davranışına alışkın geliştiriciler için şaşırtıcı
  olabilir.
- etkisi: Bir CLI aracı (prisma, vb.) belirli bir workspace dizininden
  çalıştırılacaksa, o dizinin kendi package.json'ının ilgili paketi
  (doğrudan veya devDependency olarak) içerdiğinden emin olunmalı — "npm
  install ile bir yerlerde zaten var" varsayımı pnpm'de geçerli değil.

- tarih: 2026-08-13T21:20:00+03:00
- konu: CI'da entegrasyon testleri için gerçek DB servisi gerekir
- açıklama: Prisma modelleri arası ilişkileri, unique constraint'leri ve
  gerçek veri yazma/okumayı test etmek isteniyorsa (mock değil), CI
  ortamının da gerçek bir Postgres'e erişimi olmalı. GitHub Actions'ta bu,
  `jobs.<job>.services` altında bir `postgres:15` servisi + testlerden önce
  `prisma migrate deploy` adımı ile sağlanır — production'da migration
  uygulamak için kullanılan komut zaten budur, CI'da da aynısının
  kullanılması "CI production'ı taklit eder" ilkesiyle tutarlıdır.
- etkisi: Faz 1'den itibaren CI, `.github/workflows/ci.yml` içinde bir
  Postgres servisi içeriyor. Gelecekteki fazlarda yeni bir dış bağımlılık
  (Redis, vb.) gerçek entegrasyon testi gerektirirse aynı desen izlenmeli.

- tarih: 2026-09-01T01:12:00+03:00
- konu: Paralel Git worktree'leri aynı migration veritabanını paylaşmamalı
- açıklama: Bir worktree'nin migration geçmişi, başka bir branch'in dosya
  ağacında bulunmayan migrationları ortak DB'ye uygulayabilir. `prisma migrate
  status` yalnız kaynak branch'teki migrationları gördüğünden bu çapraz-branch
  drift'i yeterince görünür kılmadı; aynı test kaynak branch'in temiz CI DB'sinde
  geçerken paylaşılan yerel DB'de başarısız oldu.
- etkisi: Her paralel worktree için ayrı `TEST_DATABASE_URL`/DB adı kullanılmalı.
  Migration ve entegrasyon testleri o branch'in migrationlarıyla sıfırdan
  hazırlanmış izole DB üzerinde çalıştırılmalı; yeşil CI veya ortak dev DB tek
  başına başka worktree için kanıt sayılmamalı.

- tarih: 2026-09-01T08:11:56+03:00
- konu: Güvenlik ayarının varlığı, güvenlik davranışının kanıtı değildir
- açıklama: Logger testinde yalnız redaction path listesini kontrol etmek,
  gerçek serializer'ın path söz dizimini uyguladığını veya sırları çıktıda
  kaldırdığını kanıtlamıyordu. Ayrıca doğrudan Pino ile Fastify'nin Pino major
  sürümleri ayrışmıştı; davranış testi bu tip ayrışmasını görünür yaptı.
- etkisi: Secret-redaction gibi güvenlik sözleşmeleri gerçek serileştirilmiş
  çıktıda negatif assertion ile doğrulanmalı; framework ile doğrudan logger
  bağımlılıkları aynı major sürümde tutulmalı. Dışarıdan taşınan correlation id
  değerleri log enjeksiyonu ve kaynak tüketimi riskine karşı karakter ve uzunluk
  sınırından geçirilmelidir.

- tarih: 2026-09-01T08:30:03+03:00
- konu: Entity-resolution sonucu kabul edilmiş ilişki değildir
- açıklama: Araştırma adayı için bulunan deterministik match doğrudan `companyId`
  olarak tutulduğunda, henüz insanın doğrulamadığı bir öneri kanonik bağ gibi
  görünür. Bu özellikle telefon/adres/fuzzy-name gibi destekleyici sinyallerde
  false-merge riskini gizler.
- etkisi: ResearchCandidate `matchedCompanyId` (öneri) ve `companyId` (insan
  onaylı bağ) alanlarını ayrı tutar. Kabul, açık LINK_MATCH/CREATE_NEW kararı ister;
  otomatik Lead veya Outreach üretmez.

- tarih: 2026-09-01T08:30:03+03:00
- konu: Zincirlenmiş doğrulayıcılar geçersiz inputta da exception-safe olmalıdır
- açıklama: Zod `.url()` hatası, sonraki `.refine()` içinde `new URL(value)`
  çalışmasını otomatik engellemedi. Bu nedenle beklenen client validation hatası
  sunucu hatasına dönüştü.
- etkisi: Bir doğrulama zincirindeki her custom refine/transform, önceki adımların
  başarısına güvenmeden kendi başına güvenli çalışmalıdır; negatif HTTP status testi
  yalnız mesajı değil 4xx/5xx ayrımını da sabitlemelidir.

- tarih: 2026-09-01T08:35:00+03:00
- konu: Interactive transaction içinde relation projection sürücü davranışını değiştirebilir
- açıklama: Prisma 7, bir update üzerindeki çoklu relation `include` projection'ını
  aynı transaction istemcisinde paralel sorgulara çevirebildi. pg 8 bunu uyarıyla
  kabul ediyor; pg 9 aynı çağrı biçimini kaldıracağını bildiriyor.
- etkisi: Transaction sınırı yalnız birlikte commit/rollback olması gereken yazıları
  taşımalı. Zengin response projection atomik yazılar tamamlandıktan sonra okunarak
  hem tutarlılık korunmalı hem sürücünün concurrent-query yoluna girilmemelidir.

- tarih: 2026-09-01T09:05:00+03:00
- konu: Public iletişim verisi gönderim izni değildir
- açıklama: Bir şirket sitesinde veya başka açık kaynakta e-posta/telefon bulunması,
  o alıcıya belirli amaç ve kanalda mesaj göndermek için otomatik yetki üretmez.
- etkisi: ContactPoint provenance/verification ile CommunicationPermission insan
  kararı ayrı modellerdir; public flag tek başına gate'i açamaz.

- tarih: 2026-09-01T09:05:00+03:00
- konu: Veri işleme dayanağı ile ticari iletişim kuralı ayrı boyutlardır
- açıklama: Bir kişi verisini saklamak/işlemek için dayanak bulunması, satış veya
  pazarlama mesajının gönderilebileceği anlamına gelmez; ülke, amaç, alıcı tipi,
  kanal ve iletişim kuralı ayrıca incelenmelidir.
- etkisi: ALLOWED receipt, iki boyutu da policy version, reviewer, zaman, gerekçe
  ve evidence ile taşır. Uygulama hukuki sonucu otomatik tahmin etmez.

- tarih: 2026-09-01T09:05:00+03:00
- konu: Suppression firma kaydından bağımsız ve global olmalıdır
- açıklama: Opt-out yalnız ContactPoint veya Company üzerinde tutulursa aynı
  normalize e-posta/telefon başka bir firma kaydından tekrar kullanılabilir.
- etkisi: Kanal + normalize değer deterministik SHA-256 hash ile global engel
  olur. Hash pseudonymous veridir; anonim veya güvenle paylaşılabilir sayılmaz.

- tarih: 2026-09-01T09:05:00+03:00
- konu: Dry-run permission gate gelecekteki send yetkisi değildir
- açıklama: Gate değerlendirmesi ile provider çağrısı arasındaki sürede opt-out,
  süre dolumu veya policy değişebilir.
- etkisi: Bu aşama yalnız `actualSendPerformed=false` sonucu üretir. Gerçek send
  eklendiğinde gate, onay ve idempotent send yazımı aynı yürütme sınırında yeniden
  kontrol edilmelidir.

- tarih: 2026-09-01T09:38:00+03:00
- konu: Açıklanabilir ranking yalnız score breakdown değil, input receipt ister
- açıklama: Aynı toplam puan farklı evidence, freshness veya permission
  durumlarından gelebilir. Yalnız bileşen puanlarını saklamak sonucun neden
  değiştiğini yeniden üretmeye yetmez.
- etkisi: Ranking receipt algoritma/policy version, normalize context, company
  input, source-time evidence ve contact/gate snapshot'ları ile input hash taşır;
  aynı kanonik input idempotent aynı receipt'i döndürür.

- tarih: 2026-09-01T09:38:00+03:00
- konu: Suppression puanı düşürmekten öte terminal aksiyon değiştirmelidir
- açıklama: Suppressed alıcıya `REVIEW_COMMUNICATION_PERMISSION` önermek gate'i
  teknik olarak açmasa da operatöre izni yeniden arama yönünde yanlış sinyal verir.
- etkisi: Global suppression/opt-out algılanınca next action doğrudan
  `HONOR_SUPPRESSION` olur; yüksek diğer bileşenler bu yönlendirmeyi değiştiremez.

- tarih: 2026-09-01T10:15:49+03:00
- konu: Approval içerik receipt'idir, gerçek gönderim yetkisi değildir
- açıklama: Bir taslağın insan tarafından uygun bulunması; recipient, permission,
  suppression veya içeriğin gönderim anına kadar değişmediğini kanıtlamaz.
- etkisi: Approval tam revision/content hash, permission/policy ve karar-anı gate
  receipt'ine bağlanır; yine de `sendAuthorized=false` kalır. Phase 5 gerçek send
  kapısı aynı şartları yeniden kontrol etmek ve ayrı kullanıcı onayı almak zorundadır.

- tarih: 2026-09-01T10:15:49+03:00
- konu: Audit snapshot gerekli veriyi çoğaltmadan kimliği sabitlemelidir
- açıklama: Ham normalize e-postayı Draft, Approval ve Event içinde tekrar etmek
  silme/retention yüzeyini genişletir; yalnız ContactPoint'te tutmak yeterlidir.
- etkisi: Recipient snapshot ContactPoint id ve kanal+normalize değer SHA-256
  hash'ini taşır. DB `rawValue`/`normalizedValue` anahtarlarını ve
  `rawRecipientStored=true` değerini reddeder; hash pseudonymous kabul edilir.

- tarih: 2026-09-01T10:15:49+03:00
- konu: Opt-out ile approval aynı alıcı kilidi üzerinde seri hale gelmelidir
- açıklama: Gate'i okuyup daha sonra approval yazmak arasında opt-out oluşursa
  create-time veya review-time ALLOW sonucu artık geçerli değildir.
- etkisi: Uygulama yolundaki permission/suppression yazımı ve karar-anı gate'i
  aynı ContactPoint satırını `FOR UPDATE` ile kilitler. Bu, DB'ye uygulama dışı
  doğrudan yazma yetkisi verilmemesi gereğini ortadan kaldırmaz.
