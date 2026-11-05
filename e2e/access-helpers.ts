import { createHash } from "node:crypto";

import { type APIRequestContext, type APIResponse, expect } from "@playwright/test";
import { z } from "zod";

import { SESSION_COOKIE, anonymous, ownerPassword, sessionValueOf } from "./access.ts";

export const MAX_AGE = 2_592_000;
export const DAY_MS = 86_400_000;

export const ErrorBody = z.object({ error: z.string().min(1) });

export const CreatedToken = z.object({
  token: z.object({ id: z.number(), name: z.string(), lastUsedAt: z.number().nullable() }),
  value: z.string(),
});

export const ListedTokens = z.object({
  tokens: z.array(z.object({ id: z.number(), lastUsedAt: z.number().nullable() })),
});

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function cookieHeader(value: string) {
  return { cookie: `${SESSION_COOKIE}=${value}` };
}

export async function expectRefusal(
  response: APIResponse,
  status: number,
  what: string,
): Promise<void> {
  expect(response.status(), what).toBe(status);
  expect(ErrorBody.safeParse(await response.json()).success, `${what}: a JSON { error }`).toBe(
    true,
  );
}

export async function createToken(request: APIRequestContext, name: string) {
  const response = await request.post("/api/tokens", { data: { name } });
  expect(response.status()).toBe(201);

  return CreatedToken.parse(await response.json());
}

export async function signIn(baseURL: string) {
  const api = await anonymous(baseURL);
  const response = await api.post("/api/login", { data: { password: ownerPassword() } });
  expect(response.status()).toBe(204);
  const value = sessionValueOf(response.headers()["set-cookie"] ?? "");

  return { value, headers: cookieHeader(value), api };
}
