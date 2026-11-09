import type { ImageType } from "./image-type.ts";

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

const ASCII = new TextDecoder("latin1");

const JPEG_NOT_FRAME = new Set([0xc4, 0xc8, 0xcc]);

const FULL_BOX_HEADER = 4;

function sized(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

function pngSize(view: DataView): ImageSize | null {
  return sized(view.getUint32(16), view.getUint32(20));
}

function gifSize(view: DataView): ImageSize | null {
  return sized(view.getUint16(6, true), view.getUint16(8, true));
}

function isJpegFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && !JPEG_NOT_FRAME.has(marker);
}

const EXIF_ORIENTATION_TAG = 0x01_12;

const JPEG_EXIF = 0xe1;

function exifTurnsSideways(view: DataView, segment: number): boolean {
  const tiff = segment + 10;

  if (ASCII.decode(new Uint8Array(view.buffer, view.byteOffset + segment + 4, 4)) !== "Exif") {
    return false;
  }

  const little = view.getUint16(tiff) === 0x49_49;
  const directory = tiff + view.getUint32(tiff + 4, little);
  const entries = view.getUint16(directory, little);

  for (let entry = 0; entry < entries; entry += 1) {
    const at = directory + 2 + entry * 12;

    if (view.getUint16(at, little) === EXIF_ORIENTATION_TAG) {
      const orientation = view.getUint16(at + 8, little);

      return orientation >= 5 && orientation <= 8;
    }
  }

  return false;
}

function turned(size: ImageSize | null, sideways: boolean): ImageSize | null {
  return size !== null && sideways ? { width: size.height, height: size.width } : size;
}

function jpegSize(view: DataView): ImageSize | null {
  let at = 2;
  let sideways = false;

  while (at + 4 <= view.byteLength) {
    const marker = view.getUint8(at + 1);

    if (view.getUint8(at) !== 0xff || marker === 0xff) {
      at += 1;
    } else if (isJpegFrame(marker)) {
      return turned(sized(view.getUint16(at + 7), view.getUint16(at + 5)), sideways);
    } else {
      sideways ||= marker === JPEG_EXIF && exifTurnsSideways(view, at);
      at += marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9) ? 2 : 2 + view.getUint16(at + 2);
    }
  }

  return null;
}

function webpSize(view: DataView): ImageSize | null {
  const chunk = ASCII.decode(new Uint8Array(view.buffer, view.byteOffset + 12, 4));

  if (chunk === "VP8 ") {
    return sized(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  }

  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);

    return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }

  if (chunk === "VP8X") {
    const width = view.getUint16(24, true) + view.getUint8(26) * 0x1_00_00;
    const height = view.getUint16(27, true) + view.getUint8(29) * 0x1_00_00;

    return sized(width + 1, height + 1);
  }

  return null;
}

interface Box extends Span {
  readonly type: string;
}

function boxesOf(view: DataView, within: Span): readonly Box[] {
  const found: Box[] = [];
  let at = within.start;

  while (at + 8 <= within.end) {
    const size = view.getUint32(at);

    if (size < 8) break;

    found.push({
      type: ASCII.decode(new Uint8Array(view.buffer, view.byteOffset + at + 4, 4)),
      start: at + 8,
      end: Math.min(at + size, within.end),
    });
    at += size;
  }

  return found;
}

function inside(view: DataView, span: Span | null, type: string, skip = 0): Span | null {
  return span === null
    ? null
    : (boxesOf(view, { start: span.start + skip, end: span.end }).find(
        (box) => box.type === type,
      ) ?? null);
}

function primaryItemId(view: DataView, pitm: Span): number {
  return view.getUint8(pitm.start) === 0
    ? view.getUint16(pitm.start + FULL_BOX_HEADER)
    : view.getUint32(pitm.start + FULL_BOX_HEADER);
}

function propertyIndices(view: DataView, ipma: Span, item: number): readonly number[] {
  const version = view.getUint8(ipma.start);
  const wide = (view.getUint8(ipma.start + 3) & 1) === 1;
  const idBytes = version === 0 ? 2 : 4;
  let at = ipma.start + FULL_BOX_HEADER + 4;

  for (let entry = view.getUint32(ipma.start + FULL_BOX_HEADER); entry > 0; entry -= 1) {
    const id = idBytes === 2 ? view.getUint16(at) : view.getUint32(at);
    const count = view.getUint8(at + idBytes);
    const indices: number[] = [];

    at += idBytes + 1;

    for (let association = 0; association < count; association += 1) {
      indices.push(wide ? view.getUint16(at) & 0x7f_ff : view.getUint8(at) & 0x7f);
      at += wide ? 2 : 1;
    }

    if (id === item) return indices;
  }

  return [];
}

function avifSize(view: DataView): ImageSize | null {
  const meta = inside(view, { start: 0, end: view.byteLength }, "meta");
  const pitm = inside(view, meta, "pitm", FULL_BOX_HEADER);
  const iprp = inside(view, meta, "iprp", FULL_BOX_HEADER);
  const ipco = inside(view, iprp, "ipco");
  const ipma = inside(view, iprp, "ipma");

  if (pitm === null || ipco === null || ipma === null) return null;

  const properties = boxesOf(view, ipco);

  const own = propertyIndices(view, ipma, primaryItemId(view, pitm)).flatMap((index) => {
    const property = properties[index - 1];

    return property === undefined ? [] : [property];
  });

  const extent = own.find(({ type }) => type === "ispe");
  const rotation = own.find(({ type }) => type === "irot");

  return extent === undefined
    ? null
    : turned(
        sized(
          view.getUint32(extent.start + FULL_BOX_HEADER),
          view.getUint32(extent.start + FULL_BOX_HEADER + 4),
        ),
        rotation !== undefined && (view.getUint8(rotation.start) & 1) === 1,
      );
}

const READERS: Readonly<Record<ImageType, (view: DataView) => ImageSize | null>> = {
  "image/png": pngSize,
  "image/gif": gifSize,
  "image/jpeg": jpegSize,
  "image/webp": webpSize,
  "image/avif": avifSize,
};

export function imageSize(bytes: Uint8Array, type: ImageType): ImageSize | null {
  try {
    return READERS[type](new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch (error) {
    if (error instanceof RangeError) return null;

    throw error;
  }
}
