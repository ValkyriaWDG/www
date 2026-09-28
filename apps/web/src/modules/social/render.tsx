import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { SOCIAL_SIZE, socialCopy, type SocialCard } from './model';

// All bytes come from shipped files or the publication-checked media store. No remote
// image/font requests, private image URLs, game packages or runtime filesystem writes.
let resources: Promise<{ crest: string; scene: string; latin: Buffer; extended: Buffer }> | undefined;
const asPng = async (bytes: Buffer) => `data:image/png;base64,${(await sharp(bytes).resize({ width: 640, withoutEnlargement: true }).png().toBuffer()).toString('base64')}`;

function loadResources() {
  resources ??= Promise.all([
    readFile(path.join(process.cwd(), 'public/brand/valkyria-emblem-733.webp')).then(asPng),
    readFile(path.join(process.cwd(), 'public/presskit/flying-800.webp')).then(asPng),
    readFile(path.join(process.cwd(), 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff')),
    readFile(path.join(process.cwd(), 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-ext-600-normal.woff')),
  ]).then(([crest, scene, latin, extended]) => ({ crest, scene, latin, extended }));
  return resources;
}

/** The shipped typeface supports Latin. Do not let @vercel/og fetch fallback fonts or emoji. */
export function renderText(value: string): string {
  return value.normalize('NFC').replace(/[^\u0020-\u007e\u00a0-\u017f\u200b\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026]/gu, '?');
}

export async function renderSocialCard(card: SocialCard, cover: Buffer | null, siteHost: string): Promise<Uint8Array> {
  const assets = await loadResources();
  const copy = socialCopy(card.locale);
  const art = cover ? await asPng(cover) : card.artwork === 'flying' ? assets.scene : null;
  const illustration = !cover && card.artwork === 'flying';
  const titleSize = card.score ? 56 : card.title.length > 92 ? 48 : card.title.length > 52 ? 56 : 70;
  const clampedText = { display: '-webkit-box', WebkitBoxOrient: 'vertical', textOverflow: 'ellipsis', overflow: 'hidden', flexShrink: 0 } as const;
  const response = new ImageResponse(
    <div style={{ display: 'flex', width: 1200, height: 630, background: '#111310', color: '#f2f0e6', fontFamily: 'Barlow, BarlowExt', fontWeight: 600, position: 'relative', borderTop: '6px solid #e9ac2f' }}>
      <div style={{ display: 'flex', position: 'absolute', inset: 0, background: 'linear-gradient(120deg, #252b22 0%, #111310 67%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 44, right: 44, top: 25, height: 78, alignItems: 'center', borderBottom: '1px solid #55564a', paddingBottom: 18 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- in-memory OG rasterization */}
        <img src={assets.crest} width={54} height={60} alt="" style={{ objectFit: 'contain' }} />
        <div style={{ display: 'flex', fontSize: 34, letterSpacing: 5, marginLeft: 19 }}>VALKYRIA</div>
        <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 19, letterSpacing: 2, color: '#ded6bd' }}>{renderText(card.game)}</div>
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 48, top: 139, width: 624, bottom: 91, flexDirection: 'column' }}>
        <div style={{ ...clampedText, WebkitLineClamp: 1, color: '#efb743', fontSize: 22, letterSpacing: 2, marginBottom: 20 }}>{renderText(card.label)}</div>
        <div style={{ ...clampedText, WebkitLineClamp: card.score ? 2 : 4, fontSize: titleSize, lineHeight: 1.06, letterSpacing: 0.2 }}>{renderText(card.title)}</div>
        {card.score ? <div style={{ display: 'flex', fontSize: card.score.length > 12 ? 56 : 76, flexShrink: 0, color: '#f2bc4c', marginTop: 9 }}>{card.score}</div> : null}
        {card.status ? <div style={{ display: 'flex', fontSize: 22, marginTop: 12, color: '#e6c67e' }}>{renderText(card.status)}</div> : null}
        <div style={{ ...clampedText, WebkitLineClamp: 2, fontSize: 24, lineHeight: 1.3, color: '#d0d1c8', marginTop: 'auto', paddingTop: 14 }}>{renderText(card.detail)}</div>
      </div>
      <div style={{ display: 'flex', position: 'absolute', right: 44, top: 156, width: 448, height: 340, alignItems: 'center', justifyContent: 'center', border: '1px solid #777665', background: '#191c17' }}>
        {art ? (
          // Keep the complete artwork/cover: no cropping of rotor blades, marks or editorial text.
          // eslint-disable-next-line @next/next/no-img-element -- in-memory OG rasterization
          <img src={art} width={432} height={316} alt="" style={{ objectFit: 'contain' }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- in-memory OG rasterization
          <img src={assets.crest} width={250} height={274} alt="" style={{ objectFit: 'contain', opacity: 0.5 }} />
        )}
      </div>
      {illustration ? <div style={{ display: 'flex', position: 'absolute', right: 45, top: 511, fontSize: 15, color: '#c6c7bb', letterSpacing: 0.6 }}>{copy.illustration}</div> : null}
      <div style={{ display: 'flex', position: 'absolute', bottom: 0, left: 0, right: 0, height: 66, padding: '0 48px', alignItems: 'center', background: '#090b09', borderTop: '1px solid #55564a' }}>
        <div style={{ display: 'flex', fontSize: 23, letterSpacing: 2 }}>{renderText(siteHost)}</div>
        <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 18, color: '#c3c6b8', letterSpacing: 2 }}>{`${card.locale.toUpperCase()} // VALKYRIA`}</div>
      </div>
    </div>,
    {
      ...SOCIAL_SIZE,
      fonts: [
        { name: 'Barlow', data: assets.latin, weight: 600, style: 'normal' },
        { name: 'BarlowExt', data: assets.extended, weight: 600, style: 'normal' },
      ],
    },
  );
  return new Uint8Array(await response.arrayBuffer());
}
