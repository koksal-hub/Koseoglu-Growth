import React, { useMemo, useState } from 'react';

const platforms = [
  ['LINKEDIN', 3000],
  ['INSTAGRAM', 2200],
  ['FACEBOOK', 2000],
  ['X', 280],
  ['THREADS', 500],
  ['TIKTOK', 2200],
  ['YOUTUBE', 5000],
  ['GOOGLE_BUSINESS', 1500],
  ['PINTEREST', 500],
] as const;

type Platform = (typeof platforms)[number][0];
type Variant = { platform: Platform; body: string; status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SCHEDULED' };

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #dbe4ee',
  borderRadius: 12,
  boxShadow: '0 5px 18px rgba(15, 42, 67, 0.06)',
  padding: 20,
};

export default function App() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState('growth-editor');
  const [reviewer, setReviewer] = useState('human-reviewer');
  const [selected, setSelected] = useState<Set<Platform>>(new Set(platforms.map(([platform]) => platform)));
  const [variants, setVariants] = useState<Variant[]>([]);

  const selectedCount = selected.size;
  const bodyReady = body.trim().length > 0 && title.trim().length > 0;
  const statusText = useMemo(
    () => (variants.length === 0 ? 'Henüz varyant yok' : `${variants.length} platform varyantı hazır`),
    [variants.length]
  );

  function togglePlatform(platform: Platform) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  function createVariants(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bodyReady) return;
    setVariants(
      platforms
        .filter(([platform]) => selected.has(platform))
        .map(([platform, limit]) => ({ platform, body: body.trim().slice(0, limit), status: 'DRAFT' }))
    );
  }

  function advance(platform: Platform) {
    setVariants((current) =>
      current.map((variant) => {
        if (variant.platform !== platform) return variant;
        if (variant.status === 'DRAFT') return { ...variant, status: 'IN_REVIEW' };
        if (variant.status === 'IN_REVIEW' && reviewer !== author) return { ...variant, status: 'APPROVED' };
        if (variant.status === 'APPROVED') return { ...variant, status: 'SCHEDULED' };
        return variant;
      })
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#17324d', fontFamily: 'Arial, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <p style={{ color: '#2878b5', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>KÖSEOĞLU GROWTH · SOCIAL COMMAND CENTER</p>
          <h1 style={{ margin: 0, fontSize: 36 }}>Köseoğlu Lojistik Growth</h1>
          <p style={{ maxWidth: 760, lineHeight: 1.6 }}>Tek master içeriği her kanala körlemesine kopyalamadan, karakter politikası ve insan onayı görünür bir composer akışı.</p>
        </header>

        <div style={{ ...cardStyle, background: '#fff9e8', borderColor: '#f0d48a', marginBottom: 20 }} role="status">
          <strong>Güvenli mod:</strong> Bu panel yalnız local preview ve workflow durumunu gösterir. OAuth, token refresh, medya upload, sosyal yayın, DM ve gerçek müşteri iletişimi bağlı değildir.
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.8fr)', gap: 20, alignItems: 'start' }}>
          <form onSubmit={createVariants} style={cardStyle} aria-label="Master content composer">
            <h2 style={{ marginTop: 0 }}>1. Master content</h2>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 14 }}>
              Başlık
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Örn. Avrupa taşıma kapasitesi" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 10, border: '1px solid #bdcada', borderRadius: 8 }} />
            </label>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 14 }}>
              Ana içerik
              <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="İnsan tarafından doğrulanabilir, marka tonuna uygun metin…" rows={8} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 10, border: '1px solid #bdcada', borderRadius: 8, resize: 'vertical' }} />
            </label>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: 14 }}>
              İçerik yazarı
              <input value={author} onChange={(event) => setAuthor(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 10, border: '1px solid #bdcada', borderRadius: 8 }} />
            </label>
            <button type="submit" disabled={!bodyReady || selectedCount === 0} style={{ background: '#1967a3', color: '#fff', border: 0, borderRadius: 8, padding: '11px 16px', cursor: bodyReady && selectedCount > 0 ? 'pointer' : 'not-allowed', opacity: bodyReady && selectedCount > 0 ? 1 : 0.5 }}>
              {selectedCount} platform için varyant önizlemesi oluştur
            </button>
          </form>

          <aside style={cardStyle} aria-label="Platform selection">
            <h2 style={{ marginTop: 0 }}>2. Platform seçimi</h2>
            <p style={{ color: '#536b80', lineHeight: 1.5 }}>Policy v1 limitleri product guardrail’dır; canlı provider limitleri adapter bağlanınca ayrıca doğrulanır.</p>
            {platforms.map(([platform, limit]) => (
              <label key={platform} style={{ display: 'flex', gap: 10, justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #edf1f5' }}>
                <span><input type="checkbox" checked={selected.has(platform)} onChange={() => togglePlatform(platform)} /> {platform.replace('_', ' ')}</span>
                <small style={{ color: '#6a7f91' }}>{limit.toLocaleString('tr-TR')} karakter</small>
              </label>
            ))}
            <label style={{ display: 'block', fontWeight: 700, marginTop: 18 }}>
              İnsan onaylayıcı
              <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 10, border: '1px solid #bdcada', borderRadius: 8 }} />
            </label>
          </aside>
        </section>

        <section style={{ ...cardStyle, marginTop: 20 }} aria-label="Platform variants">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>3. Varyant ve onay akışı</h2>
            <span style={{ color: '#536b80' }}>{statusText}</span>
          </div>
          {variants.length === 0 ? (
            <p style={{ color: '#536b80' }}>Master içeriği doldurup önizleme oluşturun.</p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #dbe4ee' }}><th style={{ padding: 10 }}>Platform</th><th style={{ padding: 10 }}>İçerik</th><th style={{ padding: 10 }}>Durum</th><th style={{ padding: 10 }}>Aksiyon</th></tr></thead>
                <tbody>{variants.map((variant) => (
                  <tr key={variant.platform} style={{ borderBottom: '1px solid #edf1f5' }}>
                    <td style={{ padding: 10, fontWeight: 700 }}>{variant.platform}</td>
                    <td style={{ padding: 10, minWidth: 300 }}>{variant.body}<br /><small style={{ color: '#6a7f91' }}>{variant.body.length} karakter · provider validation: NOT RUN</small></td>
                    <td style={{ padding: 10 }}><span style={{ background: '#edf5ff', borderRadius: 999, padding: '4px 8px', fontSize: 12 }}>{variant.status}</span></td>
                    <td style={{ padding: 10 }}><button type="button" onClick={() => advance(variant.platform)} disabled={variant.status === 'SCHEDULED' || (variant.status === 'IN_REVIEW' && reviewer === author)} style={{ border: '1px solid #9db7cc', background: '#fff', borderRadius: 7, padding: '7px 10px', cursor: 'pointer' }}>{variant.status === 'DRAFT' ? 'İncelemeye gönder' : variant.status === 'IN_REVIEW' ? 'Onayla' : variant.status === 'APPROVED' ? 'Zamanla' : 'Zamanlandı'}</button></td>
                  </tr>
                ))}</tbody>
              </table>
              {reviewer === author && variants.some((variant) => variant.status === 'IN_REVIEW') && <p style={{ color: '#a34800' }}>Yazar kendi içeriğini onaylayamaz; farklı bir insan onaylayıcı girin.</p>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
