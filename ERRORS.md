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
- status: FIXED (lokalde düzeltildi; push, yukarıdaki workflow-scope engeli
  nedeniyle henüz yapılamadı — Köksal web UI'dan eklerken bu düzeltilmiş
  içeriği kullanmalı).
