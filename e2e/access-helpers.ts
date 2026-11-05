import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";

import { type APIRequestContext, type APIResponse, expect } from "@playwright/test";
import { z } from "zod";

import type { RefusalCode } from "../src/http/schemas.ts";
import { SAME_ORIGIN, SESSION_COOKIE, anonymous, ownerPassword, sessionValueOf } from "./access.ts";

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
  code?: RefusalCode,
): Promise<void> {
  expect(response.status(), what).toBe(status);
  const body = ErrorBody.extend({ code: z.string().optional() }).safeParse(await response.json());
  expect(body.success, `${what}: a JSON { error }`).toBe(true);

  if (code !== undefined) {
    expect(body.data?.code, `${what}: code`).toBe(code);
  }
}

export async function createToken(request: APIRequestContext, name: string) {
  const response = await request.post("/api/tokens", { data: { name } });
  expect(response.status()).toBe(201);

  return CreatedToken.parse(await response.json());
}

export function revokeToken(request: APIRequestContext, id: number): Promise<APIResponse> {
  return request.delete(`/api/tokens/${id}`, { headers: SAME_ORIGIN });
}

export async function signIn(baseURL: string) {
  const api = await anonymous(baseURL);
  const response = await api.post("/api/login", { data: { password: ownerPassword() } });
  expect(response.status()).toBe(204);
  const value = sessionValueOf(response.headers()["set-cookie"] ?? "");

  return { value, headers: cookieHeader(value), api };
}

export function getRaw(
  baseURL: string,
  path: string,
  headers: Readonly<Record<string, string>>,
): Promise<{ readonly status: number; readonly body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(new URL(path, baseURL), { headers }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      incoming.on("end", () => {
        resolve({ status: incoming.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
      });
    });

    outgoing.on("error", reject);
    outgoing.end();
  });
}
