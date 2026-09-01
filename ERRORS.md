ERRORS — Hata raporlama şablonu

Her yeni hata şu formatta eklenmeli:
- id: hata-kisa-id
- tarih: ISO timestamp
- yer: (dosya veya modül)
- kısa: bir cümlelik açıklama
- detay: tam hata çıktısı / stack / lint veya tsc çıktısı
- root_cause: kısa analiz
- düzeltme: yapılan veya önerilen düzeltme
- status: OPEN / IN_PROGRESS / FIXED / WONT_FIX

Yalnızca gerçekten yaşanan ve doğrulanmış önemli hatalar kaydedilir. Hayali hata
oluşturulmaz.

================================================================

- id: git-repo-yanlis-konumda
- tarih: 2026-08-13T20:11:00+03:00
- yer: repository kökü / .git
- kısa: `.git` proje kökü yerine yanlışlıkla iç içe `Koseoglu-Growth/Koseoglu-Growth/`
  klasöründe oluşturulmuştu; gerçek proje dosyaları hiçbir git deposunun parçası
  değildi.
- detay: Kökte `git status` → "fatal: not a git repository". Nested klasörde
  `git status` → "On branch main, No commits yet". `git remote -v` nested'da
  doğru şekilde `https://github.com/koksal-hub/Koseoglu-Growth.git` gösteriyordu.
- root_cause: Önceki bir oturumda `git init` (veya `git clone`) yanlış çalışma
  dizininde çalıştırılmış.
- düzeltme: `.git` proje köküne taşındı (`mv`), boş iç içe klasör silindi.
  `git status` artık kökte doğru şekilde çalışıyor.
- status: FIXED

---

- id: pnpm-path-erisilemiyor
- tarih: 2026-08-13T20:20:00+03:00
- yer: shell PATH (Bash/PowerShell tool ortamı)
- kısa: `node`/`pnpm` PATH üzerinden çözülemiyordu; `corepack enable` de
  `C:\Program Files\nodejs\pnpm` yazma izni olmadığı için EPERM ile başarısız
  oldu.
- detay: "node: command not found" (Bash ve PowerShell'de). `corepack enable` →
  "EPERM: operation not permitted, open 'C:\Program Files\nodejs\pnpm'".
- root_cause: Node.js `C:\Program Files\nodejs` altına kurulu ama bu dizin
  ajan shell oturumunun PATH'inde değildi; ayrıca bu dizin normal kullanıcı
  yazma iznine kapalı (admin gerektiriyor), bu yüzden corepack oraya shim
  yazamadı.
- düzeltme: PATH'e `/c/Program Files/nodejs` eklendi; `corepack enable
  --install-directory "$HOME/.corepack-shims"` ile pnpm/yarn shim'leri
  kullanıcı yazılabilir bir dizine kuruldu, PATH'e o dizin de eklendi.
- status: FIXED (bu ajan oturumu için). Kalıcı çözüm: Köksal'ın kendi
  makinesinde `C:\Program Files\nodejs`'in sistem PATH'inde olduğunu doğrulaması
  ve/veya pnpm'i kalıcı olarak kurması (örn. `corepack enable` yönetici
  olarak bir kere çalıştırılabilir).

---

- id: vitest-watch-modu-takiliyor
- tarih: 2026-08-13T20:26:00+03:00
- yer: package.json → "test" script
- kısa: `pnpm test` yerel ortamda (CI env değişkeni yokken) vitest'i watch
  modunda başlatıp hiç bitmiyordu; 180 saniyelik timeout'a takıldı.
- detay: Komut arka plana alındı, süresiz sürdü. Vitest varsayılan olarak
  `CI` ortam değişkeni yoksa watch modunda çalışır.
- root_cause: root `test` script'i `"vitest"` idi, `--run`/`run` alt komutu
  yoktu.
- düzeltme: `"test": "vitest run"` yapıldı, interaktif kullanım için ayrı
  `"test:watch": "vitest"` script'i eklendi.
- status: FIXED

---

- id: test-database-url-eksik
- tarih: 2026-08-13T20:27:00+03:00
- yer: apps/api/test/health.test.ts → apps/api/src/plugins/env.ts
- kısa: `pnpm test` çalıştırıldığında health testi, `DATABASE_URL` ortam
  değişkeni tanımlı olmadığı için "Environment validation failed" hatasıyla
  başarısız oluyordu.
- detay: "Missing or invalid environment variables: { DATABASE_URL: { _errors:
  [ 'Required' ] } }" → "Error: Environment validation failed" at
  apps/api/src/plugins/env.ts:17.
- root_cause: Test çalıştırması `.env` dosyasını yüklemiyor; proje kökünde
  test'e özel bir vitest config yoktu.
- düzeltme: Kök dizine `vitest.config.ts` eklendi, `test.env` içinde test
  amaçlı `DATABASE_URL` ve `NODE_ENV=test` tanımlandı.
- status: FIXED

---

- id: build-filter-hatali-ve-ozyinelemeli
- tarih: 2026-08-13T20:28:00+03:00
- yer: package.json → "build:all" script
- kısa: `pnpm build` çalıştırıldığında `--filter "apps/*"` (yol değil, paket adı
  deseni olarak yorumlandığı için) hiçbir paketi eşleştirmiyordu; `-w` bayrağıyla
  birleşince workspace kökünün kendi `build` script'i defalarca kendini
  tekrar çağırıp artan derinlikte "Command failed" zinciri üretti.
- detay: "No projects matched the filters "apps/*"" hatası onlarca kez artan
  girinti ile tekrarlandı, sonunda exit code 1 ile durdu.
- root_cause: pnpm'de yol tabanlı filtre için `./apps/*` (başında `./` ile)
  gerekiyor; düz `apps/*` paket adı deseni olarak yorumlanıyor ve eşleşme
  bulunamayınca `-w` bağlamında kök script'in kendini yeniden tetiklemesine
  yol açıyor.
- düzeltme: `"build": "pnpm run build:all"`, `"build:all": "pnpm --filter
  \"./apps/*\" run build"` olarak düzeltildi (gereksiz `-w` kaldırıldı, filtre
  yol söz dizimine çevrildi).
- status: FIXED

---

- id: docker-daemon-baslangicta-calismiyordu
- tarih: 2026-08-13T20:29:00+03:00 (ilk gözlem) → 20:30:00+03:00 (çözüldü)
- yer: Docker Desktop (Windows)
- kısa: `docker info` başlangıçta "failed to connect to the docker API at
  npipe:////./pipe/dockerDesktopLinuxEngine ... daemon is running" hatası
  veriyordu; Docker CLI kuruluydu ama arka plan (Linux engine) çalışmıyordu.
- detay: "failed to connect to the docker API at npipe:////./pipe/
  dockerDesktopLinuxEngine; check if the path is correct and if the daemon is
  running".
- root_cause: Docker Desktop uygulaması bu oturum başladığında açık değildi.
- düzeltme: `Docker Desktop.exe` başlatıldı, ~15 saniye içinde daemon hazır
  hale geldi; `docker compose -f docker/docker-compose.yml up -d` ile Postgres
  container'ı başarıyla ayağa kaldırıldı ve "healthy" duruma geçti.
- status: FIXED (bu oturum için). Kalıcı not: Docker Desktop'ın Windows
  başlangıcında otomatik açılması (Settings → General → "Start Docker Desktop
  when you sign in") önerilir; bu bir kullanıcı tercihi, otomatik değiştirilmedi.

---

- id: github-push-workflow-scope-eksik
- tarih: 2026-08-13T20:35:00+03:00
- yer: git push → .github/workflows/ci.yml
- kısa: `git push origin main`, kullanılan GitHub kimlik bilgisinin (Git
  Credential Manager üzerinden OAuth App) `workflow` scope'u olmadığı için
  `.github/workflows/ci.yml` dosyasını içeren commit'i reddetti.
- detay: "! [remote rejected] main -> main (refusing to allow an OAuth App to
  create or update workflow `.github/workflows/ci.yml` without `workflow`
  scope)". Credential cache temizlenip yeniden denendi, GitHub aynı OAuth App
  yetkisini (scope değişmeden) sessizce yeniden verdi. `curl -I -H
  "Authorization: token $TOKEN" https://api.github.com/user` ile doğrulandı:
  `X-OAuth-Scopes: gist, read:org, repo` (workflow yok).
- root_cause: GitHub, bir OAuth App'e önceden verilen scope setini hatırlar;
  yerel token cache'ini silmek GitHub sunucu tarafındaki app-level
  authorization'ı sıfırlamaz. `.github/workflows/*` altındaki DEĞİŞİKLİKLER
  (yeni dosya veya düzenleme fark etmeksizin) hem git push hem GitHub Contents
  API için `workflow` scope'u gerektirir.
- düzeltme: `.github/workflows/ci.yml` git takibinden çıkarıldı (`git rm
  --cached`), geri kalan Foundation işi push edildi. Köksal, dosyayı GitHub
  web arayüzü üzerinden (kendi oturum/cookie auth'u kullanır, bu scope
  kısıtlamasına tabi değildir) manuel ekleyecek.
- status: OPEN (workaround uygulandı, kalıcı çözüm — repo'ya yeni bir
  `workflow` scope'lu Personal Access Token veya OAuth App yetkisi eklemek —
  Köksal'ın kararına bağlı).

---

- id: ci-yml-pnpm-action-setup-yanlis-versiyon
- tarih: 2026-08-13T20:50:00+03:00
- yer: .github/workflows/ci.yml
- kısa: `pnpm/action-setup@v2` adımında `version: 20` verilmişti; bu alan
  pnpm sürümünü belirtir (Node sürümünü değil), ve pnpm'in 20.x diye bir
  sürümü yok. Ayrıca workflow'da hiç `actions/setup-node` adımı yoktu.
- detay: Workflow ubuntu-latest runner'ının önceden yüklü Node'una güveniyordu
  ve pnpm'i geçersiz bir sürüm numarasıyla kurmaya çalışıyordu — ilk adımda
  başarısız olurdu.
- root_cause: `version: 20` muhtemelen Node.js 20 kastedilerek yazılmış ama
  yanlış action'ın input'una konmuş.
- düzeltme: `pnpm/action-setup@v2` → `version: 11` (yerel pnpm 11.21.0 ile
  uyumlu), ayrı bir `actions/setup-node@v4` adımı eklendi (`node-version: 20`,
  `cache: pnpm`).
- status: FIXED. Köksal ci.yml'i GitHub web UI'dan ekledi (commit 4fe5e32),
  ardından Node sürümünü kendi başına 24'e güncelledi (commit c609b8b).

---

- id: eslint-vitest-config-tsconfig-disinda
- tarih: 2026-08-13T20:54:00+03:00 (CI'da ilk gözlem) → 20:58:00+03:00 (çözüldü)
- yer: tsconfig.base.json, vitest.config.ts
- kısa: Köksal'ın GitHub web UI'dan ci.yml'i eklemesinin ardından çalışan İLK
  gerçek GitHub Actions CI run'ı (hem 4fe5e32 hem c609b8b) `pnpm lint`
  adımında başarısız oldu.
- detay: "0:0 error Parsing error: "parserOptions.project" has been provided
  for @typescript-eslint/parser. The file was not found in any of the
  provided project(s): vitest.config.ts" → exit code 1.
- root_cause: Bu oturumun başında (test'i düzeltirken) kök dizine
  `vitest.config.ts` eklenmişti, ama `tsconfig.base.json`'ın `include`
  listesi yalnızca `apps/**/*`, `packages/**/*`, `prisma/**/*` idi — kök
  seviyesindeki `.ts` dosyalarını kapsamıyordu. ESLint'in
  `parserOptions.project` (tip-farkında linting) bu yüzden dosyayı
  reddediyordu. Bu, `vitest.config.ts` eklendikten sonra `pnpm lint`
  yeniden çalıştırılmadığı için yerel doğrulamada kaçmıştı (bkz.
  LEARNINGS.md).
- düzeltme: `tsconfig.base.json` → `include` listesine `"*.ts"` eklendi.
  Lokalde lint/typecheck/test/build tekrar PASS oldu (commit 2caacb6).
- status: FIXED — GitHub Actions'ta gerçek CI run'ı ile doğrulandı:
  https://github.com/koksal-hub/Koseoglu-Growth/actions/runs/31728265957
  (commit 2caacb6, conclusion: success).

---

- id: prisma7-datasource-url-kaldirildi
- tarih: 2026-08-13T21:05:00+03:00
- yer: prisma/schema.prisma
- kısa: Issue #2 kapsamında `prisma generate` çalıştırıldığında P1012 hatası:
  `datasource.url` artık schema dosyasında desteklenmiyor.
- detay: "error: The datasource property `url` is no longer supported in
  schema files. Move connection URLs for Migrate to `prisma.config.ts` and
  pass either `adapter` for a direct database connection or `accelerateUrl`
  for Accelerate to the `PrismaClient` constructor."
- root_cause: Root package.json'da `prisma: ^7.0.0` önceden belirlenmişti;
  Prisma 7, önceki sürümlerden farklı olarak connection URL'yi schema'dan
  ayırıp `prisma.config.ts`'e taşıdı ve client'ın çalışma zamanında bir
  driver adapter (`@prisma/adapter-pg` + `pg`) kullanmasını zorunlu kıldı.
- düzeltme: Kök dizine `prisma.config.ts` eklendi (`datasource.url =
  env('DATABASE_URL')`, migrate/CLI için). `apps/api/src/lib/prisma.ts`
  içinde `PrismaPg` adapter'ı ile `PrismaClient({ adapter })` kuruldu.
  `@prisma/adapter-pg` + `pg` + `@types/pg` apps/api'ye, `dotenv` +
  `@prisma/client` root'a eklendi (prisma.config.ts'in `env()` yardımcısı
  .env dosyasını otomatik yüklemiyor; root'tan `prisma generate/migrate`
  çalıştırılabilmesi için @prisma/client root node_modules'ta da gerekli
  — pnpm'in izole node_modules yapısı yüzünden).
- status: FIXED. `prisma validate`, `prisma generate`, `prisma migrate dev`,
  `prisma migrate deploy` hepsi lokalde gerçek Postgres'e karşı doğrulandı.

---

- id: apps-api-tsconfig-test-disinda
- tarih: 2026-08-13T21:18:00+03:00
- yer: apps/api/tsconfig.json
- kısa: `pnpm typecheck`, `apps/api/test/**` altındaki dosyaları hiç
  kapsamıyordu (`include: ["src/**/*"]`), bu yüzden test dosyalarındaki tip
  hataları typecheck adımından hiç geçmeden fark edilmeden kalabilirdi.
- detay: Bu, Issue #2 için ciddi miktarda yeni test kodu (entity-resolution
  + Prisma entegrasyon testleri) eklenirken fark edildi; health.test.ts'nin
  de baştan beri bu boşluğun dışında kaldığı görüldü (Phase 0'dan kalma,
  önceden fark edilmemiş).
- root_cause: `include: ["src/**/*"]`, hem build hem typecheck için aynı
  tsconfig.json tarafından paylaşılıyordu; test dosyalarını dahil etmek
  `rootDir: "src"` ile çakışacağı (build sırasında "File is not under
  rootDir" hatası) için kimse eklememiş.
- düzeltme: `apps/api/tsconfig.json` artık `src/**/*` VE `test/**/*`
  içeriyor, `rootDir`/`outDir` yok (yalnızca typecheck için). Yeni
  `apps/api/tsconfig.build.json`, bunu extend edip `rootDir: "src"`,
  `outDir: "dist"`, `include: ["src/**/*"]` ile SADECE build için kullanılıyor.
  `apps/api/package.json` → `"build": "tsc -p tsconfig.build.json"`.
- status: FIXED. `pnpm typecheck` artık test dosyalarını da kapsıyor,
  `pnpm build`'in `dist/` çıktısı hâlâ yalnızca `src/`'ten üretiliyor
  (doğrulandı: `dist/` içinde test dosyası yok).

---

- id: worktree-test-db-schema-drift
- tarih: 2026-09-01T01:12:00+03:00
- yer: vitest.config.ts, paralel Git worktree PostgreSQL kullanımı
- kısa: PR #5 bağımsız doğrulamasında testler ortak `growth_db` veritabanında
  43/44 oldu; `Company.domain` unique testi, ikinci kaydın kabul edilmesiyle
  başarısız oldu.
- root_cause: Farklı Git worktree'leri aynı yerel PostgreSQL veritabanını
  kullanıyordu. Başka bir branch'in repoda PR #5 ile birlikte bulunmayan
  `20260813185529_company_domain_not_globally_unique` migration'ı ortak
  `growth_db` üzerine daha önce uygulanmıştı. Vitest yapılandırması
  `DATABASE_URL`'yi sabit yazdığı için izole test DB seçimi dışarıdan
  yapılamıyordu. Böylece kaynak branch'in migration sözleşmesi ile çalışan
  DB şeması birbirinden ayrıldı.
- düzeltme: `vitest.config.ts`, `TEST_DATABASE_URL` verilirse onu kullanacak
  şekilde değiştirildi; fallback mevcut CI sözleşmesini koruyor. `.env.example`
  test DB ayrımını açıklıyor. Resolver için iki regresyon testi eklendi.
  PR #5 migrationları `growth_phase01_review_20260901` adlı izole yerel DB'ye
  sıfırdan uygulandı.
- status: FIXED LOCALLY. İzole DB üzerinde lint PASS, typecheck PASS,
  test PASS (46/46) ve build PASS. Kullanıcı 2026-09-01'de commit/push ve
  CI başarılıysa PR #5 merge işlemini onayladı; uzak CI/merge sonucu STATUS.md
  içinde ayrıca kaydedilecektir.

---

- id: pino-fastify-major-surum-uyusmazligi
- tarih: 2026-09-01T08:11:56+03:00
- yer: apps/api/package.json, apps/api/test/logger.test.ts
- kısa: Gerçek redaction testi eklenince typecheck, doğrudan `pino` v8 tipi ile
  Fastify logger sözleşmesinin kullandığı Pino v9 tipinin uyuşmadığını gösterdi.
- detay: `TS2345: FastifyLoggerOptions & PinoLoggerOptions is not assignable to
  LoggerOptions`; hata iki ayrı `pino@8.21.0` ve `pino@9.14.0` tip yolunu gösterdi.
- root_cause: API doğrudan `pino: ^8.17.0` bildirirken güncel Fastify bağımlılık
  ağacı Pino v9 tiplerini kullanıyordu. Böylece test logger'ı ile sunucu logger'ı
  aynı major sözleşmeyi paylaşmıyordu.
- düzeltme: Doğrudan bağımlılık `pino: ^9.14.0` olarak hizalandı ve kilit dosyası
  yenilendi. Gerçek JSON log çıktısı üzerinde dört hassas başlığın maskelenmesi
  regresyon testiyle doğrulandı.
- status: FIXED LOCALLY. lint/typecheck/test (56/56)/build PASS; GitHub CI bekleniyor.
