import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import type { Crypto } from "../../core/ports.ts";

const SCRYPT_KEY_BYTES = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export const nodeCrypto: Crypto = {
  randomBytes: (length) => new Uint8Array(randomBytes(length)),
  sha256: (value) => new Uint8Array(createHash("sha256").update(value).digest()),
  scrypt: (password, salt, { N, r, p }) =>
    new Promise((resolve, reject) => {
      scrypt(password, salt, SCRYPT_KEY_BYTES, { N, r, p, maxmem: SCRYPT_MAXMEM }, (error, key) => {
        if (error === null) {
          resolve(new Uint8Array(key));
        } else {
          reject(error);
        }
      });
    }),
  equal: (left, right) => left.length === right.length && timingSafeEqual(left, right),
};
