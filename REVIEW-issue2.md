REVIEW PAKETİ — Issue #2 (Phase 1: Data Foundation)

Bu belge, Issue #2'nin kod tarafını Köksal'ın (ya da gerçekten devreye giren
bir başka reviewer'ın) onayına sunmak için hazırlanmıştır. Claude Code bu
paketteki hiçbir maddeyi kendi kendine APPROVE edemez — bkz. AGENTS.md.

================================================================
1. NE DEĞİŞTİ (schema diff özeti)
================================================================

Dosya: prisma/schema.prisma
Migration: prisma/migrations/20260813181338_init_data_foundation/

Eklenen modeller: Company, Contact, Lead, Activity, FollowUp, Opportunity,
Evidence, Event.
Eklenen enum'lar: CompanyStatus, SourceChannel, ContactVerificationStatus,
LeadStatus, ActivityType, FollowUpStatus, OpportunityStage, EventType.

Tasarım kararları:
- Source/Channel ayrı tablo değil, Company/Contact/Lead üzerinde
  `SourceChannel` enum alanı (overengineering'den kaçınmak için).
- Event: `entityType`/`entityId` ile hafif, polimorfik (DB FK'sız) audit log
  — devasa event-sourcing framework değil.
- Company.mergedIntoId self-relation: duplicate → silme değil, MERGED durumu
  + kanonik kayda pointer.
- Cascade kuralları: zorunlu company/lead bağları RESTRICT, opsiyonel bağlar
  SET NULL (migration.sql'de doğrulanabilir, DROP/DELETE/TRUNCATE yok).

Kod: apps/api/src/lib/entity-resolution.ts — deterministik normalizasyon
(company name, domain, tax number, email, phone) + öncelik sıralı
`findDuplicateCompany` (tax number → domain → phone → email domain →
address → normalized name → similarity → [AI, implement edilmedi]).

Testler: apps/api/test/entity-resolution.test.ts (22, DB gerektirmez),
apps/api/test/prisma-models.test.ts (8, gerçek Postgres'e karşı — unique
constraint, ilişkiler, Evidence/Event, self-merge). 31/31 lokalde PASS.

================================================================
2. AÇIK NOKTALAR — KARAR BEKLİYOR (A-I)
================================================================

A) Company.domain global UNIQUE doğru mu?
   Aynı domaini paylaşan birden fazla tüzel şirket (holding/franchise/aynı
   kurumsal web sitesi) senaryosunda kırılır. KARAR GEREKİYOR: global unique
   mi kalsın, yoksa unique kaldırılıp yalnızca entity-resolution sinyali mi
   olsun?

B) findDuplicateCompany'nin dönüşü otomatik-duplicate mi, review-gerekli mi?
   Şu an fonksiyon tek bir sonuç (reason + confidence) döndürüyor ama
   "otomatik birleştir" ile "insana sor" arasında hiçbir ayrım yok. DAHA
   KRİTİK BULGU (bağımsız inceleme): bu fonksiyon şu an HİÇBİR API
   route'undan çağrılmıyor — ölü kod, production'da hiç çalışmadı, gerçek
   veriyle hiç sınanmadı. KARAR GEREKİYOR: Faz 2'de bir tüketici (route/
   worker) yazılırken sadece TAX_NUMBER/DOMAIN gibi güçlü sinyaller otomatik
   birleştirsin, PHONE/EMAIL_DOMAIN/ADDRESS/SIMILARITY "REVIEW_REQUIRED"
   olarak mı işaretlensin?

C) normalizeTaxNumber yalnızca rakam kabul ediyor.
   Uluslararası şirket desteklenecekse (UK Company House, AB VAT gibi harf+
   rakam karışık ID'ler) yetersiz. KARAR GEREKİYOR: Growth'un yakın vadeli
   hedefi yalnızca Türkiye B2B mi (o zaman bilinçli erteleme, MASTER_PLAN'ın
   "overengineering yasak" ilkesiyle tutarlı), yoksa şimdiden country-aware
   tasarım mı gerekiyor?

D) 0.95 / 0.85 / 0.70 / 0.65 gibi confidence değerleri kalibre edilmiş
   olasılık değil, elle seçilmiş heuristic ağırlıklar. Hiçbir gerçek veri
   kümesine karşı doğrulanmadı. KARAR GEREKİYOR: alan adı/dokümantasyon
   "confidence" yerine "matchScore" gibi daha doğru bir isim almalı mı?

E) currency: String @default("TRY") — şemanın geri kalanı enum-ağırlıklı,
   bu tutarsız görünüyor. KÖKSAL'IN İTİRAZI (kabul edildi): enum her yeni
   para birimi için migration ister; ISO-4217 kodları geniş/stabil bir
   standart, uygulama seviyesinde (zod) doğrulanması enum'dan daha doğru.
   KARAR: String + zod ISO-4217 validation'ı Faz 2/3'te eklenecek, enum'a
   ÇEVRİLMEYECEK.

F) (bağımsız inceleme, SONRADAN DÜZELTİLDİ — bkz. not) LEGAL_ENTITY_STOPWORDS
   içindeki "HOLDING" riskli. İlk taslakta yanlış bir örnek verilmişti
   ("Köseoğlu Lojistik" vs "Köseoğlu Holding" — bu ikisi normalize edilince
   AYNI DEĞİL: "KOSEOGLU LOJISTIK" vs "KOSEOGLU", similarity 0.47, eşiğin
   çok altında; PR'ı bağımsız denetleyen ikinci bir ajan bunu koda karşı
   çalıştırıp yakaladı). DOĞRU VE DOĞRULANMIŞ ÖRNEK: "Köseoğlu Lojistik
   Holding" (örn. Köseoğlu Lojistik'in üzerindeki bir holding şirketi —
   gerçekçi bir Türk kurumsal yapı) normalize edilince "Holding" stopword
   olarak silinip TAM OLARAK "KOSEOGLU LOJISTIK" — yani "Köseoğlu
   Lojistik"in kendisiyle birebir aynı — sonucunu veriyor
   (`normalizeCompanyName` ile bizzat test edildi). Bu, NORMALIZED_NAME
   adımında (confidence 0.65) gerçek, doğrulanmış bir yanlış-eşleşme
   riskidir: bir holding ile onun altındaki operasyonel şirket otomatik
   olarak "aynı şirket" sayılabilir. KARAR GEREKİYOR: "HOLDING" (ve benzer
   şirket-yapısı belirten kelimeler) stopword listesinden çıkarılmalı mı,
   yoksa bu tür kelimeler stopword yerine ayrı bir "şirket yapısı" sinyaline
   mi dönüştürülmeli?
   NOT: Bu maddenin ilk hali, review sürecinin kendisinin de "iddia değil,
   kod üzerinde doğrulanmış kayıt" ilkesine tam uymadığı bir örnekti —
   bağımsız denetim tam bunun için var ve işe yaradı.

G) (bağımsız inceleme) Activity/FollowUp'ın "en az leadId veya contactId
   olmalı" kuralı yalnızca şema yorumunda var, hiçbir yerde (route/servis
   katmanı henüz yok) uygulanmıyor. DB şu an ikisi de null olan kayıtları
   sessizce kabul eder. KARAR: Faz 2'de ilk consumer yazılırken zod
   validation'a eklenecek.

H) (bağımsız inceleme) Company self-merge'de döngü koruması yok (A→B→A
   zinciri). Test edilmemiş.

I) (bağımsız inceleme) Confidence Gate henüz yokken Company.confidence ve
   Evidence.confidence alanlarının Faz 1'de eklenmesi — MASTER_PLAN'ın
   "overengineering yasak" ilkesiyle gerilimli. Savunması: Faz 2'nin
   yazacağı alanın şemada önceden var olması gerekiyordu. KARAR: bilinçli
   kabul edildi olarak mı işaretlensin?

================================================================
3. BİLİNEN, ÇÖZÜLMEMİŞ SÜREÇ AÇIKLARI (kod değil, gerçeklerin özeti)
================================================================

- `.github/workflows/ci.yml` şu an GitHub'da eski (Postgres servisiz)
  halde çalışıyor; bu PR'daki güncellenmiş hali (Postgres servisi +
  migrate deploy) push edilemiyor (OAuth workflow-scope kısıtlaması,
  ERRORS.md → github-push-workflow-scope-eksik). Yani **Faz 1'in
  entegrasyon testleri gerçek CI'da HİÇ doğrulanmadı**, yalnızca lokalde.
- GitHub Issues gerçek olarak açık değil (gh CLI yok).
- "5 ajanlı review" süreci fiilen hiç işlemedi — bu PR, bunu düzeltmeye
  yönelik ilk adım (branch+PR, main'e doğrudan push yok).

================================================================
4. DESTEKLEYICI KANIT — 3 BAĞIMSIZ AJAN İNCELEMESİ (2026-08-13)
================================================================

Üç ayrı ajan, birbirinin sonucunu görmeden, bu repoyu bağımsız olarak
inceledi. Ortak doğruladıkları: multi-agent sürecinin fiilen işlemediği,
CI'ın şu an güvenilir bir kapı olmadığı, ERRORS.md'deki düzeltmelerin çoğu
oturumluk olduğu. Tam raporlar bu konuşma geçmişinde mevcuttur; F-I
maddeleri bu incelemelerden süzülmüştür.

================================================================
5. ONAY
================================================================

Bu paket APPROVED / CHANGES REQUESTED olarak işaretlenmeden Issue #2 DONE
sayılmaz. Onay Köksal'a (veya nominal bir bağımsız reviewer'a) aittir.
