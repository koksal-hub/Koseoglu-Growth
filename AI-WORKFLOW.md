AI-WORKFLOW — Maliyet-Etkin Çoklu-Ajan Geliştirme Yöntemi

Bu dosya proje-bağımsızdır. Köseoğlu Growth'ta bugün gerçekten yaşanan
olaylardan çıkarıldı, ama diğer projelere olduğu gibi kopyalanabilir. Amaç:
en az AI harcamasıyla en yüksek kod kalitesini elde etmek.

================================================================
0. TEK CÜMLEYLE ÖZET
================================================================

5 hayali rol (Codex/Copilot/Gemini/Qwen) kurup hiçbirini çalıştırmamaktansa,
2 gerçek rolü (Uygulayıcı + Taze-Bağlamlı Denetçi) her seferinde gerçekten
çalıştırmak hem daha ucuz hem daha etkilidir. Bugünün kanıtı: aynı "marka"
ajanın taze bir kopyası, orijinal ajanın kendi hatasını (yanlış bir teknik
iddia, REVIEW-issue2.md madde F) gerçek kodu çalıştırarak yakaladı — farklı
bir AI şirketinin ürününe ihtiyaç yoktu, sadece bağlamsız/taraf tutmayan bir
ikinci bakışa ihtiyaç vardı.

================================================================
1. ROLLER (3'ten fazlası nadiren gerekir)
================================================================

**PLANCI**
- Büyük hedefi, her biri bağımsız test edilebilir KÜÇÜK biletlere böler.
- Her bilet net "acceptance criteria" içerir (bkz. TASKS.md formatı).
- Kötü/geniş bir plan, uygulayıcının token'ını (=para) sonradan boşa
  harcatır — planlamaya harcanan ekstra dakika, uygulamada saatler
  kurtarır.

**UYGULAYICI (Author)**
- Tek seferde TEK bilet üzerinde çalışır.
- Review istemeden ÖNCE kendi lokal kalite kapısını (lint/typecheck/test/
  build) çalıştırır. Bu, deterministik ve neredeyse ücretsizdir — AI
  review bütçesini, bir linter'ın bedavaya yakalayacağı hatalar için
  harcamak en büyük israf kalemidir.

**DENETÇİ (Reviewer) — taze bağlam, yazarlık payı yok**
- Farklı bir "marka" ajan OLMAK ZORUNDA DEĞİL. Aynı modelin taze bir
  session/subagent'ı yeterlidir — önemli olan, önceki konuşmayı GÖRMEMESİ
  ve kendi ürettiği bir şeyi savunma güdüsü olmamasıdır.
- Göreve: "iddiaları kabul etme, koda karşı çalıştır" talimatı verilir.
- Kanıt (bugünden): Bu projede taze bir denetçi, orijinal review paketindeki
  bir örneği (`"Köseoğlu Lojistik" vs "Köseoğlu Holding"`) bizzat kod
  çalıştırarak yanlış bulup düzeltti. Denetçi olmasaydı, yanlış bir örnek
  üzerinden bir mimari karar alınacaktı.

================================================================
2. NE ZAMAN TEK AJAN, NE ZAMAN ÇOKLU AJAN (maliyet kararı)
================================================================

TEK Uygulayıcı + TEK taze Denetçi yeterli:
- Rutin bilet/bugfix/küçük özellik.
- Dokümantasyon güncellemesi.
- Zaten CI'dan geçmiş, düşük riskli değişiklikler.

2-3 PARALEL bağımsız Denetçi kullan (daha pahalı, ama gerekçeli):
- Şema/mimari kararları (geri dönüşü pahalı).
- Güvenlik-hassas kod (auth, secret, ödeme, gerçek müşteri verisi).
- Faz/milestone sınırları (main'e merge öncesi).
- Bugünkü örnek: Growth'un Faz 1→Faz 2 geçişinde 3 paralel ajan
  kullanıldı, üçü de birbirini görmeden aynı kritik sorunları (CI'ın
  gerçekte hiç çalışmadığı, "multi-agent" sürecinin kurgu olduğu)
  bağımsız doğruladı — bu, TEK bir ajanın kendi kendine söyleyebileceği
  bir şey değildi.

Kural: Denetçi sayısını, hatanın maliyetine göre ölçekle. Bir README yazım
hatası 1 denetçi ister; production'a giden bir şema kararı 2-3 ister.

================================================================
3. MALİYETİ DÜŞÜREN 5 SOMUT KURAL
================================================================

1. **CI'yı ücretsiz denetçin olarak kullan.** Lint/typecheck/test/build,
   AI review'dan ÖNCE ve HER ZAMAN çalışmalı. AI'a "bu neden bozuk"
   sordurmak yerine, bozukluğu CI zaten bedavaya söylüyor.

2. **Aynı sorunu iki kez workaround'lamak yerine, ikinci seferde kök
   nedeni çöz.** Bugünkü somut örnek: GitHub'ın `workflow` scope
   kısıtlaması aynı gün içinde 5-6 kez aynı şekilde "aşıldı" (ci.yml'i
   untrack et, push et, kullanıcıya elle ekletttir). Her tekrar, gerçek
   ajan-turu (=para) harcadı. Bir PAT oluşturmak 5 dakikaydı; workaround'u
   5 kez tekrarlamak muhtemelen ondan çok daha pahalıya çıktı. KURAL: bir
   hata ikinci kez aynı şekilde tekrar ederse, üçüncü workaround'a
   geçmeden kalıcı çözümü uygula.

3. **Dokümanları küçük ve tek-amaçlı tut.** Her oturum başında ajan
   MASTER_PLAN/AGENTS/STATUS gibi dosyaları okur — şişmiş bir dosya, HER
   oturumda tekrar tekrar token harcatır. LEARNINGS.md'ye plan
   ilkelerini "öğrenim" diye kopyalamak (bugün 13 madde bu şekilde
   silindi) tipik bir örnektir: gerçek bilgi eklemeden dosyayı büyütüp
   her gelecek oturumun okuma maliyetini artırır.

4. **Görevi küçük tut, ajanın bağlamı yeniden türetmesini azalt.** Bir
   ajanın her seferinde tüm repoyu baştan taraması gerekiyorsa (çünkü bilet
   çok geniş/belirsiz), bu maliyeti planlama aşamasında önlemek, uygulama
   aşamasında telafi etmekten ucuzdur.

5. **Model gücünü karara göre eşleştir** (geri dönüşü kolay/zor prensibi):
   - Ucuz/hızlı: format düzeltme, boilerplate, basit bug fix, komut
     çalıştırıp çıktı yorumlama.
   - Pahalı/derin: mimari/şema kararları, güvenlik-hassas kod, Denetçi
     rolü (yüksek riskli değişikliklerde).
   Her göreve en pahalı modeli kullanmak, her göreve en ucuzunu kullanmak
   kadar maliyetsizdir görünse de aslında değildir — ucuz model yanlış bir
   mimari karar üretirse, o kararı SONRA pahalı bir modelle düzeltmek daha
   maliyetli olur.

================================================================
4. TEK SAYFALIK KONTROL LİSTESİ (diğer projelere kopyala)
================================================================

☐ Plancı, bileti net acceptance criteria ile küçük parçalara böldü mü?
☐ Uygulayıcı, review istemeden önce kendi lokal kalite kapısını geçti mi?
☐ Denetçi gerçekten TAZE bağlamda mı (önceki konuşmayı görmüyor mu)?
☐ Denetçiye "iddiaları koda karşı çalıştır" talimatı verildi mi?
☐ Şema/mimari/güvenlik kararı mı? → 2-3 paralel denetçiye çıkar.
☐ Rutin bilet mi? → 1 uygulayıcı + 1 denetçi yeterli, fazlası israf.
☐ Aynı hata ikinci kez mi tekrar ediyor? → workaround değil, kök neden.
☐ Doküman büyüyor mu? → rotasyon/arşiv kuralını uygula, şimdi.
☐ Branch + PR + (insan ya da taze ajan) onayı olmadan main'e merge YOK.

Bu kontrol listesi, bir sonraki projede AGENTS.md'nin başına yapıştırılıp
o projeye özgü detaylarla (roller, branch adları, DoD) doldurulabilir.
