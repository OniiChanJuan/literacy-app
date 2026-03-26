import { ImageResponse } from 'next/og';

export const alt = 'Literacy -- Fluent in Every Medium';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0b0b10, #141419)',
        fontFamily: 'serif',
      }}>
        <span style={{
          fontSize: 80,
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '-1px',
          marginBottom: 16,
        }}>Literacy</span>
        <span style={{
          fontSize: 24,
          color: 'rgba(255,255,255,0.4)',
          letterSpacing: '4px',
          textTransform: 'uppercase' as const,
        }}>Fluent in every medium</span>
        <div style={{
          display: 'flex',
          gap: 16,
          marginTop: 40,
        }}>
          {['movies', 'tv', 'books', 'manga', 'comics', 'games', 'music', 'podcasts'].map((label, i) => (
            <span key={i} style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.3)',
              textTransform: 'uppercase' as const,
              letterSpacing: '2px',
            }}>{label}</span>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
