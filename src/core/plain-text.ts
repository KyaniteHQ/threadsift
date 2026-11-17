import { z } from "zod";

const PLAIN_TEXT = /^[^\[\]\{\}"\r\n]+$/v;

const CONTROL_CHARACTER = /\p{Cc}/u;

export function isReadableText(text: string): boolean {
  return text.isWellFormed() && !CONTROL_CHARACTER.test(text);
}

export function plainText(max: number) {
  return z.string().trim().min(1).max(max).regex(PLAIN_TEXT);
}
