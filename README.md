# Köseoğlu Growth

7/24 çalışan Sales Intelligence + Customer Discovery + Marketing Automation +
Learning + Reporting sistemi. Köseoğlu Lojistik için geliştirilir.

**North Star:** Kârlı yeni müşteri + net kâr.

## Growth nedir?

Yeni müşteri bulur, araştırır (company discovery, verification, evidence-backed),
satış ve pazarlama içeriği üretir (outreach draft, nurturing, social/SEO), ve
yönetime rapor sunar (08:00 TR raporu, cost/attribution observability).

## Growth ne değildir?

Growth, kazanılmış operasyonu yürüten bir sistem değildir. Sevkiyat, filo,
operasyonel iş takibi Growth'un kapsamı dışındadır.

## MYLojistik ayrımı

Köseoğlu Growth ve MYLojistik ayrı kod tabanı, ayrı veritabanı, ayrı runtime
olarak geliştirilir ve çalıştırılır. Birbirine gömülmez. Gelecekte yalnızca
kontrollü bir API üzerinden gerekli veri paylaşılabilir. Detay: [DECISIONS.md](DECISIONS.md#adr-001--growth--mylojistik-ayrımı).

## Architecture overview

- Modüler monolith, önce çalışan sade çekirdek.
- `apps/api` — Fastify + TypeScript backend.
- `apps/web` — React + Vite frontend.
- `prisma/` — PostgreSQL şema ve migration'lar.
- `docker/` — yerel geliştirme için Postgres.
- Mimari ilkeler (LLM Last, deterministic-first, evidence/confidence gate,
  model-independent AI routing, vb.) için [MASTER_PLAN.md](MASTER_PLAN.md) ve
  [DECISIONS.md](DECISIONS.md).

## Current phase

**PHASE 0 — Foundation.** Güncel operasyonel durum için [STATUS.md](STATUS.md).
Tam roadmap için [MASTER_PLAN.md](MASTER_PLAN.md).

## Local development

```
pnpm install
docker compose -f docker/docker-compose.yml up -d
pnpm --filter @growth/api dev
pnpm --filter @growth/web dev
```

`.env.example` dosyasını `.env` olarak kopyalayın; gerçek secret'lar asla
commit edilmez.

## Quality commands

```
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Bu dört komut GitHub Actions CI'da da çalışır ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

## GitHub workflow

GitHub (Issues, branch, commit, PR, CI) tek doğruluk kaynağıdır. Ajan/geliştirici
kuralları için [AGENTS.md](AGENTS.md), görev kuyruğu için [TASKS.md](TASKS.md).
