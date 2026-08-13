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
