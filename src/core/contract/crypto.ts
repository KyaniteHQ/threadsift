export interface ScryptCost {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

export interface Crypto {
  readonly randomBytes: (length: number) => Uint8Array;
  readonly sha256: (value: string) => Uint8Array;
  readonly scrypt: (password: string, salt: Uint8Array, cost: ScryptCost) => Promise<Uint8Array>;
  readonly equal: (left: Uint8Array, right: Uint8Array) => boolean;
}
