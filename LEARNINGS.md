LEARNINGS — Teknik öğrenimler

Her önemli öğrenme kısa not olarak eklenmelidir:
- tarih: ISO
- konu: kısa başlık
- açıklama: ne öğrenildi, neden önemli — GERÇEKTEN YAŞANMIŞ bir olaya dayanmalı
- etkisi: gelecekte ne değişmeli

Bu dosya günlük sohbet özeti DEĞİLDİR. MASTER_PLAN.md'deki bir ilkeyi farklı
cümlelerle tekrar etmek "öğrenim" DEĞİLDİR — yalnızca yeniden kullanılabilecek,
somut bir olaydan (dosya/satır/hata çıktısı) çıkan kalıcı teknik bilgi yazılır.

ROTASYON KURALI (bkz. AGENTS.md): 15 girişi geçen dosya, en eski girişlerini
LEARNINGS_ARCHIVE.md'ye taşır.

================================================================
2026-08-13 TEMİZLİK NOTU (kendisi bir öğrenim)
================================================================

- tarih: 2026-08-13T22:00:00+03:00
- konu: plan ilkelerini "öğrenim" diye kopyalamak, dosyayı gürültüyle doldurur
- açıklama: Bağımsız bir mimari inceleme, bu dosyada MASTER_PLAN.md'nin 47
  ilkesinden ~13'ünün (LLM Last, confidence gating, idempotency, model-
  independent architecture, vb.) hiçbir gerçek olaya dayanmadan, aynı dakika
  içinde art arda "öğrenim" olarak kopyalandığını tespit etti. Bunlar
  silindi — zaten MASTER_PLAN.md ve DECISIONS.md'de kayıtlılar, burada
  tekrarlanmalarına gerek yok.
- etkisi: Bundan sonra bir "öğrenim" yazılırken şu soru sorulmalı: "Bu,
  MASTER_PLAN'da zaten yazan bir ilkenin tekrarı mı, yoksa gerçekten bir
  hata/sürpriz/olaydan mı çıktı?" İkincisi değilse buraya yazılmaz.

================================================================

- tarih: 2026-08-13T15:00:00+03:00
- konu: monorepo-typecheck
- açıklama: root tsc çağrısı tüm paketleri root config ile kontrol edip JSX
  hatalarına sebep oldu; paket seviyesinde tsc -p kullanmak daha güvenli.
- etkisi: root typecheck script paketleri ayrı ayrı çağıracak şekilde düzenlendi.

- tarih: 2026-08-13T20:15:00+03:00
- konu: OneDrive içinde git repo
- açıklama: Proje klasörü OneDrive senkronizasyonu altında (`OneDrive\Masaüstü\`);
  bu oturumda dizin listelemede geçici tutarsızlıklar gözlendi (muhtemelen
  Files On-Demand/senkron gecikmesi).
- etkisi: node_modules zaten .gitignore'da; proje klasörünün OneDrive
  senkronizasyonu dışına (örn. C:\dev\...) taşınması önerilir — bu kullanıcı
  kararı gerektirir, otomatik yapılmadı (bkz. TASKS.md → infra-onedrive-relocation).

- tarih: 2026-08-13T20:26:00+03:00
- konu: vitest watch-mode varsayılanı
- açıklama: Vitest, `CI` ortam değişkeni set değilse varsayılan olarak watch
  modunda çalışır ve asla bitmez.
- etkisi: `test` script'i her zaman açıkça `vitest run` olmalı; interaktif
  izleme için ayrı bir `test:watch` script'i tanımlanmalı.

- tarih: 2026-08-13T20:28:00+03:00
- konu: pnpm workspace filter söz dizimi
- açıklama: pnpm `--filter` içinde düz `apps/*` bir PAKET ADI deseni olarak
  yorumlanır, klasör yolu olarak değil. `--filter "./apps/*"` (başında `./`
  ile) gerekir. Yanlış kullanım, `-w` bayrağıyla birleştiğinde workspace kök
  script'inin kendini yeniden tetiklemesine yol açabilir.
- etkisi: Tüm çoklu-paket pnpm script'lerinde yol tabanlı filtrelerde her
  zaman `./` öneki kullanılacak.

- tarih: 2026-08-13T20:58:00+03:00
- konu: "yerelde geçti" CI'da geçti anlamına gelmez
- açıklama: Kök dizine `vitest.config.ts` eklendikten sonra yalnızca `pnpm
  test` yeniden çalıştırıldı, `pnpm lint` tekrar çalıştırılmadı. ESLint'in
  tip-farkında linting'i yeni dosyanın hiçbir tsconfig `include`'unda
  olmadığını GitHub Actions'ta ilk gerçek CI çalışmasında yakaladı.
- etkisi: Bir dosya eklendiğinde/değiştiğinde SADECE ilgili görüneni değil,
  dört komutun (lint/typecheck/test/build) TAMAMI yeniden çalıştırılmalı.

- tarih: 2026-08-13T21:05:00+03:00
- konu: Prisma 7 — driver adapter zorunluluğu
- açıklama: Prisma 7, `schema.prisma` içindeki `datasource.url`'ü kaldırdı.
  Migrate/CLI artık `prisma.config.ts`'den URL okuyor; `PrismaClient` çalışma
  zamanında bir driver adapter (`@prisma/adapter-pg` + `pg`) ile kurulmak
  zorunda.
- etkisi: Major sürüm yükseltmelerinde `prisma generate`/`validate` gerçekten
  çalıştırılıp hata mesajları okunmalı; dokümantasyona/eski örneklere
  güvenilmemeli.

- tarih: 2026-08-13T21:05:00+03:00
- konu: pnpm monorepo'da CLI araçları için phantom dependency riski
- açıklama: `@prisma/client` yalnızca `apps/api/package.json`'da tanımlıyken,
  proje KÖKÜNDEN çalıştırılan `prisma generate` onu çözemedi — pnpm'in izole
  node_modules yapısı, bir paketin bağımlılığını başka bir workspace
  paketinin görmesine izin vermez.
- etkisi: Bir CLI aracı belirli bir workspace dizininden çalıştırılacaksa, o
  dizinin kendi package.json'ının ilgili paketi içerdiğinden emin olunmalı.

- tarih: 2026-08-13T21:20:00+03:00
- konu: CI'da entegrasyon testleri için gerçek DB servisi gerekir
- açıklama: Prisma modelleri arası ilişkileri, unique constraint'leri ve
  gerçek veri yazma/okumayı test etmek için CI'ın da gerçek bir Postgres'e
  erişimi olmalı (`jobs.<job>.services` + `prisma migrate deploy`).
- etkisi: Gelecekteki fazlarda yeni bir dış bağımlılık (Redis, vb.) gerçek
  entegrasyon testi gerektirirse aynı desen izlenmeli.

- tarih: 2026-08-13T22:00:00+03:00
- konu: CI as judge
- açıklama: Bir görevin "bitti" sayılması için CI'ın (lint/typecheck/test/
  build PASS) nesnel sonucu esas alınır — ama bunun için CI'ın GERÇEKTEN
  GitHub'da çalışmış olması gerekir. Bu projede `.github/workflows/ci.yml`
  birden fazla kez push edilemedi (OAuth workflow-scope kısıtlaması) ve bu
  sürede yapılan değişiklikler hiçbir zaman gerçek CI'da doğrulanmadı,
  yalnızca lokalde "PASS" denildi.
- etkisi: "CI PASS" iddiası, GitHub Actions run linkiyle (ve gerçek
  conclusion: success ile) desteklenmeden kanıt sayılmaz; yalnızca lokal
  çalıştırma yeterli değildir.
