# Growth Authentication and Credential Handling

Bu belge mevcut repo davranışını açıklar. OIDC, JWT, kullanıcı oturumu veya canlı
provider OAuth akışı bu checkout'ta uygulanmış değildir.

## Mevcut sınır

API, `apps/api/src/index.ts` içindeki global `onRequest` hook ile korunur. Aşağıdaki
üç rota kimlik doğrulama istisnasıdır:

- `GET /api/health`
- `GET /api/ready`
- `POST /api/webhooks/resend`

Bunların dışındaki `/api/*` business rotaları, `GROWTH_INTERNAL_API_KEY` ayarlıysa
`x-api-key` başlığı ister. Bu anahtar uygulama kullanıcısı/rol sistemi değildir;
tek bir private/internal sınırdır.

## İstek akışı

1. Fastify isteğe bounded `x-request-id` verir veya UUID üretir.
2. CORS, Helmet ve rate-limit hook'ları çalışır.
3. Rota health/readiness/webhook istisnası değilse `createInternalAuthHook` çağrılır.
4. Anahtar yoksa `401`, yanlışsa `403` döner.
5. Doğru anahtar sabit-zamanlı byte karşılaştırmasıyla kabul edilir.
6. Hata merkezi error handler tarafından JSON hata zarfına çevrilir; response'a
   `x-request-id` eklenir.

`OPTIONS` istekleri CORS preflight için anahtar kontrolünden geçmez.

## Credential ve token davranışı

- Anahtar yalnızca process environment'tan (`GROWTH_INTERNAL_API_KEY`) okunur;
  veritabanına yazılmaz ve response'a döndürülmez.
- Production başlangıcında anahtar zorunludur; env şeması 32–256 karakterlik,
  credential-safe karakter kümesini uygular.
- `authorization`, `cookie`, `x-api-key`, `svix-signature` ve `set-cookie` loglarda
  merkezi redaction ile `[REDACTED]` olur.
- Prisma şemasında User/Role/Session veya access/refresh token modeli yoktur.
- `SocialConnection.secretManagerRef` yalnız gelecekteki secret-manager kaydı için
  opak bir referanstır; OAuth access/refresh token saklama alanı değildir.
- Resend test adapter'ı yalnız sentetik sandbox sözleşmesi içindir; gerçek müşteri
  adresi/içeriği veya canlı gönderim yetkisi vermez.

## Web istemcisi ve public kullanım

React istemcisinde login, session veya güvenli API-client token akışı yoktur. Bu
nedenle browser bundle'ına internal API key koymak güvenli değildir; mevcut business
API'leri private/local kalmalıdır.

Public veya multi-user deploy için ayrı bir tasarım ve onay gerekir: OIDC
Authorization Code + PKCE, kullanıcı/rol/capability modeli, session/cookie politikası,
secret rotation, audit ve authorization testleri. Bu karar verilmeden provider OAuth,
sosyal yayın, gerçek e-posta/telefon iletişimi veya müşteri kaydı başlatılmaz.

## Doğrulama referansları

- `apps/api/src/plugins/internal-auth.ts` — anahtar kontrolü ve timing-safe karşılaştırma
- `apps/api/src/plugins/env.ts` — production/env güvenlik kuralları
- `apps/api/src/index.ts` — global hook ve public istisnalar
- `apps/api/src/plugins/logger.ts` — hassas başlık redaction'ı
- `apps/api/test/internal-auth.test.ts` — missing/wrong/correct key ve OPTIONS regresyonları
