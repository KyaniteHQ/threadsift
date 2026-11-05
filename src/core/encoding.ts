import type { Crypto } from "./ports.ts";

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function fromBase64url(text: string): Uint8Array {
  const padded = text
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");

  return Uint8Array.from(atob(padded), (character) => character.codePointAt(0) ?? 0);
}

export function digestOf(crypto: Crypto, value: string): string {
  return hex(crypto.sha256(value));
}

export function randomSecret(crypto: Crypto, bytes: number): string {
  return base64url(crypto.randomBytes(bytes));
}
