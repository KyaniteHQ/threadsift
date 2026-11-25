import type { Crypto } from "./crypto.ts";

const encoder = new TextEncoder();

export function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

export function prefixWithin(text: string, bytes: number): string {
  const { read } = encoder.encodeInto(text, new Uint8Array(Math.max(0, bytes)));

  return text.slice(0, read);
}

export function joinedBytes(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let at = 0;

  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }

  return joined;
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function base64url(bytes: Uint8Array): string {
  return bytes.toBase64({ alphabet: "base64url", omitPadding: true });
}

export function fromBase64url(text: string): Uint8Array {
  return Uint8Array.fromBase64(text, { alphabet: "base64url" });
}

export function digestOf(crypto: Crypto, value: string): string {
  return hex(crypto.sha256(value));
}

export function randomSecret(crypto: Crypto, bytes: number): string {
  return base64url(crypto.randomBytes(bytes));
}
