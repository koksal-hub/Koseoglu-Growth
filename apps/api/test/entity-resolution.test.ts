import { describe, expect, it } from 'vitest';
import {
  extractEmailDomain,
  findDuplicateCompany,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizeTaxNumber,
  stringSimilarity,
  type CompanyMatchCandidate
} from '../src/lib/entity-resolution';

describe('normalizeCompanyName', () => {
  it('treats plain, diacritic and legal-suffix variants as the same company', () => {
    const a = normalizeCompanyName('Köseoğlu Lojistik');
    const b = normalizeCompanyName('Koseoglu Lojistik');
    const c = normalizeCompanyName('KÖSEOĞLU LOJİSTİK LTD ŞTİ');

    expect(a).toBe('KOSEOGLU LOJISTIK');
    expect(b).toBe('KOSEOGLU LOJISTIK');
    expect(c).toBe('KOSEOGLU LOJISTIK');
  });

  it('collapses extra whitespace and punctuation', () => {
    expect(normalizeCompanyName('  Acme,   Inc.  ')).toBe('ACME');
  });

  it('returns an empty string for input with no meaningful content', () => {
    expect(normalizeCompanyName('   ')).toBe('');
    expect(normalizeCompanyName('LTD ŞTİ')).toBe('');
  });

  it('does not treat genuinely different companies as equal', () => {
    expect(normalizeCompanyName('Köseoğlu Lojistik')).not.toBe(normalizeCompanyName('Aydın Nakliyat'));
  });

  it('does not strip "Holding" — a holding company is a distinct entity from its subsidiary', () => {
    // Regression test for REVIEW-issue2.md point F: an earlier stopword
    // list included HOLDING, which made a hypothetical "X Lojistik
    // Holding" normalize to exactly the same key as "X Lojistik" — a
    // verified false-positive collision risk class (not a claim about any
    // real company's actual corporate structure — purely illustrative
    // fictional names below).
    const subsidiary = normalizeCompanyName('Örnek Lojistik');
    const holding = normalizeCompanyName('Örnek Lojistik Holding');
    expect(holding).not.toBe(subsidiary);
    expect(holding).toBe('ORNEK LOJISTIK HOLDING');
  });
});

describe('normalizeDomain', () => {
  it('reduces protocol/www/trailing-slash variants to the same hostname', () => {
    expect(normalizeDomain('https://www.example.com/')).toBe('example.com');
    expect(normalizeDomain('www.example.com')).toBe('example.com');
    expect(normalizeDomain('example.com')).toBe('example.com');
  });

  it('lowercases the hostname', () => {
    expect(normalizeDomain('WWW.Example.COM')).toBe('example.com');
  });

  it('returns null for empty or unparseable input', () => {
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain(undefined)).toBeNull();
    expect(normalizeDomain('   ')).toBeNull();
  });
});

describe('normalizeTaxNumber', () => {
  it('strips separators and keeps only digits', () => {
    expect(normalizeTaxNumber('123 456 7890')).toBe('1234567890');
    expect(normalizeTaxNumber('123-456-7890')).toBe('1234567890');
  });

  it('returns null when there are no digits', () => {
    expect(normalizeTaxNumber('N/A')).toBeNull();
    expect(normalizeTaxNumber(null)).toBeNull();
  });
});

describe('normalizeEmail / extractEmailDomain', () => {
  it('lowercases and trims email addresses', () => {
    expect(normalizeEmail('  Ali@Example.COM ')).toBe('ali@example.com');
  });

  it('extracts a normalized domain from an email', () => {
    expect(extractEmailDomain('Ali@WWW.Example.COM')).toBe('example.com');
  });

  it('returns null for malformed or missing email', () => {
    expect(extractEmailDomain('not-an-email')).toBeNull();
    expect(extractEmailDomain(null)).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('strips formatting but keeps a leading +', () => {
    expect(normalizePhone('+90 (212) 555-00-00')).toBe('+902125550000');
    expect(normalizePhone('0212 555 00 00')).toBe('02125550000');
  });

  it('returns null when there are no digits', () => {
    expect(normalizePhone('---')).toBeNull();
  });
});

describe('stringSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(stringSimilarity('ACME', 'ACME')).toBe(1);
  });

  it('returns a high score for a near-miss typo', () => {
    expect(stringSimilarity('KOSEOGLU LOJISTIK', 'KOSEOGLU LOJISTIC')).toBeGreaterThan(0.9);
  });

  it('returns a low score for unrelated strings', () => {
    expect(stringSimilarity('KOSEOGLU LOJISTIK', 'AYDIN NAKLIYAT')).toBeLessThan(0.5);
  });
});

describe('findDuplicateCompany', () => {
  const existing: CompanyMatchCandidate[] = [
    {
      id: 'company-1',
      normalizedName: normalizeCompanyName('Köseoğlu Lojistik'),
      taxNumber: '1234567890',
      domain: 'koseoglulojistik.com',
      phone: '+902125550000',
      emailDomain: 'koseoglulojistik.com',
      address: 'Atatürk Cad. No:1 İstanbul'
    }
  ];

  it('matches on tax number even if every other field differs', () => {
    const result = findDuplicateCompany(
      {
        name: 'Completely Different Name Ltd',
        taxNumber: '123-456-7890',
        domain: 'other-domain.com'
      },
      existing
    );
    expect(result?.reason).toBe('TAX_NUMBER');
    expect(result?.candidate.id).toBe('company-1');
    expect(result?.matchScore).toBe(1);
    expect(result?.recommendedAction).toBe('AUTO_MERGE_CANDIDATE');
  });

  it('falls back to domain when tax number is absent, but only recommends review', () => {
    const result = findDuplicateCompany(
      { name: 'Some Other Name', domain: 'https://www.koseoglulojistik.com/' },
      existing
    );
    expect(result?.reason).toBe('DOMAIN');
    expect(result?.recommendedAction).toBe('REVIEW_REQUIRED');
  });

  it('falls back to normalized name when no other identifiers match', () => {
    const result = findDuplicateCompany({ name: 'KÖSEOĞLU LOJİSTİK LTD ŞTİ' }, existing);
    expect(result?.reason).toBe('NORMALIZED_NAME');
    expect(result?.recommendedAction).toBe('REVIEW_REQUIRED');
  });

  it('flags a close typo via similarity as a lower-score, review-required candidate', () => {
    const result = findDuplicateCompany({ name: 'Köseoğlu Lojistic' }, existing);
    expect(result?.reason).toBe('SIMILARITY');
    expect(result?.matchScore).toBeLessThan(0.65);
    expect(result?.recommendedAction).toBe('REVIEW_REQUIRED');
  });

  it('recommends review (not auto-merge) for phone, email-domain and address matches', () => {
    const byPhone = findDuplicateCompany({ name: 'Unrelated Name', phone: '+90 212 555 00 00' }, existing);
    expect(byPhone?.reason).toBe('PHONE');
    expect(byPhone?.recommendedAction).toBe('REVIEW_REQUIRED');

    const byEmailDomain = findDuplicateCompany(
      { name: 'Unrelated Name', emailDomain: 'koseoglulojistik.com' },
      existing
    );
    expect(byEmailDomain?.reason).toBe('EMAIL_DOMAIN');
    expect(byEmailDomain?.recommendedAction).toBe('REVIEW_REQUIRED');

    const byAddress = findDuplicateCompany(
      { name: 'Unrelated Name', address: 'Atatürk Cad. No:1 İstanbul' },
      existing
    );
    expect(byAddress?.reason).toBe('ADDRESS');
    expect(byAddress?.recommendedAction).toBe('REVIEW_REQUIRED');
  });

  it('returns null for a genuinely new company', () => {
    const result = findDuplicateCompany(
      {
        name: 'Aydın Nakliyat',
        taxNumber: '9999999999',
        domain: 'aydinnakliyat.com'
      },
      existing
    );
    expect(result).toBeNull();
  });
});
