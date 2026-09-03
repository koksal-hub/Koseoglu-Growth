DECISIONS — Mimari Kararlar (ADR-lite)

Her karar şu formatta kaydedilir:
- DECISION
- WHY
- ALTERNATIVES
- CONSEQUENCES
- STATUS (PROPOSED / ACCEPTED / SUPERSEDED)

================================================================

## ADR-001 — Growth / MYLojistik Ayrımı

DECISION: Köseoğlu Growth ve MYLojistik ayrı kod tabanı, ayrı DB, ayrı runtime
olarak geliştirilir. Birleştirilmez.

WHY: Growth araştırma/pazarlama/satış üretimi yapan, sık deploy edilen, dış
kaynaklarla (web, sosyal medya, AI) etkileşen bir sistemdir. MYLojistik kazanılmış
operasyonu yürüten, stabilite önceliği farklı bir sistemdir. Aynı runtime'da
birleştirmek, birinin hatasının diğerini etkileme riskini doğurur.

ALTERNATIVES: Tek monorepo + tek runtime; tek DB ile paylaşımlı şema.

CONSEQUENCES: Veri paylaşımı yalnızca kontrollü API üzerinden yapılır. Kısa
vadede entegrasyon karmaşıklığı biraz artar, uzun vadede blast radius küçülür.

STATUS: ACCEPTED

---

## ADR-002 — GitHub Tek Doğruluk Kaynağı

DECISION: Proje durumu, görev kuyruğu ve karar geçmişi GitHub üzerinden
(Issues, branch, commit, PR, CI) yönetilir. AI sohbet geçmişi source of truth
değildir.

WHY: Birden fazla coding agent (Claude Code, Codex, Copilot, gelecekte
local/free agent'lar) aynı projede çalışacak. Ajanlar arası hafıza aktarımı
sohbet geçmişiyle değil, repository durumuyla yapılmalı.

ALTERNATIVES: Her ajanın kendi sohbet geçmişine güvenmesi; ayrı bir proje
yönetim aracı kullanmak.

CONSEQUENCES: Her görev commit/push/CI ile somutlaşmalı. STATUS.md, TASKS.md
gibi dosyalar güncel tutulmalı.

STATUS: ACCEPTED

---

## ADR-003 — LLM Last

DECISION: Her akışta önce deterministik kod denenir; LLM yalnızca son çare
olarak, dar kapsamlı görevler için çağrılır.

WHY: Maliyet, tekrarlanabilirlik, hata ayıklanabilirlik ve güvenilirlik.
Deterministik kod test edilebilir; LLM çıktısı doğrudan güvenilmemeli.

ALTERNATIVES: AI-first tasarım (her karar noktasında LLM'e danışmak).

CONSEQUENCES: Geliştirme başta biraz daha yavaş (kural motoru/parsing yazmak
gerekir) ama uzun vadede maliyet ve hata oranı düşer.

STATUS: ACCEPTED

---

## ADR-004 — İlk Giden İletişimde Zorunlu İnsan Onayı

DECISION: Outreach Draft (Faz 4), insan onayı olmadan hiçbir gerçek müşteri/
potansiyel müşteriye otomatik gönderim yapmaz.

WHY: Yanlış/uygunsuz bir mesajın gerçek bir şirkete otomatik gitmesi itibar ve
hukuki risk taşır (bkz. legal/deliverability safety gate).

ALTERNATIVES: Tam otomatik gönderim + sonradan izleme.

CONSEQUENCES: İlk aşamada gönderim hızı insan onay adımıyla sınırlıdır; bu
kabul edilebilir bir trade-off olarak değerlendirildi.

STATUS: ACCEPTED

---

## ADR-005 — Uzmanlaşmış Worker'lar, Tek Süper-Agent Değil

DECISION: Discovery, verification, ranking, outreach, nurturing, reporting
gibi işler ayrı, dar kapsamlı worker/agent'lara bölünür.

WHY: Tek bir genel amaçlı agent'a her şeyi yaptırmak, hata ayıklamayı
zorlaştırır, yetki sınırlarını bulanıklaştırır ve prompt-injection gibi
saldırılarda blast radius'u büyütür.

ALTERNATIVES: Tek büyük "super-agent" ile tüm iş akışını yönetmek.

CONSEQUENCES: Daha fazla bileşen, daha net sınırlar; orkestrasyon karmaşıklığı
Faz 6 (queue/worker/scheduler) ile yönetilir.

STATUS: ACCEPTED

---

## ADR-006 — CI Kalite Kapısı

DECISION: Bir görev, GitHub Actions CI (install → lint → typecheck → test →
build) PASS olmadan DONE sayılmaz.

WHY: "Çalışıyor" demek kanıt değildir; nesnel, tekrarlanabilir bir doğrulama
gerekir.

ALTERNATIVES: Ajan/geliştirici beyanına güvenmek.

CONSEQUENCES: Her PR/commit CI'dan geçmeli; kırmızı CI ile yeni işe
başlanmaz.

STATUS: ACCEPTED

---

## ADR-007 — Event Store (Değişmez Olay Akışı)

DECISION: Şirket/lead etkileşim geçmişi mutasyona uğrayan durum yerine
değişmez (immutable) event akışı olarak saklanır.

WHY: Ranking, attribution, process mining gibi ileri özellikler yeniden
hesaplanabilir bir temel gerektirir; sadece "son durum" tutmak bunu engeller.

ALTERNATIVES: Yalnızca güncel state tutan geleneksel CRUD modeli.

CONSEQUENCES: Faz 1'de temel şema kurulur; Faz 9 Company Event Intelligence
bunun üzerine inşa edilir. Depolama artar ama geriye dönük analiz mümkün olur.

STATUS: ACCEPTED

---

## ADR-008 — Evidence + Confidence Gate

DECISION: Araştırma/discovery çıktıları kanıt (kaynak, zaman damgası) ile
saklanır; düşük güvenilirlikli veri otomatik aksiyona geçemez.

WHY: Yanlış/doğrulanmamış şirket verisiyle satış/pazarlama üretmek itibar
riski ve verimsizlik yaratır.

ALTERNATIVES: Ham AI çıktısını doğrudan güvenilir kabul etmek.

CONSEQUENCES: Discovery → Verification → Confidence Gate → Ranking/Outreach
akışı zorunlu bir pipeline haline gelir (Faz 2).

STATUS: ACCEPTED

---

## ADR-009 — Model-Independent AI Routing

DECISION: AI/LLM çağrıları soyutlama katmanından geçer; iş mantığı hiçbir
sağlayıcıya (OpenAI, Anthropic, vb.) doğrudan bağımlı olmaz.

WHY: Fiyat/performans/erişilebilirlik zamanla değişir; tek sağlayıcıya
kilitlenmek risk ve maliyet esnekliğini azaltır.

ALTERNATIVES: Doğrudan tek bir SDK'ya bağımlı entegrasyon.

CONSEQUENCES: Başlangıçta küçük bir soyutlama maliyeti; ileride Cost Router
ve sağlayıcı değişimi kolaylaşır. Faz 0'da yalnızca mimari yer tutucu,
implementasyon ileri fazlarda.

STATUS: ACCEPTED

---

## ADR-010 — Social Command Center: AI Adaptation + Deterministic Publishing

DECISION: Growth'un sosyal medya katmanı tek bir cross-post butonu olarak değil,
Social Command Center olarak geliştirilecek. Bir Master Content AI ile platforma
özgü varyantlara dönüştürülecek; marka/doğruluk kontrolü ve insan onayından sonra
yayın aksiyonu deterministic ProviderAdapter katmanı üzerinden yapılacaktır.
Destek hedefi: LinkedIn, Instagram, Facebook, X, Threads, TikTok, YouTube,
Google Business Profile ve Pinterest.

WHY: Platformların format, medya, karakter, API, izin ve audience beklentileri
farklıdır. Aynı metni körlemesine tüm platformlara kopyalamak kaliteyi düşürür.
LLM'in doğrudan yayın API'sini kontrol etmesi ise yetki, tekrar edilebilirlik,
retry/idempotency ve hata ayıklama riskini artırır. Growth'un gerçek amacı
engagement değil; qualified lead → teklif → kazanılmış iş → brüt kâr üretmektir.

ALTERNATIVES: Her platformu manuel yönetmek; Buffer/Hootsuite/Postiz benzeri bir
ürünü bütünüyle kopyalamak; LLM'e doğrudan platform API yetkisi vermek; aynı postu
bütün kanallara aynen göndermek.

CONSEQUENCES: Phase 8'de Composer, platform variant, ProviderAdapter, Human Approval,
scheduler/publish queue, delivery monitor, Unified Inbox, analytics ve CRM attribution
yüzeyleri oluşturulacaktır. Phase 6 queue/retry/idempotency altyapısı ve Phase 7
attribution/observability reuse edilir. Postiz/Mixpost/Buffer/Hootsuite/Sprout/Metricool
yalnız benchmark/referans olarak incelenir; lisans ve güvenlik kontrolü olmadan kod
kopyalanmaz. Pinterest ayrıca Visual SEO / evergreen traffic kanalı olarak ölçülür.

STATUS: ACCEPTED

---

## ADR-011 — Research Eşleşme Önerisi ile Kanonik Şirket Bağını Ayır

DECISION: ResearchCandidate üzerindeki deterministik entity-resolution sonucu
`matchedCompanyId` olarak yalnız öneri/receipt şeklinde saklanır. Kanonik
`companyId` ancak insan `ACCEPT` kararı ve açık `LINK_MATCH` veya `CREATE_NEW`
seçiminden sonra set edilir. Kabul, otomatik Lead veya Outreach üretmez.

WHY: Domain, telefon, adres ve bulanık ad gibi sinyaller farklı güven düzeylerine
sahiptir. Olası eşleşmeyi doğrudan şirket ilişkisi saymak false-merge riskini ve
yanlış şirket üzerinde satış aksiyonu alma ihtimalini büyütür.

ALTERNATIVES: Entity-resolution sonucunu doğrudan `companyId` yapmak; kabul anında
belirsizliği sessizce çözmek; otomatik Company/Lead oluşturmak.

CONSEQUENCES: API yanıtı match nedeni ve güvenini gösterir; eşleşen adayın kabulü
açık resolution ister. Veri modeli iki nullable ilişki taşır, fakat araştırma
gerçeği ile insan kararını denetlenebilir biçimde ayırır.

STATUS: ACCEPTED

---

## ADR-012 — Bulunan İletişim Noktası ile İletişim İznini Ayır

DECISION: `ContactPoint`, bir e-posta veya telefonun kaynağını, sınıfını,
toplanma/doğrulama zamanını, güvenini ve veri işleme bağlamını tutar;
`CommunicationPermission` ise belirli kanal, amaç ve ülke için insan tarafından
incelenmiş iletişim kararını ayrı ve eklemeli bir receipt olarak tutar. Açık web
kaynağında bulunmak izin sayılmaz. `UNKNOWN`, süresi geçmiş karar, düşük güven,
eksik aydınlatma/retention veya global suppression her zaman deny üretir.

WHY: Veri işleme dayanağı ile ticari iletişim kuralı aynı karar değildir. Bir
adresin teknik olarak ulaşılabilir olması, o kanalda ve amaçta mesaj gönderme
yetkisi vermez. Opt-out/şikâyet kayıtlarının firma bazında kalması da aynı
normalize alıcının başka firma kaydından tekrar kullanılmasına yol açabilir.

ALTERNATIVES: Public kaynağı otomatik izin saymak; kişi ve şirket adreslerini tek
alan olarak saklamak; izin durumunu `ContactPoint` üzerinde değiştirilebilir tek
alan yapmak; suppression'ı yalnız company kapsamında tutmak.

CONSEQUENCES: Normalize alıcı değeri ve kanalından deterministik SHA-256
suppression hash'i üretilir; bu hash anonim değil, pseudonymous güvenlik
verisidir. `OPTED_OUT`/`SUPPRESSED` global ve bypass edilemez engel oluşturur.
Kişisel adreslerde retention ve uygun veri işleme dayanağı zorunludur; PERSONAL
iletişim için yalnız açık rıza + explicit-consent receipt ALLOWED olabilir.
Türkiye'ye özgü tacir/esnaf istisnası başka ülke kararında kullanılamaz.
Mevcut gate yalnız dry-run'dır ve gerçek gönderim yapmaz; ileride provider send
işlemi eklenirse aynı kapı gönderim anında atomik olarak yeniden değerlendirilir.

STATUS: ACCEPTED

---

## ADR-013 — Deterministik Ranking, Immutable Input Receipt ve Güvenli Next Action

DECISION: Phase 3 ranking ilk sürümü LLM/ML kullanmaz. Beş ayrı 0–20 tamsayı
bileşeni (ICP fit, company confidence, current evidence, verified contact,
communication permission) sabit `deterministic-ranking-v1` algoritmasıyla toplanır.
Her sonuç business policy version, normalize ICP bağlamı, evaluation zamanı,
company input'u, evidence/contact/gate receipt'leri, reason code'ları ve SHA-256
input hash'iyle immutable `CompanyRankingReceipt` olarak saklanır.

WHY: Tek bir opak skor, hangi kanıtın kullanıldığını ve sonucun neden değiştiğini
göstermez. Floating-point ağırlıklar DB'de exact toplamı zorlaştırır. Ayrıca yüksek
puan, outreach veya send yetkisi değildir; veri eksikliği ve suppression güvenli
aksiyon yönlendirmesine yansımalıdır.

ALTERNATIVES: Kara kutu ML/LLM skoru; yalnız son skoru Company/Lead üzerinde
mutasyona uğrayan alan olarak tutmak; permission durumunu ranking dışında bırakmak;
skor hesaplanınca otomatik Lead veya outreach üretmek.

CONSEQUENCES: DB her bileşeni 0..20, toplamı 0..100 ve toplam eşitliğini zorunlu
kılar. Aynı kanonik input aynı hash/receipt'i idempotent döndürür. CURRENT, en çok
90 günlük ve confidence >=0.7 evidence dışında hiçbir kanıt evidence puanı vermez.
Public/unverified contact permission sayılmaz. Global suppression varsa terminal
aksiyon `HONOR_SUPPRESSION` olur. En ileri durum dahi yalnız
`READY_FOR_HUMAN_OUTREACH_REVIEW` üretir; Lead, draft, send veya dış servis çağrısı
oluşmaz.

STATUS: ACCEPTED

---

## ADR-014 — Outreach Approval İçerik Receipt'idir, Gönderim Yetkisi Değildir

DECISION: Phase 4 yalnız `HUMAN_AUTHORED` e-posta taslağı, append-only içerik
revizyonları ve bağımsız insan kararı üretir. Akış `DRAFT → IN_REVIEW →
APPROVED | REJECTED | EXPIRED` ile sınırlıdır. Taslak yalnız güncel
`READY_FOR_HUMAN_OUTREACH_REVIEW` ranking receipt'i ve o anda ALLOW veren
communication gate ile açılır; gate inceleme ve karar anında yeniden çalışır.
Approval, tam revizyon/content hash'i, permission/policy ve gate snapshot'ına
bağlanır fakat her yanıtta `sendAuthorized=false` kalır.

WHY: Taslak metni ile gerçekten gönderilen ileti birbirinden farklı
artefaktlardır. Revizyon sonrası eski onayı geçerli saymak, taslak yazarıyla
onaylayanı birleştirmek veya create-time permission sonucuna güvenmek; yanlış
içeriğin ya da sonradan opt-out olan alıcının aksiyon katmanına geçmesine yol
açar. Ham e-posta değerini audit/event receipt'lerinde çoğaltmak veri riskini
gereksiz büyütür.

ALTERNATIVES: Onayı Draft üzerindeki değiştirilebilir boolean olarak tutmak;
approval sonrası içeriği düzenlemek; public adresi otomatik izin saymak; provider
send çağrısını approval endpoint'ine eklemek; recipient değerini bütün receipt ve
event'lere kopyalamak.

CONSEQUENCES: Recipient snapshot yalnız ContactPoint id + deterministik recipient
hash ve sınıflandırma taşır; DB raw/normalized recipient anahtarlarını reddeder.
Approval content hash'i DB foreign key'iyle seçili revizyona bağlanır. İçerik
yazarlarının hiçbiri onaylayamaz. PostgreSQL trigger'ları izin verilmeyen status
geçişlerini ve revision/approval UPDATE işlemlerini reddeder. Permission/suppression
yazımıyla approval aynı ContactPoint row lock'ını kullanır. Bu güvence yalnız uygulama veri yolu içindir;
auth eklenmeden public/multi-user deploy yapılmaz ve provider/send Phase 5'te
ayrı kullanıcı onayı + güvenlik checkpoint'i ister.

STATUS: ACCEPTED

---

## ADR-015 — Provider Entegrasyonu Önce Kapalı Resend Test-Simulation Capability'sidir

DECISION: Phase 5 gerçek gönderim açmaz. Provider adapter'i yalnız Resend'in sabit
test adreslerine, sabit sentetik konu/gövdeyle çalışabilir ve public HTTP send route
sunmaz. Uygulama katmanındaki tek yürütme sınırı; `RESEND_TEST`, explicit enable,
API key, from address ve yeterli uzunlukta webhook secret birlikte doğrulandığında
oluşturulan config-bound service'tir. Her `SendAttempt`; exact approved
revision/content hash, current permission/suppression gate, ayrı customer/test
recipient hash'i, stable idempotency key ve test scenario receipt'i taşır.

WHY: Approval gönderim yetkisi değildir. Process crash'i, timeout veya provider
cevabından önce gelen webhook; tek bir dış HTTP çağrısı ile yerel transaction
arasında atomiklik olmadığını gösterir. Caller-controlled bir boolean ya da serbest
alıcı/içerik alanı, test sınırını kolayca üretim gönderimine dönüştürebilir. Provider
webhook'ları duplicate ve sırasız gelebilir; inbound e-posta ayrıca içerik ve
kimlik doğrulama yüzeyi açar.

ALTERNATIVES: Approval endpoint'inden doğrudan send; gerçek müşteri mailbox pilotu;
caller'ın `executionEnabled=true` geçmesi; provider message ID olmadan erken webhook'u
kalıcı ignore etmek; inbound reply'ı bu aşamada otomatik işlemek; mutable audit rows.

CONSEQUENCES: Provider request'i `send_attempt_id` tag'i ve stable idempotency key
taşır; exact versioned provider body hash'i ilk dispatch'te set-once saklanır ve
değişmiş body/config ile UNKNOWN retry provider çağrısından önce durur. İmzalı
webhook exact raw body üzerinden doğrulanır; provider response commit'inden önce
gelirse tag + normalize test-recipient hash'iyle aynı attempt'e yakınsar.
Timeout/transport belirsizliği `UNKNOWN` kalır; stale `DISPATCHING` lease tekrar
provider çağrısı yapmadan `UNKNOWN` olarak kurtarılır. Receipt'ler UPDATE/DELETE,
SendAttempt DELETE'e kapalıdır. Bounce/complaint yalnız test recipient suppression'ı
üretir; public SMTP girdisi olan `email.received` persistent receipt oluşturmadan
IGNORED kalır. SendAttempt yalnız canonical PREPARED şekliyle INSERT edilebilir;
durum constraint'leri nullable delivery kanıtını SQL üç-değerli mantığına karşı
`IS TRUE`/`IS FALSE` ile doğrular. Secret, ham recipient ve gerçek mesaj içeriği audit tablolarına
yazılmaz. Authentication, domain doğrulama ve gerçek customer send ayrı karar ve
açık kullanıcı onayı ister.

STATUS: ACCEPTED FOR TEST-SIMULATION ONLY

---

## ADR-016 — Deterministic Research Extraction ve İkinci Kaynak Kapısı

DECISION: Research discovery ilk otomatik dilimde ağ erişimi veya LLM çağrısı
yapmaz. Worker'ın sağladığı bounded public-page snapshot'ı yalnız veri olarak
sanitize edilir; sektör, faaliyet, lokasyon, domain ve iletişim sinyalleri sabit
kurallarla çıkarılır. Aday kabulü, aynı host üzerindeki farklı sayfaları bağımsız
saymayan en az iki farklı source origin kanıtı gerektirir. İkinci kanıt yalnız nihai
karardan önce append-only Evidence kaydı olarak eklenebilir.

WHY: Dış sayfa içeriği prompt-injection ve hallucination taşıyabilir; crawler veya
LLM'yi doğrudan aksiyon katmanına bağlamak güven sınırını büyütür. Tek kaynağa
dayalı şirket/iletişim iddiası yanlış lead ve yanlış outreach üretebilir. Deterministic
extractor test edilebilir ve AI maliyeti/latency'si yaratmaz; ileride AI eklenirse
receipt sözleşmesi ayrıca uygulanır.

ALTERNATIVES: Serbest biçimli LLM extraction; aynı web sitesindeki iki URL'yi iki
kaynak saymak; tek kanıtla otomatik Company kabul etmek; crawler'ın doğrudan
provider veya outreach katmanına yazması.

CONSEQUENCES: `POST /research-missions/:id/discover` yalnız bounded snapshot kabul
eder ve hiçbir gerçek web çağrısı yapmaz. `POST /research-candidates/:id/evidence`
ile ek kanıt eklenir; `ACCEPT` kararı source-origin sayısı ikiye ulaşmadan reddedilir.
Ham snapshot, e-posta adresi veya secret kalıcı audit verisi olarak çoğaltılmaz;
çıkarılan candidate/company alanları insan kararı olmadan kanonik Company oluşturmaz.

STATUS: ACCEPTED FOR DETERMINISTIC RESEARCH SLICE

---

## ADR-017 — Durable Internal Job Queue ve Crash Recovery

DECISION: Phase 6 iç işler için PostgreSQL-backed `Job` modeli ve bounded
in-process worker/scheduler kullanır. Her iş stable `idempotencyKey` ve canonical
JSON `payloadHash` ile tekilleştirilir; aynı anahtarda type veya payload değişimi
409 conflict'tir. Claim işlemi `FOR UPDATE SKIP LOCKED` ile atomiktir ve worker
lease'i `lockedAt/lockedBy` ile tutulur. Hatalar exponential backoff ve
`maxAttempts` sınırıyla retryable olur; limit aşımı `DEAD_LETTER`'a gider. Lease
stale olduğunda attempt sayısı korunarak yeniden kuyruğa alınır veya dead-letter
edilir.

WHY: Scheduler/worker state'ini yalnız process memory'sinde tutmak crash sonrası
iş kaybı ve duplicate execution riskini artırır. İdempotency conflict guard'ı,
aynı anahtarın farklı payload ile sessizce yeniden kullanılmasını engeller;
SKIP LOCKED paralel worker'ların aynı işi almasını önler. Retry ve dead-letter
durumları insan incelemesi ve ölçülebilir operasyon için açık kalır.

ALTERNATIVES: Sadece in-memory queue; row lock olmadan polling; sonsuz retry;
başarısız işleri sessizce düşürmek; job handler'ını provider veya müşteri
gönderimine doğrudan bağlamak.

CONSEQUENCES: `payload` untrusted JSON olarak kalır ve kod çalıştırmaz. Handler
registry deterministiktir; kayıtlı handler yoksa iş dış aksiyon almadan retry veya
dead-letter olur. Bu faz gerçek e-posta, sosyal medya, telefon veya müşteri
iletişimi çalıştırmaz. Queue gözlemlenebilirliği operasyonel Job state'inde,
işletme audit'i ise append-only Event tablosunda tutulur.

STATUS: ACCEPTED FOR INTERNAL WORK ONLY

---

## ADR-018 — Europe/Istanbul Deterministic Reporting ve Secret-Free Usage Ledger

DECISION: Phase 7 yönetim raporu sabit `Europe/Istanbul` takvim günleriyle
hesaplanır (03:00 UTC başlangıç, 24 saat pencere) ve `reportDate:timezone`
anahtarıyla idempotent `ManagementReport` snapshot'ına yazılır. Snapshot yalnız
aggregate Company/Lead/Research/Job/Outreach/Event KPI'ları ve pseudonymous-safe
durumları taşır; ham e-posta, telefon, token veya secret taşımaz. Maliyet
gözlemlenebilirliği, dış çağrı başlatmayan ve yalnız gerçek kullanım receipt'i
geldiğinde yazılan `UsageReceipt` ledger'ıyla sınırlıdır. Receipt yoksa AI kullanımı
`0` görünür; uydurma maliyet veya başarı üretilmez.

WHY: Yönetim kararı için engagement yerine lead, research quality, queue health ve
gerçek maliyetin tek, tekrarlanabilir pencerede izlenmesi gerekir. Zaman dilimini
istemci girdisine bırakmak gün sınırlarını ve rapor karşılaştırmasını bozar. Cost
alanlarını float yerine integer minor unit olarak tutmak yuvarlama/drift riskini
azaltır. Ham iletişim ve credential verisini snapshot'a kopyalamamak raporun
erişim yüzeyini küçültür.

ALTERNATIVES: Her istekte farklı timezone; mutable son-skor alanları; provider
API'sinden rapor sırasında canlı çağrı; receipt olmadan token/maliyet tahmini;
raw contact/metadata değerlerini dashboard'a taşımak.

CONSEQUENCES: `GET /api/reports/management` private/local kalır; auth olmadığı
için public veya multi-user deploy yetkisi vermez. `UsageReceipt` idempotency key
aynı immutable usage receipt'i yeniden kullanır, farklı receipt 409 döner ve
credential-shaped metadata reddedilir. Report snapshot regeneration yalnız input
hash değiştiğinde row'u günceller; aynı input reuse olarak işaretlenir. Gerçek
AI/provider, e-posta, telefon veya sosyal medya işlemi bu fazda çalıştırılmaz.

STATUS: ACCEPTED FOR DETERMINISTIC REPORTING ONLY

---

## ADR-019 — Social Command Center Foundation: Provider-Neutral ve Human-Approved

DECISION: Phase 8A sosyal medya temelinde dokuz platform ortak `SocialPlatform`
enum'u, credential-free `SocialConnection` metadata'sı, bir `MasterContent` ve
platform-specific `SocialContentVariant` kayıtları kullanır. Veritabanına OAuth
access/refresh token, medya binary'si veya provider secret yazılmaz; yalnız ileride
secret manager'a işaret eden opaque ref kabul edilebilir. Variant content hash'i ve
versioned product policy receipt'i deterministiktir. DRAFT → IN_REVIEW → APPROVED
geçişinde author ile reviewer aynı olamaz. Provider adapter interface'i ve in-process
registry vardır, fakat kayıtlı concrete adapter yoksa hiçbir network/publish işlemi
başlamaz.

WHY: Tek master içeriği dokuz kanala körlemesine kopyalamak platform kuralları,
marka doğruluğu ve spam riskini büyütür. OAuth tokenlarını uygulama DB'sinde tutmak
credential sızıntısı ve refresh sorumluluğu doğurur. Human approval olmadan sosyal
yayın geri alınamaz dış aksiyondur; önce veri sözleşmesi ve validation sınırı
kanıtlanmalıdır.

ALTERNATIVES: Her platform için ayrı iş mantığı; tokenı plaintext/JSON olarak DB'ye
yazmak; master içeriği otomatik yayınlamak; provider SDK'sını domain modeline
bağlamak; aynı author'ın kendi onayını kabul etmek.

CONSEQUENCES: Bu faz yalnız içerik hazırlama/approval altyapısıdır; gerçek OAuth,
token refresh, media upload, publish, schedule, DM/inbox veya yorum cevabı yoktur.
Conservative character limitleri provider'ın canlı resmi limitleri değildir;
versioned product guard olarak concrete adapter öncesi tekrar doğrulanacaktır.
Queue/worker altyapısı ileride publish idempotency için reuse edilir. Auth yokluğu
nedeniyle bu metadata ve approval yüzeyi public/multi-user deploy edilemez.

STATUS: ACCEPTED FOR SAFE FOUNDATION ONLY

---

## ADR-020 — Social Composer Approval'dan Internal Publish Job'a Güvenli Geçiş

DECISION: Phase 8B private API'si master içerik ve platform varyantlarını
`DRAFT → IN_REVIEW → APPROVED` insan onayıyla ilerletir. Yalnız APPROVED varyant
gelecekte yayınlanmak üzere `scheduledAt` alabilir; scheduling, variant content
hash'inden türetilen stable idempotency key ile yalnız `SOCIAL_PUBLISH` internal
Job oluşturur ve `SCHEDULED` state yazar. Job handler veya provider adapter bu
fazda kayıtlı değildir; hiçbir network/publish/DM çağrısı yapılmaz. Web composer
aynı sözleşmeyi local preview olarak gösterir.

WHY: Onay ile dış platformda geri alınamaz yayın arasında açık ve gözlemlenebilir
bir sınır gerekir. Queue'yu yeniden kullanmak duplicate schedule riskini azaltır,
ancak worker'ın provider çağrısı yapması için ayrı OAuth, platform policy ve risk
onayı gereklidir. UI'nin yalnız workflow preview göstermesi auth olmadan yanlış
bir "yayınlandı" algısı oluşmasını engeller.

ALTERNATIVES: Approval endpoint'inden doğrudan provider publish; approved olmayan
varyantı schedule etmek; her çağrıda yeni publish job; browser'dan provider API'lerini
çağırmak; UI state'ini DB/job state'i yerine tek doğru saymak.

CONSEQUENCES: `SOCIAL_PUBLISH` payload yalnız variant id/platform/content hash/policy
version taşır; raw contact, token veya medya binary'si taşımaz. Duplicate scheduling
aynı variant state'i nedeniyle 409 döner. API/private UI auth yokluğu nedeniyle
public deploy değildir. Concrete adapters, token refresh, media upload, schedule/
publish, inbox/DM ve analytics attribution sonraki ayrı risk dilimleridir.

STATUS: ACCEPTED FOR SAFE SCHEDULING ONLY

---

## ADR-021 — Social Connection Metadata ve Fail-Closed Publish Gate

DECISION: Social connection endpoint'leri yalnız platform/account metadata'sı,
scopes ve gelecekteki `vault://` opaque reference'ı saklar; access/refresh token,
secret veya credential-shaped metadata reddedilir. Private lifecycle route'u
`CONNECTED` durumunu kendi başına yazamaz; bu durum ancak gelecekteki dış adapter
doğrulamasıyla üretilebilir. Readiness endpoint'i bağlı hesap, adapter kaydı,
variant schedule durumu ve global publish-disabled sınırını birlikte raporlar.

WHY: Bir hesabı bağlı veya yayına hazır gösterip gerçekte OAuth/adapter olmaması
yanlış güven ve geri alınamaz dış aksiyon riski doğurur. Blocker'ları görünür ve
deterministic yapmak, sonraki provider entegrasyonunun güvenli bir sözleşmeye
bağlanmasını sağlar.

ALTERNATIVES: API'den doğrudan CONNECTED yazmak; tokenları DB'ye kopyalamak;
adapter yokken job'ı başarılı saymak; yalnız tek bir blocker döndürmek.

CONSEQUENCES: Bu faz hesap bağlantısı başlatmaz, token refresh/media upload/publish
yapmaz ve readiness hiçbir koşulda `ready: true` üretmez. Gerçek OAuth callback,
vault entegrasyonu, concrete adapter ve dış platform operasyonları sonraki ayrı
risk/onay dilimleridir.

STATUS: ACCEPTED FOR CREDENTIAL-FREE GATE ONLY

---

## ADR-022 — Provider-Unverified Delivery ve Immutable UTM Attribution Receipt

DECISION: Social delivery endpoint'i yalnız internal `SOCIAL_PUBLISH` Job ve
variant state'ini projection olarak gösterir; provider tarafında yayınlandı
iddiası üretmez. Attribution için her variant'a en fazla bir immutable receipt
bağlanır. Receipt yalnız HTTPS destination ve normalize UTM değerlerini, hash'i
ile saklar; web analytics, lead, teklif, kazanılmış iş veya brüt kâr verisi
aldığı anlamına gelmez. Aynı hash idempotent reuse edilir, farklı payload 409'dur.

WHY: Queue'daki bir işin varlığı platformda post'un gerçekten göründüğünü kanıtlamaz.
Attribution metadata'sını ölçüm olaylarından ayırmak, erken başarı iddialarını ve
credential/query-string sızıntısını önler; daha sonra gerçek analytics connector'u
ayrı provenance ve consent sözleşmesiyle eklenebilir.

ALTERNATIVES: Job SUCCEEDED durumunu doğrudan PUBLISHED saymak; attribution'ı
variant JSON'una serbestçe eklemek; HTTP veya credential içeren destination URL'leri
kabul etmek; aynı variant için receipt'i overwrite etmek.

CONSEQUENCES: Bu faz site analytics webhook'u, provider metrics, CRM lead/opportunity
bağı veya revenue attribution çalıştırmaz. Delivery state'leri açıkça
`*_PROVIDER_UNVERIFIED` olarak adlandırılır; gerçek provider adapter ve analytics
entegrasyonu sonraki ayrı risk/onay dilimleridir.

STATUS: ACCEPTED FOR OBSERVABILITY CONTRACT ONLY

---

## ADR-023 — Fail-Closed Internal API Authentication Boundary

DECISION: `GROWTH_INTERNAL_API_KEY` production ortamında zorunludur. Konfigüre
edildiğinde business route'ları yalnız `x-api-key` ile ve constant-time karşılaştırma
sonrası çalışır; eksik anahtar 401, yanlış anahtar 403 döner. `/api/health`,
`/api/ready` ve imzalı `/api/webhooks/resend` kendi amaçlarına uygun istisnalardır.
Development/test ortamında anahtar yoksa local workflow korunur; bu durum public
deploy izni değildir.

WHY: Auth olmadan sosyal bağlantı, içerik approval, müşteri/contact ve rapor API'leri
yanlışlıkla internete açılırsa veri değişikliği ve dış aksiyon riski oluşur. En küçük
fail-closed sınır, gerçek kullanıcı/SSO tasarımı gelene kadar kazara public deploy'u
engeller ve anahtarın loglanmamasını garanti eder.

ALTERNATIVES: Her route'a ayrı kontrol kopyalamak; anahtarı query/body'de taşımak;
production'da key yokken açık kalmak; health check'lerini de gizlemek.

CONSEQUENCES: Bu bir kullanıcı/rol/SSO sistemi değildir. Key rotation, secret manager
enjeksiyonu, multi-user identity, CSRF/cookie politikası ve provider OAuth sonraki
ayrı güvenlik/onay dilimleridir. Gerçek anahtar repo'ya veya loglara yazılmaz.

STATUS: ACCEPTED FOR INTERNAL BOUNDARY ONLY

---

## ADR-024 — Safe Unified Inbox Receipt ve Human Classification

DECISION: Inbound sosyal olaylar ilk aşamada yalnız metadata receipt olarak kabul
edilir: platform/account, provider message key, thread/sender handle, message type,
alınma zamanı ve içerik hash'i saklanır; ham mesaj metni alınmaz. Aynı provider key
aynı immutable receipt'e idempotent biçimde döner, farklı payload conflict'tir.
Intent (LEAD, CUSTOMER, QUESTION, COMPLAINT, SPAM, OTHER) yalnız açık human review
endpoint'iyle yazılır ve reviewer receipt'ine bağlanır.

WHY: Dış platform mesajları untrusted input ve PII içerebilir. Ham metni ve otomatik
cevap yetkisini ilk dilime almak gereksiz gizlilik, prompt-injection ve dış iletişim
riski doğurur. Önce dedup ve insan sınıflandırma kanıtlanmalıdır.

ALTERNATIVES: Ham DM/comment saklamak; AI'ı otomatik intent/cevap için çalıştırmak;
aynı provider key'i overwrite etmek; complaint/lead mesajına otomatik yanıt vermek.

CONSEQUENCES: Bu faz provider fetch, message body storage, sentiment/AI inference,
CRM link, assignment, reply veya DM göndermez. Connector, retention/consent, PII
redaction ve human response workflow sonraki ayrı risk/onay dilimleridir.

STATUS: ACCEPTED FOR METADATA-ONLY INBOX

---

## ADR-025 — Provider OAuth Onboarding Öncesi Açık Onay Kapısı

DECISION: Provider adapter, OAuth callback/token refresh, media upload, publish,
DM veya reply implementasyonu; kullanıcı tarafından seçili hesap/platform, exact
scope, provider app sahipliği, secret-manager rotation/expiry sahibi, sandbox/paper
sınırı, rollback/delivery policy ve yazılı onay kaydı olmadan başlamaz. Mevcut
adapter registry/readiness yalnız fail-closed sözleşmedir; gerçek token hiçbir
DB, log veya Job payload'ına giremez.

WHY: Dokuz platformun izin, app review, fiyat, rate limit ve yayın davranışı
aynı değildir. Hesap sahipliği ve scope belirsizken kodu canlıya bağlamak müşteri
iletişimi, gizlilik ve geri alınamaz yayın riski doğurur.

ALTERNATIVES: Tüm provider'ları tek seferde bağlamak; kullanıcı tokenını chat/env
veya DB'ye kopyalamak; sandbox olmadan live publish açmak; approval'ı sonradan almak.

CONSEQUENCES: Safe composer/inbox/attribution/monitor hazır kalır, fakat dış
provider aksiyonu bilinçli olarak kapalıdır. Onboarding kanıtı geldiğinde önce
tek bir pilot adapter ve paper/sandbox contract testleri yürütülür; live go-live
ayrı karar olarak ele alınır.

STATUS: ACCEPTED — IMPLEMENTATION WAITING FOR EXPLICIT PROVIDER SCOPE

---

## ADR-026 — Credential-Free SEO/GEO Visibility Asset Contract

DECISION: SEO ve GEO görünürlük için Growth DB'sine yalnız sahip olunan canonical
sayfanın metadata sözleşmesi alınır: HTTPS canonical URL, locale, başlık,
açıklama, hedef niyetleri, isteğe bağlı JSON-LD metadata'sı, robots direktifi ve
deterministic content hash/validation receipt. Asset akışı
`DRAFT → IN_REVIEW → APPROVED` olup yazar kendi asset'ini onaylayamaz. Provider
arama, indexleme, sıralama veya AI-search doğrulaması bu model/API tarafından
yapılmaz; receipt bunları `NOT_RUN`, readiness ise execution disabled olarak
gösterir.

WHY: Görünürlük hedefi, dış arama sağlayıcılarına ve ham web taramasına bağlanmadan
önce içerik kalitesi, canonical/robots güvenliği ve insan onayıyla denetlenebilir
olmalıdır. Credential-shaped metadata veya tracking/query URL'si kabul etmek,
provenance ve gizlilik sınırını zayıflatır.

ALTERNATIVES: Search API'lerinden canlı ranking çekmek; canonical URL'leri query
parametreleriyle kabul etmek; ham sayfa metnini Growth DB'sine kopyalamak; asset'i
insan onayı olmadan yayınlanabilir saymak.

CONSEQUENCES: Bu faz SEO/GEO metadata hazırlama ve review yüzeyini sağlar ancak
indexlendi, sıralandı, AI cevabında göründü veya trafik/lead üretti iddiasında
bulunmaz. Search Console, analytics, crawler ve provider connector'ları ayrı
provenance, credential ve onay sözleşmeleriyle sonraki fazlara bırakılır.

STATUS: ACCEPTED FOR SAFE METADATA/REVIEW ONLY

---

## ADR-027 — Deterministic Research Mission Action Projection

DECISION: ResearchMission adayları için yeni bir DB tablosu veya otomatik worker
yerine read-only bir action projection sunulur. `PROPOSED` ve
`NEEDS_MORE_EVIDENCE` adayları confidence, bağımsız evidence origin sayısı ve
email/phone contact signal varlığına göre `VERIFY_CANDIDATE`,
`COLLECT_EVIDENCE`, `COLLECT_CONTACT_SIGNAL` veya
`REVIEW_CANDIDATE_DECISION` görevlerine ayrılır. Sonuç bounded limit, stable
priority/candidate sıralaması ve `actualWritesPerformed=false` /
`externalCallsPerformed=false` receipt'i taşır; ACCEPTED/REJECTED adaylar
projeksiyona girmez.

WHY: Araştırma görevi görünürlüğü, dış tarama veya otomatik iletişim başlatmadan
operatörün sıradaki doğrulama işini seçebilmesini sağlar. Website varlığı email ya
da telefon kanıtı değildir; contact toplama görevi yalnız bu sinyaller eksikse
üretilir.

ALTERNATIVES: Her görev için kalıcı queue tablosu oluşturmak; eksik veriyi AI ile
tamamlamak; aday oluşturulunca otomatik email/telefon lead'i üretmek; website'i
iletişim noktası kabul etmek.

CONSEQUENCES: Bu dilim yalnız projection ve açıklanabilir reason code üretir.
Gerçek crawler, email/telefon toplama, permission kararı, Lead/Outreach yazımı ve
dış iletişim sonraki ayrı onaylı dilimlerdir.

STATUS: ACCEPTED FOR READ-ONLY RESEARCH WORK QUEUE

---

## ADR-028 — Recommendation Measurement Contract ve Exposure Lineage

DECISION: Her lead-ranking veya research-action önerisi, recommendation type/id,
algorithm version, input hash, exploitation/exploration mode, position, actor ve
zamanı içeren `RecommendationExposure` receipt'iyle ölçülür. Sonuçlar ayrı
`RecommendationOutcome` receipt'leri olarak ve yalnız açık gerçekleşmiş olayla
(`HUMAN_ACTION`, `LEAD_CREATED`, `QUOTE_REQUESTED`, `WON_SHIPMENT`,
`GROSS_PROFIT`) kaydedilir. Aynı exposure/outcome anahtarı idempotenttir; farklı
payload conflict'tir. Skor, job veya state değişiminden outcome çıkarılmaz.

WHY: Ekli araştırmalar AI kullanımının ve recommendation maruziyetinin ticari
sonuçla birlikte ölçülmesi gerektiğini destekliyor; korelasyonel ve alan dışı
bulgular ise doğrudan kural sayılmıyor. Exposure lineage olmadan model/algoritma
değişikliğinin etkisi, yoğunlaşma veya keşif oranı denetlenemez.

ALTERNATIVES: Yalnız son skor/state tutmak; outcome'u skor veya job tamamlanınca
varsaymak; hemen otomatik 90/10 exploration veya bandit seçimi açmak.

CONSEQUENCES: Measurement API'si private ve create-only receipt yoludur; dış
network/provider/customer action yapmaz. İlk fazda `mode` saklanır fakat
exploration seçimi otomatik değildir. V2 deneyinde exposure coverage,
exploration/exploitation ve funnel sonuçları raporlanabilir; yaşam döngüsü ve
provider challenger kararları ayrı issue'larda ele alınır.

STATUS: ACCEPTED FOR SAFE MEASUREMENT ONLY

---

## ADR-029 — Structured Outcome Provenance Without Automatic Linking

DECISION: `RecommendationOutcome` opsiyonel ve birlikte zorunlu
`sourceType/sourceId` alanlarıyla açık provenance taşıyabilir. Kaynak türleri
`CRM_LEAD`, `CRM_OPPORTUNITY`, `CRM_EVENT`, `HUMAN_NOTE` ve
`OPERATIONS_RECORD` ile sınırlıdır. Alanlar outcome idempotency/conflict
karşılaştırmasına dahildir; ancak bu faz sourceId'nin gerçekten var olan CRM
kaydı olduğunu otomatik doğrulamaz ve kayıt oluşturmaz.

WHY: Exposure → outcome ölçümü, olayın hangi insan/operasyon kaynağına dayandığını
göstermeden eksik kalır. Buna rağmen otomatik entity-link veya lead/teklif
oluşturmak yanlış attribution ve blast-radius üretir.

ALTERNATIVES: Serbest sourceRef ile devam etmek; sourceId'yi otomatik aramak;
outcome alınca yeni CRM kaydı yaratmak.

CONSEQUENCES: Receipt'ler daha sonra provenance denetimine hazırdır; gerçek
CRM/operasyon doğrulaması ayrı, insan onaylı adapter ve yetki dilimidir. Dış
network/provider/customer action bu kararla açılmaz.

STATUS: ACCEPTED FOR EXPLICIT RECEIPTS ONLY

---

## ADR-030 — Human-Approved Recommendation Outcome Provenance

DECISION: CRM kaynaklı bir `RecommendationOutcome` için provenance eşleştirmesi
ayrı ve immutable bir review receipt'iyle onaylanır. Receipt yalnız
`CRM_LEAD`, `CRM_OPPORTUNITY` veya `CRM_EVENT` kaynaklarını kabul eder; kaynak
ID'si review anında yerel veritabanında yeniden doğrulanır. Reviewer,
`recordedBy` aktöründen farklı olmak zorundadır ve `APPROVED` veya `REJECTED`
kararı, gerekçe ve zaman damgasıyla saklanır. Aynı outcome için tek review
receipt'i vardır; aynı payload tekrarında idempotent reuse, farklı payload'da
409 conflict döner.

WHY: Source existence tek başına insanın attribution kararını kanıtlamaz.
İnsan onayını outcome kaydını overwrite etmeden ayrı receipt olarak tutmak,
yanlış eşleştirmeyi ve sonradan sessiz değişikliği denetlenebilir kılar.

ALTERNATIVES: Outcome satırını doğrudan APPROVED yapmak; reviewer bilgisini
serbest metadata'ya yazmak; aynı outcome için birden çok çelişkili review'a izin
vermek; CRM kaydı yoksa otomatik oluşturmak veya dış sisteme sormak.

CONSEQUENCES: Bu dilim yalnız private review API'si ve yerel receipt yazımıdır.
`HUMAN_NOTE`/`OPERATIONS_RECORD` metadata olarak kalır; provider OAuth, dış CRM
lookup'u, entity-link, yeni kayıt, e-posta/telefon veya sosyal medya aksiyonu
başlatılmaz. Review reddi ölçüm receipt'ini silmez ve ticari başarı sayılmaz.

STATUS: PROPOSED — IMPLEMENTATION IN NEXT CONTROLLED SLICE

---

## ADR-031 — Provenance Review Quality Metrics

DECISION: Management reports keep the existing raw recommendation outcome
counts unchanged and add separate provenance-quality metrics. Review receipts
are counted by `reviewedAt` in the report window, with `APPROVED` and `REJECTED`
breakdowns. CRM outcomes are counted by `occurredAt` into approved, rejected,
or `WITHOUT_REVIEW` buckets. `HUMAN_NOTE` and `OPERATIONS_RECORD` are excluded
from CRM provenance-quality buckets. No missing review is treated as approval.

WHY: A recorded CRM source and a human-approved attribution are different
claims. Separating their time windows and statuses prevents the funnel from
overstating qualified commercial evidence while preserving historical raw
receipt totals.

ALTERNATIVES: Count every CRM source as approved; overwrite raw outcome totals
with only approved records; classify late reviews by outcome date without
showing the review date; include metadata-only notes in CRM approval metrics.

CONSEQUENCES: Report snapshots expose review coverage and disagreement without
creating or changing CRM/outcome records. The new fields participate in the
existing snapshot input hash and idempotent reuse. This remains read-only
measurement; no provider, OAuth, customer contact, or automatic attribution
action is enabled.

STATUS: ACCEPTED FOR REPORTING ONLY — IMPLEMENTED IN PR #67
