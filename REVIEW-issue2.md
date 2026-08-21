REVIEW PAKETİ — Issue #2 (Phase 1: Data Foundation)

Bu belge, Issue #2'nin kod tarafını Köksal'ın (ya da gerçekten devreye giren
bir başka reviewer'ın) onayına sunmak için hazırlanmıştır. Claude Code bu
paketteki hiçbir maddeyi kendi kendine APPROVE edemez — bkz. AGENTS.md.

================================================================
1. NE DEĞİŞTİ (schema diff özeti)
================================================================

Dosya: prisma/schema.prisma
Migration'lar:
- prisma/migrations/20260813181338_init_data_foundation/ (Company, Contact,
  Lead, Activity, FollowUp, Opportunity, Evidence, Event — ilk kurulum)
- prisma/migrations/20260813185529_company_domain_not_globally_unique/
  (madde A'nın düzeltmesi — yalnızca DROP INDEX + CREATE INDEX, veri kaybı
  yok; MEVCUT/dolu bir DB üzerine uygulanarak gerçek "upgrade path" testi
  de yapıldı, bkz. AGENTS.md → Migration DoD)

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
- Company.domain artık global UNIQUE DEĞİL (madde A, aşağıda RESOLVED).

Kod: apps/api/src/lib/entity-resolution.ts — deterministik normalizasyon
(company name, domain, tax number, email, phone) + öncelik sıralı
`findDuplicateCompany` (tax number → domain → phone → email domain →
address → normalized name → similarity → [AI, implement edilmedi]).
Artık her sonuç bir `matchScore` (madde D) ve `recommendedAction`
(AUTO_MERGE_CANDIDATE yalnızca TAX_NUMBER için; madde B) döndürüyor.

Testler: apps/api/test/entity-resolution.test.ts (24, DB gerektirmez),
apps/api/test/prisma-models.test.ts (8, gerçek Postgres'e karşı — unique
constraint, ilişkiler, Evidence/Event, self-merge, domain paylaşım senaryosu).
33/33 lokalde PASS.

================================================================
2. AÇIK NOKTALAR (A-I) — DURUM
================================================================

A) Company.domain global UNIQUE doğru mu? — **RESOLVED (kod düzeltildi)**
   `@@unique([domain])` kaldırıldı, `@@index([domain])` ile değiştirildi.
   Yeni migration (yukarıda) mevcut DB'ye uygulanıp doğrulandı. Yeni test:
   "allows two distinct companies to share one domain". Domain artık DB
   kısıtı değil, yalnızca entity-resolution sinyali.

B) findDuplicateCompany otomatik mi, review-gerekli mi? — **RESOLVED (kod
   düzeltildi)**
   `CompanyMatchResult`'a `recommendedAction: 'AUTO_MERGE_CANDIDATE' |
   'REVIEW_REQUIRED'` eklendi. Politika: yalnızca TAX_NUMBER eşleşmesi
   AUTO_MERGE_CANDIDATE (o da otomatik yazma izni değil, yalnızca öneri —
   şu an hiçbir kod otomatik merge yapmıyor). Diğer tüm sinyaller
   (DOMAIN dahil, artık DB-unique bile değil) REVIEW_REQUIRED. Ölü kod
   durumu (hiçbir route'tan çağrılmıyor) DEVAM EDİYOR — Faz 2'nin ilk
   gerçek consumer'ı yazılana kadar bu politika test edilmiş ama
   production'da hiç çalışmamış olacak.

C) normalizeTaxNumber yalnızca rakam kabul ediyor. — **ESCALATED (Köksal'a)**
   Kod değiştirilmedi. Bu, Growth'un yakın vadeli iş kapsamı sorusu
   (yalnızca Türkiye B2B mi, uluslararası mı) — mühendislik kararı değil.
   VARSAYILAN ÖNERİ: bilinçli erteleme (Türkiye-only), MASTER_PLAN'ın
   "overengineering yasak" ilkesiyle tutarlı. Köksal aksini söylemezse bu
   varsayılan geçerli sayılacak.

D) confidence isimlendirmesi yanıltıcı. — **RESOLVED (kod düzeltildi)**
   `CompanyMatchResult.confidence` → `matchScore` olarak yeniden adlandırıldı,
   JSDoc'a "kalibre edilmiş olasılık değil, heuristic skor" notu eklendi.
   NOT: Company.confidence / Evidence.confidence (şema alanları) farklı bir
   kavram (veri kalitesi güveni) — onlara dokunulmadı, bkz. madde I.

E) currency enum olmalı mı? — **ACCEPTED (Köksal'ın itirazı kabul edildi)**
   String + ileride zod ISO-4217 validation. Enum'a çevrilmeyecek.

F) LEGAL_ENTITY_STOPWORDS'teki "HOLDING". — **RESOLVED (kod düzeltildi,
   düzeltme sürecinde kendi hatası da düzeltildi)**
   İlk taslaktaki örnek yanlıştı (bağımsız PR denetimi yakaladı, bkz. not).
   Doğru/doğrulanmış (ve kurgusal — Köseoğlu Lojistik'in gerçek yapısıyla
   ilgili bir iddia DEĞİL) örnekle: "X Lojistik Holding" eskiden "X
   Lojistik" ile birebir aynı normalize oluyordu. "HOLDING" stopword
   listesinden çıkarıldı. Yeni regresyon testi (kurgusal isimlerle)
   eklendi.
   NOT: Bu maddenin ilk hali, tam da düzeltmeye çalıştığı "doğrulanmamış
   iddia" hatasının küçük bir tekrarıydı — taze bir ajanla yapılan bağımsız
   PR denetimi bunu koda karşı çalıştırıp yakaladı ve doğru örneği verdi.

G) Activity/FollowUp "en az biri" kuralı uygulanmıyor. — **ACCEPTED (bilinçli
   erteleme)**
   Şu an hiçbir route/servis bu tabloları yazmıyor, dolayısıyla canlı bir
   risk yok. Faz 2'de ilk consumer yazılırken zod validation'a eklenecek —
   bu PR'da schema/kod değişikliği YOK, yalnızca kayıt.

H) Self-merge döngü koruması yok. — **ACCEPTED (bilinçli erteleme)**
   Merge işlemini gerçekten yapan bir servis henüz yok (yalnızca şema
   ilişkisi var). Döngü koruması, o servis yazılırken (Faz 2+) eklenecek.

I) Company.confidence / Evidence.confidence'ın Faz 1'de erken eklenmesi.
   — **ACCEPTED (bilinçli trade-off)**
   Faz 2'nin yazacağı alanların şemada önceden var olması gerekiyordu;
   nullable-with-default olduğu için maliyeti düşük. Değiştirilmedi.

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
