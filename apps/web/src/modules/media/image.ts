import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { DomainError } from '@/lib/result';

/**
 * Image intake: signature sniffing, structural checks against polyglot/trailing
 * payloads, decoder validation with pixel/edge limits, then re-encoding to WebP
 * derivatives (auto-rotated, all metadata stripped). SVG, HTML, GIF, animated images,
 * truncated/corrupt files and decompression bombs are rejected.
 */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 40_000_000;
export const MAX_INPUT_EDGE = 12_000;
export const FULL_MAX_EDGE = 2400;
export const THUMB_MAX_EDGE = 480;

export type ImageFormat = 'jpeg' | 'png' | 'webp';

export type EncodedVariant = { buffer: Buffer; width: number; height: number; bytes: number };

export type ProcessedImage = {
  format: ImageFormat;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  full: EncodedVariant;
  thumb: EncodedVariant;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Detects JPEG/PNG/WebP by magic bytes; anything else (SVG, HTML, GIF, …) is `null`. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return 'png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

const unsupported = (reason: string) => new DomainError('unsupported_media', reason);

function hasNonZero(bytes: Uint8Array, from: number): boolean {
  for (let i = from; i < bytes.length; i += 1) if (bytes[i] !== 0) return true;
  return false;
}

/** PNG: walk chunks to IEND; reject animation (acTL) and data after IEND. */
function checkPngStructure(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    const next = offset + 12 + length;
    if (next > bytes.length) throw unsupported('truncated PNG');
    if (type === 'acTL') throw unsupported('animated PNG');
    if (type === 'IEND') {
      if (hasNonZero(bytes, next)) throw unsupported('data after PNG end');
      return;
    }
    offset = next;
  }
  throw unsupported('truncated PNG');
}

/** WebP: RIFF size must match the payload; reject animation (ANIM/ANMF chunks). */
function checkWebpStructure(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffSize = view.getUint32(4, true);
  const end = 8 + riffSize;
  if (end > bytes.length) throw unsupported('truncated WebP');
  if (hasNonZero(bytes, end + (riffSize % 2))) throw unsupported('data after WebP end');
  let offset = 12;
  while (offset + 8 <= end) {
    const type = String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
    const size = view.getUint32(offset + 4, true);
    if (type === 'ANIM' || type === 'ANMF') throw unsupported('animated WebP');
    offset += 8 + size + (size % 2);
  }
}

/** JPEG: walk marker segments and entropy-coded scans to EOI; reject trailing payloads. */
function checkJpegStructure(bytes: Uint8Array): void {
  let offset = 2;
  const length = bytes.length;
  while (offset + 2 <= length) {
    if (bytes[offset] !== 0xff) throw unsupported('corrupt JPEG');
    let marker = bytes[offset + 1]!;
    while (marker === 0xff && offset + 2 < length) {
      offset += 1;
      marker = bytes[offset + 1]!;
    }
    if (marker === 0xd9) {
      if (hasNonZero(bytes, offset + 2)) throw unsupported('data after JPEG end');
      return;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > length) break;
    const segmentLength = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (segmentLength < 2) throw unsupported('corrupt JPEG');
    offset += 2 + segmentLength;
    if (marker === 0xda) {
      // Entropy-coded data: skip stuffed 0xFF00 and restart markers until the next marker.
      while (offset + 1 < length) {
        if (bytes[offset] === 0xff) {
          const next = bytes[offset + 1]!;
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7) || next === 0xff) {
            offset += next === 0xff ? 1 : 2;
            continue;
          }
          break;
        }
        offset += 1;
      }
    }
  }
  throw unsupported('truncated JPEG');
}

function mapSharpError(error: unknown): DomainError {
  const message = error instanceof Error ? error.message : '';
  if (/pixel limit|too large|dimensions/i.test(message)) return new DomainError('payload_too_large', 'Image dimensions exceed the limit.');
  return unsupported('image could not be decoded');
}

async function encode(input: Buffer, maxEdge: number, quality: number): Promise<EncodedVariant> {
  const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', pages: 1 })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height, bytes: data.length };
}

/** Validates and re-encodes an uploaded image. Throws `DomainError` for rejected input. */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) throw unsupported('empty file');
  if (input.length > MAX_UPLOAD_BYTES) throw new DomainError('payload_too_large', 'File exceeds the upload limit.');
  const format = detectImageFormat(input);
  if (!format) throw unsupported('not a JPEG, PNG or WebP image');
  if (format === 'png') checkPngStructure(input);
  else if (format === 'webp') checkWebpStructure(input);
  else checkJpegStructure(input);

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).metadata();
  } catch (error) {
    throw mapSharpError(error);
  }
  if (metadata.format !== format) throw unsupported('decoded format does not match the file signature');
  if ((metadata.pages ?? 1) > 1) throw unsupported('animated images are not supported');
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) throw unsupported('image has no dimensions');
  if (width > MAX_INPUT_EDGE || height > MAX_INPUT_EDGE || width * height > MAX_INPUT_PIXELS) {
    throw new DomainError('payload_too_large', 'Image dimensions exceed the limit.');
  }

  let full: EncodedVariant;
  let thumb: EncodedVariant;
  try {
    full = await encode(input, FULL_MAX_EDGE, 82);
    thumb = await encode(input, THUMB_MAX_EDGE, 78);
  } catch (error) {
    throw mapSharpError(error);
  }
  // Oriented dimensions of the source (EXIF orientation 5–8 swaps the axes).
  const swapped = (metadata.orientation ?? 1) >= 5;
  return {
    format,
    width: swapped ? height : width,
    height: swapped ? width : height,
    bytes: input.length,
    sha256: createHash('sha256').update(input).digest('hex'),
    full,
    thumb,
  };
}
