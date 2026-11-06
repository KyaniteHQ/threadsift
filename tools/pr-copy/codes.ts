import { randomBytes } from "node:crypto";

const CODE_BYTES = 24;

export interface AccessCodes {
  readonly setup: string;
  readonly reset: string;
}

function newCode(): string {
  return randomBytes(CODE_BYTES).toString("base64url");
}

export function newAccessCodes(): AccessCodes {
  return { setup: newCode(), reset: newCode() };
}
