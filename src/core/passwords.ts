import { base64url, fromBase64url } from "./encoding.ts";
import type { Crypto, ScryptCost } from "./ports.ts";

export const PASSWORD_MIN = 15;
export const PASSWORD_MAX = 1024;

const COST: ScryptCost = { N: 32_768, r: 8, p: 3 };
const SALT_BYTES = 16;
const HASH_PATTERN = /^scrypt\$N=(\d+)\$r=(\d+)\$p=(\d+)\$([\w-]+)\$([\w-]+)$/u;

export const PASSWORD_PROBLEMS = ["short", "long"] as const;

export type PasswordProblem = (typeof PASSWORD_PROBLEMS)[number];

export type PasswordLength = "ok" | PasswordProblem;

function normalized(password: string): string {
  return password.normalize("NFKC");
}

export function passwordLength(password: string): PasswordLength {
  const { length } = Array.from(normalized(password));

  if (length < PASSWORD_MIN) {
    return "short";
  }

  return length > PASSWORD_MAX ? "long" : "ok";
}

export async function hashPassword(crypto: Crypto, password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await crypto.scrypt(normalized(password), salt, COST);

  return `scrypt$N=${COST.N}$r=${COST.r}$p=${COST.p}$${base64url(salt)}$${base64url(key)}`;
}

export async function passwordMatches(
  crypto: Crypto,
  password: string,
  stored: string,
): Promise<boolean> {
  const [, n, r, p, salt, key] = HASH_PATTERN.exec(stored) ?? [];

  if (n === undefined || r === undefined || p === undefined || salt === undefined) {
    return false;
  }

  const expected = fromBase64url(key ?? "");
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  const derived = await crypto.scrypt(normalized(password), fromBase64url(salt), cost);

  return crypto.equal(derived, expected);
}
