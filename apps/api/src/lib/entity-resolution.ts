/**
 * Deterministic entity resolution for Company records (ADR-003: LLM Last).
 * No AI dependency here — matching is done purely by normalized field
 * comparison, in priority order. AI is deliberately left as an unimplemented
 * last resort (see findDuplicateCompany step 8) for a future phase.
 */

const DIACRITIC_MAP: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  I: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u'
};

function stripTurkishDiacritics(input: string): string {
  return input.replace(/[çÇğĞıIİöÖşŞüÜ]/g, (ch) => DIACRITIC_MAP[ch] ?? ch);
}

// Legal-entity tokens that carry no identifying information once a company
// name has been split into words (e.g. "LTD ŞTİ" / "A.Ş." / "SANAYİ VE
// TİCARET"). Stripped so "Köseoğlu Lojistik" and "KÖSEOĞLU LOJİSTİK LTD ŞTİ"
// resolve to the same key.
const LEGAL_ENTITY_STOPWORDS = new Set([
  'LTD',
  'STI',
  'SIRKETI',
  'ANONIM',
  'A',
  'S',
  'AS',
  'SAN',
  'TIC',
  'TICARET',
  'SANAYI',
  'VE',
  'CO',
  'CORP',
  'INC',
  'LLC',
  'LIMITED',
  'HOLDING'
]);

/** Uppercase, ASCII-folded, legal-suffix-stripped comparison key for a company name. */
export function normalizeCompanyName(raw: string): string {
  const ascii = stripTurkishDiacritics(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim();

  if (!ascii) return '';

  const words = ascii.split(/\s+/).filter((word) => word.length > 0 && !LEGAL_ENTITY_STOPWORDS.has(word));

  return words.join(' ');
}

/** Canonical hostname for a domain/URL: no protocol, no "www.", no trailing slash, lowercase. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const host = new URL(withProtocol).hostname;
    return host.startsWith('www.') ? host.slice(4) : host || null;
  } catch {
    return null;
  }
}

/** Digits-only tax number (Turkish vergi numarası has no meaningful separators). */
export function normalizeTaxNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/** Trimmed, lowercased email — the canonical form stored on Contact.email. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return value.length > 0 ? value : null;
}

/** The domain portion of an email address, normalized the same way as a company domain. */
export function extractEmailDomain(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) return null;
  const domain = normalized.split('@')[1];
  return normalizeDomain(domain);
}

/** Digits-only phone number, preserving a leading "+" for international format. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  return hasPlus ? `+${digits}` : digits;
}

function normalizeAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return value.length > 0 ? value : null;
}

/** Levenshtein edit distance. */
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) distances[i][0] = i;
  for (let j = 0; j < cols; j += 1) distances[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + cost
      );
    }
  }

  return distances[rows - 1][cols - 1];
}

/** 0..1 similarity ratio derived from Levenshtein distance (1 = identical). */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

const SIMILARITY_THRESHOLD = 0.85;

export type CompanyMatchCandidate = {
  id: string;
  normalizedName: string;
  taxNumber?: string | null;
  domain?: string | null;
  phone?: string | null;
  emailDomain?: string | null;
  address?: string | null;
};

export type CompanyMatchInput = {
  name: string;
  taxNumber?: string | null;
  domain?: string | null;
  phone?: string | null;
  emailDomain?: string | null;
  address?: string | null;
};

export type CompanyMatchReason =
  | 'TAX_NUMBER'
  | 'DOMAIN'
  | 'PHONE'
  | 'EMAIL_DOMAIN'
  | 'ADDRESS'
  | 'NORMALIZED_NAME'
  | 'SIMILARITY';

export type CompanyMatchResult = {
  candidate: CompanyMatchCandidate;
  reason: CompanyMatchReason;
  confidence: number;
};

/**
 * Deterministic duplicate-company lookup, checked in priority order:
 * tax number -> domain -> phone -> email domain -> address ->
 * normalized name -> fuzzy name similarity -> (AI, not implemented here).
 *
 * Returns the first/strongest match found, or null if `input` looks like a
 * genuinely new company.
 */
export function findDuplicateCompany(
  input: CompanyMatchInput,
  existing: readonly CompanyMatchCandidate[]
): CompanyMatchResult | null {
  const normalizedName = normalizeCompanyName(input.name);
  const taxNumber = normalizeTaxNumber(input.taxNumber);
  const domain = normalizeDomain(input.domain);
  const phone = normalizePhone(input.phone);
  const emailDomain = normalizeDomain(input.emailDomain);
  const address = normalizeAddress(input.address);

  if (taxNumber) {
    const match = existing.find((c) => normalizeTaxNumber(c.taxNumber) === taxNumber);
    if (match) return { candidate: match, reason: 'TAX_NUMBER', confidence: 1 };
  }

  if (domain) {
    const match = existing.find((c) => normalizeDomain(c.domain) === domain);
    if (match) return { candidate: match, reason: 'DOMAIN', confidence: 0.95 };
  }

  if (phone) {
    const match = existing.find((c) => normalizePhone(c.phone) === phone);
    if (match) return { candidate: match, reason: 'PHONE', confidence: 0.85 };
  }

  if (emailDomain) {
    const match = existing.find((c) => normalizeDomain(c.emailDomain) === emailDomain);
    if (match) return { candidate: match, reason: 'EMAIL_DOMAIN', confidence: 0.8 };
  }

  if (address) {
    const match = existing.find((c) => normalizeAddress(c.address) === address);
    if (match) return { candidate: match, reason: 'ADDRESS', confidence: 0.7 };
  }

  if (normalizedName) {
    const match = existing.find((c) => c.normalizedName === normalizedName);
    if (match) return { candidate: match, reason: 'NORMALIZED_NAME', confidence: 0.65 };
  }

  let best: { candidate: CompanyMatchCandidate; score: number } | null = null;
  if (normalizedName) {
    for (const candidate of existing) {
      const score = stringSimilarity(normalizedName, candidate.normalizedName);
      if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
        best = { candidate, score };
      }
    }
  }
  if (best) {
    return { candidate: best.candidate, reason: 'SIMILARITY', confidence: best.score * 0.6 };
  }

  // Step 8 (AI-assisted fuzzy resolution) is intentionally not implemented
  // in Phase 1 — see ADR-003 (LLM Last) and MASTER_PLAN.md Phase 2.
  return null;
}
