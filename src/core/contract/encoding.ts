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

const BASE64_CHUNK_BYTES = 32_768;

export function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let at = 0; at < bytes.length; at += BASE64_CHUNK_BYTES)
    text += String.fromCodePoint(...bytes.subarray(at, at + BASE64_CHUNK_BYTES));
  return btoa(text);
}

export function base64url(bytes: Uint8Array): string {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function fromBase64url(text: string): Uint8Array {
  const padded = text
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");

  return fromBase64(padded);
}

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.codePointAt(0) ?? 0);
}

export function digestOf(crypto: Crypto, value: string): string {
  return hex(crypto.sha256(value));
}

export function randomSecret(crypto: Crypto, bytes: number): string {
  return base64url(crypto.randomBytes(bytes));
}
