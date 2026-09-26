import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The verified full-length 2026-09-26 Wardogs menu delivery. The checked-in manifest
 * (`assets/background-media.json`) is the trust anchor: every rendition keeps the whole
 * available source sequence (5,774 frames at 30 fps, ~192.47 s, no audio). Binaries are
 * third-party imagery delivered outside Git into the ignored
 * `apps/web/public/media/background/` directory; they are never committed.
 */
type ManifestAsset = {
  role: 'primary' | 'compact' | 'alternate' | 'poster';
  filename: string;
  bytes: number;
  sha256: string;
  durationSeconds?: number;
};

const MANIFEST_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../assets/background-media.json');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { assets: ManifestAsset[] };

function byRole(role: ManifestAsset['role']): ManifestAsset {
  const asset = manifest.assets.find((entry) => entry.role === role);
  if (!asset) throw new Error(`assets/background-media.json has no ${role} rendition.`);
  return asset;
}

export const BACKGROUND_DELIVERY: Readonly<Record<'mp4' | 'compactMp4' | 'webm' | 'poster', string>> = {
  mp4: byRole('primary').filename,
  compactMp4: byRole('compact').filename,
  webm: byRole('alternate').filename,
  poster: byRole('poster').filename,
};

/** Container duration recorded in the manifest for the primary rendition. */
export const DELIVERY_DURATION_SECONDS = byRole('primary').durationSeconds ?? Number.NaN;

export const MEDIA_PATH_PREFIX = '/media/background/';
export const MEDIA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/media/background');

export function mediaUrl(baseURL: string, filename: string): string {
  return `${baseURL}${MEDIA_PATH_PREFIX}${filename}`;
}

/** The hash prefix embedded in a delivered filename (`…-557223e28449.mp4` → `557223e28449`). */
export function filenameDigestPrefix(filename: string): string {
  const match = /-([a-f0-9]{12})\.(mp4|webm|webp)$/.exec(filename);
  if (!match?.[1]) throw new Error(`Delivered filename without a digest segment: ${filename}`);
  return match[1];
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export type DeliveredFile = { filename: string; bytes: number; sha256: string };

/** Reads every delivered file and checks its size and SHA-256 against the manifest; throws with guidance otherwise. */
export async function readDelivery(): Promise<DeliveredFile[]> {
  const files: DeliveredFile[] = [];
  for (const filename of Object.values(BACKGROUND_DELIVERY)) {
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(MEDIA_DIR, filename));
    } catch {
      throw new Error(
        `Missing ${path.join('public/media/background', filename)}. Obtain the delivery bundle, verify it ` +
          '(scripts/media/verify-bundle.mjs) and place the four derivatives there; see docs/operations/background-media.md.',
      );
    }
    const digest = sha256(bytes);
    const expected = manifest.assets.find((entry) => entry.filename === filename)!;
    if (!digest.startsWith(filenameDigestPrefix(filename))) throw new Error(`SHA-256 of ${filename} does not match its filename.`);
    if (digest !== expected.sha256 || bytes.length !== expected.bytes) throw new Error(`${filename} differs from assets/background-media.json.`);
    files.push({ filename, bytes: bytes.length, sha256: digest });
  }
  return files;
}

export type Mp4Track = { handler: string; width?: number; height?: number; durationSeconds?: number };

/**
 * Minimal ISO-BMFF reader: lists tracks (handler type, tkhd display size, mdhd duration)
 * so the check can prove the file carries exactly one video track and no audio.
 */
export function readMp4Tracks(buffer: Buffer): { tracks: Mp4Track[]; faststart: boolean } {
  const boxes = (start: number, end: number) => {
    const list: { type: string; start: number; end: number; body: number }[] = [];
    let offset = start;
    while (offset + 8 <= end) {
      let size = buffer.readUInt32BE(offset);
      const type = buffer.toString('latin1', offset + 4, offset + 8);
      let body = offset + 8;
      if (size === 1) {
        size = Number(buffer.readBigUInt64BE(offset + 8));
        body = offset + 16;
      } else if (size === 0) size = end - offset;
      if (size < 8) break;
      list.push({ type, start: offset, end: offset + size, body });
      offset += size;
    }
    return list;
  };
  const top = boxes(0, buffer.length);
  const moov = top.find((box) => box.type === 'moov');
  const mdat = top.find((box) => box.type === 'mdat');
  if (!moov) throw new Error('MP4 without moov box');
  const tracks: Mp4Track[] = [];
  for (const trak of boxes(moov.body, moov.end).filter((box) => box.type === 'trak')) {
    const children = boxes(trak.body, trak.end);
    const track: Mp4Track = { handler: '' };
    const tkhd = children.find((box) => box.type === 'tkhd');
    if (tkhd) {
      // width/height are the last two 16.16 fixed-point fields of tkhd.
      track.width = buffer.readUInt32BE(tkhd.end - 8) / 65536;
      track.height = buffer.readUInt32BE(tkhd.end - 4) / 65536;
    }
    const mdia = children.find((box) => box.type === 'mdia');
    if (mdia) {
      const mdiaChildren = boxes(mdia.body, mdia.end);
      const hdlr = mdiaChildren.find((box) => box.type === 'hdlr');
      if (hdlr) track.handler = buffer.toString('latin1', hdlr.body + 8, hdlr.body + 12);
      const mdhd = mdiaChildren.find((box) => box.type === 'mdhd');
      if (mdhd) {
        const version = buffer.readUInt8(mdhd.body);
        const timescale = version === 1 ? buffer.readUInt32BE(mdhd.body + 20) : buffer.readUInt32BE(mdhd.body + 12);
        const duration = version === 1 ? Number(buffer.readBigUInt64BE(mdhd.body + 24)) : buffer.readUInt32BE(mdhd.body + 16);
        track.durationSeconds = duration / timescale;
      }
    }
    tracks.push(track);
  }
  return { tracks, faststart: mdat ? moov.start < mdat.start : true };
}
