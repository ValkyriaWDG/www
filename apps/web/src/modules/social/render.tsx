import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { SOCIAL_SIZE, socialCopy, type SocialCard, type SocialMark, type SocialTheme } from './model';

// All bytes come from shipped files or the publication-checked media store. No remote
// image/font requests, private image URLs, game packages or runtime filesystem writes.
let resources: Promise<{ crest: string; latin: Buffer; extended: Buffer }> | undefined;
const asPng = async (bytes: Buffer, width = 640) => `data:image/png;base64,${(await sharp(bytes).resize({ width, withoutEnlargement: true }).png().toBuffer()).toString('base64')}`;
/** Full-bleed photographic layer: JPEG keeps the in-memory layer small; the output stays PNG. */
const asBackdrop = async (bytes: Buffer) =>
  `data:image/jpeg;base64,${(await sharp(bytes).resize(SOCIAL_SIZE.width, SOCIAL_SIZE.height, { fit: 'cover', position: 'centre' }).jpeg({ quality: 84 }).toBuffer()).toString('base64')}`;
const publicFile = (relative: string) => readFile(path.join(process.cwd(), 'public', relative));

function loadResources() {
  resources ??= Promise.all([
    publicFile('brand/valkyria-emblem-733.webp').then((bytes) => asPng(bytes)),
    readFile(path.join(process.cwd(), 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff')),
    readFile(path.join(process.cwd(), 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-ext-600-normal.woff')),
  ]).then(([crest, latin, extended]) => ({ crest, latin, extended }));
  return resources;
}

/**
 * Default backgrounds: text-free scenes of the owner graphics pack (AI illustrations) and
 * the owner-selected community hub cover (PR #69). Fixed paths only.
 */
const THEME_BACKDROP: Record<SocialTheme, string> = {
  hll: 'images/editorial/hll-infantry-1920x1080.webp',
  wardogs: 'images/editorial/wdg-blue-1920x1080.webp',
  community: 'images/community/hub-cover-1672.webp',
};
const backdrops = new Map<string, Promise<string>>();
function backdrop(relative: string): Promise<string> {
  let cached = backdrops.get(relative);
  if (!cached) {
    cached = publicFile(relative).then(asBackdrop);
    cached.catch(() => backdrops.delete(relative));
    backdrops.set(relative, cached);
  }
  return cached;
}

/** Official white game marks (never redrawn), rasterized once at twice the header size. */
const MARK_FILES: Record<SocialMark, string> = { hll: 'brand/hell-let-loose-fullmark-white.svg', wardogs: 'presskit/wardogs-fullmark-white.svg' };
const MARK_HEIGHT = 28;
const markImages = new Map<SocialMark, Promise<{ src: string; width: number }>>();
function markImage(mark: SocialMark) {
  let cached = markImages.get(mark);
  if (!cached) {
    cached = publicFile(MARK_FILES[mark]).then(async (svg) => {
      const { data, info } = await sharp(svg, { density: 144 }).resize({ height: MARK_HEIGHT * 2 }).png().toBuffer({ resolveWithObject: true });
      return { src: `data:image/png;base64,${data.toString('base64')}`, width: Math.round((info.width / info.height) * MARK_HEIGHT) };
    });
    cached.catch(() => markImages.delete(mark));
    markImages.set(mark, cached);
  }
  return cached;
}

/** Map briefing layers from the catalog slug (`hll-maps.ts`), never from request input. */
async function mapLayers(slug: string): Promise<{ background: string; scene: string }> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Invalid map slug');
  const [background, scene] = await Promise.all([
    backdrop(`images/hll/maps/${slug}/sharing-1200x630.webp`),
    publicFile(`images/hll/maps/${slug}/scene-718x404.webp`).then((bytes) => asPng(bytes, 432)),
  ]);
  return { background, scene };
}

/** The shipped typeface supports Latin. Do not let @vercel/og fetch fallback fonts or emoji. */
export function renderText(value: string): string {
  return value.normalize('NFC').replace(/[^ -~ -ſ​–—‘’“”•…]/gu, '?');
}

const PALETTE: Record<SocialTheme, { accent: string; base: string; rgb: string; line: string }> = {
  hll: { accent: '#c5b967', base: '#171a1f', rgb: '23, 26, 31', line: '#5b5f55' },
  wardogs: { accent: '#e9ac2f', base: '#111310', rgb: '17, 19, 16', line: '#55564a' },
  community: { accent: '#e9ac2f', base: '#111310', rgb: '17, 19, 16', line: '#55564a' },
};

export async function renderSocialCard(card: SocialCard, cover: Buffer | null, siteHost: string): Promise<Uint8Array> {
  const assets = await loadResources();
  const copy = socialCopy(card.locale);
  const colours = PALETTE[card.theme];
  const { accent, base, rgb } = colours;
  // Published cover (framed, never cropped) > HLL map briefing > default scene of the game.
  const coverArt = cover ? await asPng(cover) : null;
  const map = !cover && card.map ? await mapLayers(card.map.slug) : null;
  const scene = !cover && !map ? await backdrop(THEME_BACKDROP[card.theme]) : null;
  const marks = await Promise.all(card.marks.map(markImage));
  const titleSize = card.score ? 56 : card.title.length > 92 ? 48 : card.title.length > 52 ? 56 : 70;
  const clampedText = { display: '-webkit-box', WebkitBoxOrient: 'vertical', textOverflow: 'ellipsis', overflow: 'hidden', flexShrink: 0 } as const;
  const shade = (alpha: number) => `rgba(${rgb}, ${alpha})`;
  const chip = { display: 'flex', position: 'absolute', right: 44, fontSize: 15, color: '#d6d7cc', letterSpacing: 0.6, padding: '4px 10px', background: shade(0.78) } as const;
  const response = new ImageResponse(
    <div style={{ display: 'flex', width: 1200, height: 630, background: base, color: '#f2f0e6', fontFamily: 'Barlow, BarlowExt', fontWeight: 600, position: 'relative', borderTop: `6px solid ${accent}` }}>
      {scene || map ? (
        // eslint-disable-next-line @next/next/no-img-element -- in-memory OG rasterization
        <img src={(scene ?? map!.background)} width={1200} height={630} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
      ) : null}
      {/* Satori ignores `inset`; explicit edges give the layer its size. */}
      <div
        style={{
          display: 'flex', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
          backgroundImage: scene
            ? `linear-gradient(90deg, ${shade(0.97)} 0%, ${shade(0.92)} 40%, ${shade(0.45)} 66%, ${shade(0.12)} 100%)`
            : map
              ? `linear-gradient(90deg, ${shade(0.94)} 0%, ${shade(0.78)} 50%, ${shade(0.42)} 100%)`
              : card.theme === 'hll' ? 'linear-gradient(120deg, #30363f 0%, #171a1f 67%)' : 'linear-gradient(120deg, #252b22 0%, #111310 67%)',
        }}
      />
      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, top: 0, height: 128, backgroundImage: `linear-gradient(180deg, ${shade(0.88)} 0%, ${shade(0)} 100%)` }} />
      <div style={{ display: 'flex', position: 'absolute', left: 44, right: 44, top: 25, height: 78, alignItems: 'center', borderBottom: `1px solid ${colours.line}`, paddingBottom: 18 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- in-memory OG rasterization */}
        <img src={assets.crest} width={54} height={60} alt="" style={{ objectFit: 'contain' }} />
        <div style={{ display: 'flex', fontSize: 34, letterSpacing: 5, marginLeft: 19 }}>VALKYRIA</div>
        {marks.length > 0 ? (
          <div style={{ display: 'flex', marginLeft: 'auto', alignItems: 'center' }}>
            {marks.map((mark, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
                {index > 0 ? <div style={{ display: 'flex', width: 1, height: MARK_HEIGHT + 6, margin: '0 18px', background: colours.line }} /> : null}
                {/* eslint-disable-next-line @next/next/no-img-element -- in-memory OG rasterization of the official mark */}
                <img src={mark.src} width={mark.width} height={MARK_HEIGHT} alt="" />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 19, letterSpacing: 2, color: '#ded6bd' }}>{renderText(card.game)}</div>
        )}
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 48, top: 139, width: 624, bottom: 91, flexDirection: 'column' }}>
        <div style={{ ...clampedText, WebkitLineClamp: 1, color: accent, fontSize: 22, letterSpacing: 2, marginBottom: 20 }}>{renderText(card.label)}</div>
        <div style={{ ...clampedText, WebkitLineClamp: card.score ? 2 : 4, fontSize: titleSize, lineHeight: 1.06, letterSpacing: 0.2 }}>{renderText(card.title)}</div>
        {card.score ? <div style={{ display: 'flex', fontSize: card.score.length > 12 ? 56 : 76, flexShrink: 0, color: accent, marginTop: 9 }}>{card.score}</div> : null}
        {card.status ? <div style={{ display: 'flex', fontSize: 22, marginTop: 12, color: '#e6c67e' }}>{renderText(card.status)}</div> : null}
        <div style={{ ...clampedText, WebkitLineClamp: 2, fontSize: 24, lineHeight: 1.3, color: '#d0d1c8', marginTop: 'auto', paddingTop: 14 }}>{renderText(card.detail)}</div>
      </div>
      {coverArt || map ? (
        <div style={{ display: 'flex', position: 'absolute', right: 44, top: map ? 170 : 156, width: 448, height: map ? 259 : 340, alignItems: 'center', justifyContent: 'center', border: '1px solid #777665', background: '#191c17' }}>
          {/* Keep the complete cover/scene: no cropping of marks or editorial text. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- in-memory OG rasterization */}
          <img src={(coverArt ?? map!.scene)} width={432} height={map ? 243 : 316} alt="" style={{ objectFit: 'contain' }} />
        </div>
      ) : !scene ? (
        <div style={{ display: 'flex', position: 'absolute', right: 44, top: 156, width: 448, height: 340, alignItems: 'center', justifyContent: 'center', border: '1px solid #777665', background: '#191c17' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- in-memory OG rasterization */}
          <img src={assets.crest} width={250} height={274} alt="" style={{ objectFit: 'contain', opacity: 0.5 }} />
        </div>
      ) : null}
      {map ? <div style={{ ...chip, top: 441, color: accent, fontSize: 19, letterSpacing: 2 }}>{renderText(copy.mapScene.replace('{map}', card.map!.name.toUpperCase()))}</div> : null}
      {scene ? <div style={{ ...chip, top: 518 }}>{copy.sceneIllustration}</div> : null}
      <div style={{ display: 'flex', position: 'absolute', bottom: 0, left: 0, right: 0, height: 66, padding: '0 48px', alignItems: 'center', background: '#090b09', borderTop: `1px solid ${colours.line}` }}>
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
