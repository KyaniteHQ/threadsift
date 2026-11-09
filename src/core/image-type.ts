import { mediaTypeOf } from "./body-text.ts";

export const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];

export const IMAGE_EXTENSIONS: Readonly<Record<ImageType, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

const DECLARED: ReadonlyMap<string, ImageType> = new Map([
  ["image/jpg", "image/jpeg"],
  ...IMAGE_TYPES.map((type): [string, ImageType] => [type, type]),
]);

const AVIF_BRANDS: ReadonlySet<string> = new Set(["avif", "avis"]);

const BRAND_SCAN_BYTES = 64;

const ASCII = new TextDecoder("latin1");

export function declaredImageType(contentType: string | null): ImageType | null {
  return DECLARED.get(mediaTypeOf(contentType)) ?? null;
}

function startsWith(bytes: Uint8Array, pattern: readonly number[], from = 0): boolean {
  return pattern.every((byte, at) => bytes[from + at] === byte);
}

function isGif(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  );
}

function isAvif(bytes: Uint8Array): boolean {
  if (ASCII.decode(bytes.subarray(4, 8)) !== "ftyp") return false;

  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  const box = bytes.subarray(8, Math.min(size, BRAND_SCAN_BYTES));
  const brands = [ASCII.decode(box.subarray(0, 4))];

  for (let at = 8; at + 4 <= box.length; at += 4) {
    brands.push(ASCII.decode(box.subarray(at, at + 4)));
  }

  return brands.some((brand) => AVIF_BRANDS.has(brand));
}

export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  if (isGif(bytes)) return "image/gif";

  const riff =
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50, 0x56, 0x50], 8);

  if (riff) return "image/webp";

  return bytes.length >= 16 && isAvif(bytes) ? "image/avif" : null;
}
