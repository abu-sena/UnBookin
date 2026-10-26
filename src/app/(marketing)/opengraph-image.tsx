import { ImageResponse } from 'next/og';
import messages from '@/messages/id.json';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/*
 * Hex literals are allowed ONLY in this file: `ImageResponse` (satori) renders
 * at build time and cannot read CSS variables, so the values are copied here
 * manually from the light-theme tokens in PRD §12.2 (see `src/app/globals.css`).
 */
const COLORS = {
  background: '#FAFAF9', // --background (light)
  surface: '#FFFFFF', // --surface (light)
  border: '#E7E5E4', // --border (light)
  text: '#1C1917', // --text (light)
  textMuted: '#78716C', // --text-muted (light)
  primary: '#4338CA', // --primary (light)
  primarySoft: '#EEF2FF', // --primary-soft (light)
  xp: '#F59E0B', // --xp (light)
};

export const alt = messages.marketing.ogImageAlt;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage() {
  const logo = await readFile(join(process.cwd(), 'public/branding/unbookin-logo.png'));

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: COLORS.background,
        padding: 72,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* ImageResponse embeds the local artwork directly; next/image is for browser output. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${logo.toString('base64')}`}
          alt={messages.common.appName}
          width={300}
          height={67}
          style={{ objectFit: 'contain' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            color: COLORS.text,
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          <div>Unbook anything.</div>
          <div>Master everything.</div>
        </div>
        <div style={{ color: COLORS.textMuted, fontSize: 28, lineHeight: 1.4, maxWidth: 820 }}>
          Ubah buku, jurnal, dan tautan menjadi modul belajar dengan aksi nyata, kuis, dan
          gamifikasi.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {['Pahami', 'Terapkan', 'Buktikan'].map((label) => (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 24px',
              borderRadius: 999,
              backgroundColor: COLORS.primarySoft,
              color: COLORS.primary,
              fontSize: 24,
              fontWeight: 600,
            }}
          >
            {label}
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 24px',
            borderRadius: 999,
            backgroundColor: COLORS.surface,
            border: `2px solid ${COLORS.border}`,
            color: COLORS.text,
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 20,
              height: 20,
              borderRadius: 999,
              backgroundColor: COLORS.xp,
            }}
          />
          <div style={{ marginLeft: 12 }}>Daftar tunggu terbuka</div>
        </div>
      </div>
    </div>,
    size,
  );
}
