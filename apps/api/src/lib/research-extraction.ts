import { extractEmailDomain as normalizeEmailDomain, normalizeDomain, normalizePhone } from './entity-resolution';

export const MAX_RESEARCH_CONTENT_LENGTH = 100_000;

export type ExtractedResearchSignals = {
  name: string;
  domain: string | null;
  website: string;
  sector: string | null;
  activity: string | null;
  country: string | null;
  city: string | null;
  phone: string | null;
  emailDomain: string | null;
  confidence: number;
  summary: string;
};

const SECTOR_RULES: Array<[string, RegExp]> = [
  ['Logistics and freight', /\b(logistics?|freight|cargo|transport(?:ation)?|nakliye|lojistik|ta[şs]ımac[ıi]l[ıi]k)\b/i],
  ['Manufacturing', /\b(manufactur(?:e|er|ing)|factory|production|üretim|imalat|sanayi)\b/i],
  ['Automotive', /\b(automotive|vehicle|car parts?|otomotiv|ara[çc]|yedek par[çc]a)\b/i],
  ['Food and agriculture', /\b(food|agricultur(?:e|al)|gıda|tar[ıi]m|hayvanc[ıi]l[ıi]k)\b/i],
  ['Textiles', /\b(textile|apparel|garment|tekstil|giyim|kuma[şs])\b/i],
  ['Construction', /\b(construction|building|infrastructure|in[şs]aat|yap[ıi]|altyap[ıi])\b/i],
  ['Technology', /\b(technology|software|saas|teknoloji|yaz[ıi]l[ıi]m|bili[şs]im)\b/i],
  ['Retail and wholesale', /\b(retail|wholesale|e-?commerce|perakende|toptan|e-?ticaret)\b/i],
  ['Energy', /\b(energy|renewable|solar|enerji|yenilenebilir|güne[şs])\b/i]
];

const COUNTRY_RULES: Array<[string, RegExp]> = [
  ['TR', /\b(turkey|türkiye|turkiye|istanbul|ankara|izmir|[ıi]zmir|bursa|kocaeli)\b/i],
  ['DE', /\b(germany|deutschland|hamburg|berlin|munich|münchen|frankfurt|köln|cologne)\b/i],
  ['NL', /\b(netherlands|holland|rotterdam|amsterdam)\b/i],
  ['GB', /\b(united kingdom|england|london|manchester|birmingham)\b/i],
  ['US', /\b(united states|usa|new york|chicago|los angeles)\b/i]
];

const CITY_NAMES: Array<[string, RegExp]> = [
  ['Istanbul', /\b(istanbul)\b/i],
  ['Ankara', /\b(ankara)\b/i],
  ['Izmir', /\b(izmir|[ıi]zmir)\b/i],
  ['Bursa', /\b(bursa)\b/i],
  ['Kocaeli', /\b(kocaeli|izmit)\b/i],
  ['Hamburg', /\b(hamburg)\b/i],
  ['Berlin', /\b(berlin)\b/i],
  ['Munich', /\b(munich|münchen)\b/i],
  ['Frankfurt', /\b(frankfurt)\b/i],
  ['Rotterdam', /\b(rotterdam)\b/i],
  ['Amsterdam', /\b(amsterdam)\b/i],
  ['London', /\b(london)\b/i]
];

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/** Convert HTML-like input to bounded plain text. It is never executed. */
export function sanitizeResearchContent(raw: string): string {
  const bounded = raw.slice(0, MAX_RESEARCH_CONTENT_LENGTH);
  return decodeBasicEntities(
    bounded
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function extractCompanyName(raw: string): string | null {
  const title = raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const heading = raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const first = title ?? heading;
  if (!first) return null;

  const cleaned = sanitizeResearchContent(first)
    .split(/\s*[|–—-]\s*/)[0]
    .replace(/\b(home|homepage|about us|about|contact|ana sayfa|hakkımızda|iletişim)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 2 && cleaned.length <= 200 ? cleaned : null;
}

function extractActivity(text: string): string | null {
  const sentence = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .find((part) =>
      /\b(we (?:provide|offer|manufacture|transport|speciali[sz]e)|our services|faaliyet alanımız|hizmetlerimiz|uzmanlık alanımız|üretir|üretiyoruz|taşır|taşıyoruz|uzmanlaş)/i.test(
        part
      )
    );
  if (!sentence) return null;
  return sentence.replace(/\s+/g, ' ').slice(0, 240);
}

function extractPhone(text: string): string | null {
  const match = text.match(/\+\d[\d\s().-]{7,}\d/);
  return match ? normalizePhone(match[0]) : null;
}

function extractEmailDomain(text: string): string | null {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? normalizeEmailDomain(match[0]) : null;
}

function extractCountry(text: string): string | null {
  return COUNTRY_RULES.find(([, rule]) => rule.test(text))?.[0] ?? null;
}

function extractCity(text: string): string | null {
  return CITY_NAMES.find(([, rule]) => rule.test(text))?.[0] ?? null;
}

function summarizeSignals(signals: Omit<ExtractedResearchSignals, 'summary'>): string {
  const claims = [
    `name=${signals.name}`,
    signals.domain ? `domain=${signals.domain}` : null,
    signals.sector ? `sector=${signals.sector}` : null,
    signals.activity ? `activity=${signals.activity}` : null,
    signals.country ? `country=${signals.country}` : null,
    signals.city ? `city=${signals.city}` : null,
    signals.emailDomain ? `emailDomain=${signals.emailDomain}` : null,
    signals.phone ? 'phone=present' : null
  ].filter((claim): claim is string => claim !== null);
  return `Deterministic extraction from untrusted source; ${claims.join('; ')}`.slice(0, 4000);
}

/**
 * Extract only bounded, deterministic signals from a supplied public page
 * snapshot. No network or model call is made and the source text is never
 * persisted as executable content.
 */
export function extractResearchSignals(sourceUrl: string, rawContent: string): ExtractedResearchSignals {
  const content = sanitizeResearchContent(rawContent);
  if (!content) throw new Error('Research source content is empty after sanitization');

  const name = extractCompanyName(rawContent);
  if (!name) throw new Error('A company name could not be extracted from the source');

  const domain = normalizeDomain(sourceUrl);
  if (!domain) throw new Error('A valid source domain is required for deterministic extraction');

  const sector = SECTOR_RULES.find(([, rule]) => rule.test(content))?.[0] ?? null;
  const activity = extractActivity(content);
  const country = extractCountry(content);
  const city = extractCity(content);
  const phone = extractPhone(content);
  const emailDomain = extractEmailDomain(content);
  const website = `https://${domain}`;
  const signalCount = [domain, sector, activity, country, city, phone, emailDomain].filter(Boolean).length;
  const confidence = Math.min(0.95, Number((0.35 + signalCount * 0.08).toFixed(2)));
  const signals = { name, domain, website, sector, activity, country, city, phone, emailDomain, confidence };
  return { ...signals, summary: summarizeSignals(signals) };
}

/** Origin identity used by the second-source policy; paths on one host are not independent sources. */
export function researchSourceOrigin(sourceUrl: string): string | null {
  return normalizeDomain(sourceUrl);
}

export function countIndependentResearchSources(sourceUrls: string[]): number {
  return new Set(sourceUrls.map(researchSourceOrigin).filter((value): value is string => value !== null)).size;
}
