import { z } from "zod";

import type { RefusalCode } from "../../src/core/contract/access-contract.ts";
import type { Scope } from "../../src/core/contract/agent-token-contract.ts";
import type { PasswordProblem } from "../../src/core/contract/passwords.ts";
import type { SetupCodeProblem } from "../../src/core/contract/setup-code.ts";
import {
  CreatedTokenResponseSchema,
  ErrorResponseSchema,
  SessionStateSchema,
  TokenListResponseSchema,
  TokenSummaryResponseSchema,
  type Token,
} from "../../src/http/schemas.ts";
import { type JsonBody, call, callOk, del, parsedFrom, patch, post } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

export type Session = z.infer<typeof SessionStateSchema>;

export type Refusal =
  | { readonly kind: "wrong" }
  | { readonly kind: "locked"; readonly retryAfter: number }
  | { readonly kind: "unavailable"; readonly reason: SetupCodeProblem }
  | { readonly kind: "owner-exists" }
  | { readonly kind: "password"; readonly length: PasswordProblem }
  | { readonly kind: "used" }
  | { readonly kind: "no-owner" }
  | { readonly kind: "failed" };

export type Attempt = { readonly kind: "ok" } | Refusal;

const DEFAULT_RETRY_SECONDS = 60;
const NO_CONTENT = 204;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

const REFUSALS = {
  wrong: { kind: "wrong" },
  "owner-exists": { kind: "owner-exists" },
  "setup-missing": { kind: "unavailable", reason: "missing" },
  "setup-short": { kind: "unavailable", reason: "short" },
  "password-short": { kind: "password", length: "short" },
  "password-long": { kind: "password", length: "long" },
  "password-changed": { kind: "failed" },
  "reset-missing": { kind: "unavailable", reason: "missing" },
  "reset-short": { kind: "unavailable", reason: "short" },
  "reset-used": { kind: "used" },
  "no-owner": { kind: "no-owner" },
} as const satisfies Record<Exclude<RefusalCode, "locked">, Refusal>;

async function refusalOf(response: Response): Promise<Refusal> {
  const parsed = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
  const code = parsed.success ? parsed.data.code : undefined;

  if (code === undefined) {
    return { kind: "failed" };
  }

  if (code === "locked") {
    const seconds = Number(response.headers.get("retry-after"));

    return { kind: "locked", retryAfter: seconds > 0 ? seconds : DEFAULT_RETRY_SECONDS };
  }

  return REFUSALS[code];
}

async function attempt(path: string, json: JsonBody, signsOut = false): Promise<Attempt> {
  try {
    const response = await call(post(DATABASE_WRITE_DEADLINE_MS), path, { json, signsOut });

    return response.status === NO_CONTENT ? { kind: "ok" } : await refusalOf(response);
  } catch {
    return { kind: "failed" };
  }
}

export function fetchSession(signal: AbortSignal): Promise<Session> {
  return parsedFrom("GET", "/api/session", SessionStateSchema, { signsOut: false, signal });
}

export function checkSetupCode(code: string): Promise<Attempt> {
  return attempt("/api/setup/code", { code });
}

export function setUp(code: string, password: string): Promise<Attempt> {
  return attempt("/api/setup", { code, password });
}

export function logIn(password: string): Promise<Attempt> {
  return attempt("/api/login", { password });
}

export function changePassword(current: string, password: string): Promise<Attempt> {
  return attempt("/api/password", { current, password }, true);
}

export function resetPassword(code: string, password: string): Promise<Attempt> {
  return attempt("/api/password/reset", { code, password });
}

export async function logOut(): Promise<void> {
  await callOk(post(DATABASE_WRITE_DEADLINE_MS), "/api/logout", { tolerates: [UNAUTHORIZED] });
}

export async function fetchTokens(signal: AbortSignal): Promise<Token[]> {
  return (await parsedFrom("GET", "/api/tokens", TokenListResponseSchema, { signal })).tokens;
}

type CreatedToken = z.infer<typeof CreatedTokenResponseSchema>;

export function createToken(
  name: string,
  scopes: readonly Scope[],
  dailyBudget: number | null,
): Promise<CreatedToken> {
  return parsedFrom(post(DATABASE_WRITE_DEADLINE_MS), "/api/tokens", CreatedTokenResponseSchema, {
    json: { name, scopes, dailyBudget },
  });
}

export async function changeBudget(id: number, dailyBudget: number | null): Promise<Token> {
  const { token } = await parsedFrom(
    patch(DATABASE_WRITE_DEADLINE_MS),
    `/api/tokens/${id}`,
    TokenSummaryResponseSchema,
    {
      json: { dailyBudget },
    },
  );

  return token;
}

export async function revokeToken(id: number): Promise<void> {
  await callOk(del(DATABASE_WRITE_DEADLINE_MS), `/api/tokens/${id}`, { tolerates: [NOT_FOUND] });
}
