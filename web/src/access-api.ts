import { z } from "zod";

import {
  CreatedTokenResponseSchema,
  ErrorResponseSchema,
  SessionStateSchema,
  TokenListResponseSchema,
  type Token,
} from "../../src/http/schemas.ts";
import { ownerFetch, ownerGetOk } from "./session.ts";

export type SessionState = z.infer<typeof SessionStateSchema>["state"];

export type Refusal =
  | { readonly kind: "wrong" }
  | { readonly kind: "locked"; readonly retryAfter: number }
  | { readonly kind: "unavailable"; readonly reason: "missing" | "short" }
  | { readonly kind: "owner-exists" }
  | { readonly kind: "password"; readonly length: "short" | "long" }
  | { readonly kind: "failed" };

export type Attempt = { readonly kind: "ok" } | Refusal;

const DEFAULT_RETRY_SECONDS = 60;
const NO_CONTENT = 204;
const JSON_HEADERS = { "content-type": "application/json" } as const;

function post(path: string, json: string): Promise<Response> {
  return fetch(path, { method: "POST", headers: JSON_HEADERS, body: json });
}

async function refusalOf(response: Response): Promise<Refusal> {
  if (response.status === 401) {
    return { kind: "wrong" };
  }

  if (response.status === 409) {
    return { kind: "owner-exists" };
  }

  if (response.status === 429) {
    const seconds = Number(response.headers.get("retry-after"));

    return { kind: "locked", retryAfter: seconds > 0 ? seconds : DEFAULT_RETRY_SECONDS };
  }

  const parsed = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
  const setup = parsed.success ? parsed.data.setup : undefined;

  if (response.status === 503 && setup !== undefined) {
    return { kind: "unavailable", reason: setup };
  }

  const length = parsed.success ? parsed.data.password : undefined;

  if (response.status === 400 && length !== undefined) {
    return { kind: "password", length };
  }

  return { kind: "failed" };
}

async function attempt(path: string, json: string): Promise<Attempt> {
  try {
    const response = await post(path, json);

    return response.status === NO_CONTENT ? { kind: "ok" } : await refusalOf(response);
  } catch {
    return { kind: "failed" };
  }
}

export async function fetchSessionState(): Promise<SessionState> {
  const response = await fetch("/api/session");

  if (!response.ok) {
    throw new Error(`GET /api/session answered ${response.status}`);
  }

  return SessionStateSchema.parse(await response.json()).state;
}

export function checkSetupCode(code: string): Promise<Attempt> {
  return attempt("/api/setup/code", JSON.stringify({ code }));
}

export function setUp(code: string, password: string): Promise<Attempt> {
  return attempt("/api/setup", JSON.stringify({ code, password }));
}

export function logIn(password: string): Promise<Attempt> {
  return attempt("/api/login", JSON.stringify({ password }));
}

export async function logOut(): Promise<void> {
  await fetch("/api/logout", { method: "POST", headers: JSON_HEADERS, body: "{}" });
}

export async function fetchTokens(): Promise<Token[]> {
  const response = await ownerGetOk("/api/tokens");

  return TokenListResponseSchema.parse(await response.json()).tokens;
}

export async function createToken(
  name: string,
): Promise<z.infer<typeof CreatedTokenResponseSchema>> {
  const response = await ownerFetch("/api/tokens", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });

  if (response.status !== 201) {
    throw new Error(`POST /api/tokens answered ${response.status}`);
  }

  return CreatedTokenResponseSchema.parse(await response.json());
}

export async function revokeToken(id: number): Promise<void> {
  const response = await ownerFetch(`/api/tokens/${id}`, {
    method: "DELETE",
    headers: JSON_HEADERS,
    body: "{}",
  });

  if (response.status !== NO_CONTENT) {
    throw new Error(`DELETE /api/tokens/${id} answered ${response.status}`);
  }
}
