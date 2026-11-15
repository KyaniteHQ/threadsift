const POLYNOMIAL = 0xed_b8_83_20;

const TABLE = Uint32Array.from({ length: 256 }, (_, start) => {
  let value = start;

  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? POLYNOMIAL ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

export function crc32(bytes: Uint8Array, previous = 0): number {
  let crc = (previous ^ 0xff_ff_ff_ff) >>> 0;

  for (let at = 0; at < bytes.length; at += 1) {
    crc = (TABLE[(crc ^ (bytes[at] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }

  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}
