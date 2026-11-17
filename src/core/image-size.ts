import type { ImageType } from "./image-type.ts";

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

const ASCII = new TextDecoder("latin1");

const JPEG_NOT_FRAME = new Set([0xc4, 0xc8, 0xcc]);

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

function jpegSize(view: DataView): ImageSize | null {
  let at = 2;

  while (at + 4 <= view.byteLength) {
    const marker = view.getUint8(at + 1);

    if (view.getUint8(at) !== 0xff || marker === 0xff) {
      at += 1;
    } else if (isJpegFrame(marker)) {
      return sized(view.getUint16(at + 7), view.getUint16(at + 5));
    } else {
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

const READERS: Readonly<Record<ImageType, (view: DataView) => ImageSize | null>> = {
  "image/png": pngSize,
  "image/gif": gifSize,
  "image/jpeg": jpegSize,
  "image/webp": webpSize,
  "image/avif": () => null,
};

export function imageSize(bytes: Uint8Array, type: ImageType): ImageSize | null {
  try {
    return READERS[type](new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch (error) {
    if (error instanceof RangeError) return null;

    throw error;
  }
}
