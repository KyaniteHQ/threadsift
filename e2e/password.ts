import { randomBytes } from "node:crypto";

import {
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
  expect,
} from "@playwright/test";
import { z } from "zod";

import { FIELDS, PASSWORD } from "../web/src/access-text.ts";
import { cookieHeader, sha256Hex } from "./access-helpers.ts";
import { type Instance, SESSION_COOKIE, anonymous, sessionValueOf } from "./access.ts";

export const RESET_CODE_MINIMUM = 32;
export const WRONG_ATTEMPTS = 10;

const RESET_CODE_BYTES = 24;

export function newResetCode(): string {
  return randomBytes(RESET_CODE_BYTES).toString("base64url");
}

export function shortResetCode(): string {
  return newResetCode().slice(0, RESET_CODE_MINIMUM - 1);
}

export function resetEnv(code: string) {
  return { PASSWORD_RESET_CODE: code };
}

const Digests = z.array(z.object({ digest: z.string() }));
const Hashes = z.array(z.object({ password_hash: z.string() }));
const Throttles = z.array(z.object({ kind: z.string(), failures: z.number() }));

function digestsOf(instance: Instance, table: "sessions" | "spent_reset_codes"): string[] {
  return instance
    .query(`SELECT digest FROM ${table} ORDER BY digest`, Digests)
    .map((row) => row.digest);
}

export function storedSessions(instance: Instance): string[] {
  return digestsOf(instance, "sessions");
}

export function ownerHash(instance: Instance): string {
  const [row] = instance.query("SELECT password_hash FROM owner", Hashes);

  return row?.password_hash ?? "";
}

export function ownerHashDigest(instance: Instance): string {
  return sha256Hex(ownerHash(instance));
}

export function throttleRows(instance: Instance) {
  return instance.query("SELECT kind, failures FROM throttles ORDER BY kind", Throttles);
}

export function spentCodes(instance: Instance): string[] {
  return digestsOf(instance, "spent_reset_codes");
}

export function changeCall(
  api: APIRequestContext,
  headers: Readonly<Record<string, string>>,
  current: string,
  password: string,
): Promise<APIResponse> {
  return api.post("/api/password", { data: { current, password }, headers });
}

export function resetCall(
  api: APIRequestContext,
  code: string,
  password: string,
): Promise<APIResponse> {
  return api.post("/api/password/reset", { data: { code, password } });
}

export function setCookieLines(response: APIResponse): string[] {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value);
}

export interface Signed {
  readonly value: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly api: APIRequestContext;
}

export async function signInWith(url: string, password: string): Promise<Signed> {
  const api = await anonymous(url);
  const response = await api.post("/api/login", { data: { password } });
  expect(response.status(), "login through the API").toBe(204);
  const value = sessionValueOf(response.headers()["set-cookie"] ?? "");

  return { value, headers: cookieHeader(value), api };
}

export async function cookieValue(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find((entry) => entry.name === SESSION_COOKIE);

  return cookie?.value ?? "";
}

export async function openOwner(
  browser: Browser,
  instance: Instance,
  password: string,
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: instance.url });
  const response = await context.request.post("/api/login", { data: { password } });
  expect(response.status(), "login through the API").toBe(204);

  return context;
}

export function passwordSection(page: Page) {
  return page.getByRole("region", { name: PASSWORD.title, exact: true });
}

export async function fillChange(
  page: Page,
  current: string,
  next: string,
  confirm = next,
): Promise<void> {
  const section = passwordSection(page);
  await section.getByLabel(PASSWORD.current, { exact: true }).fill(current);
  await section.getByLabel(PASSWORD.new, { exact: true }).fill(next);
  await section.getByLabel(FIELDS.confirmPassword, { exact: true }).fill(confirm);
  await section.getByRole("button", { name: PASSWORD.change }).click();
}

export function addMovingTrigger(
  instance: Instance,
  extra = "",
  kind: "login" | "reset" = "login",
): () => void {
  const original = ownerHash(instance);

  instance.sql(
    `CREATE TRIGGER password_moves AFTER DELETE ON throttles WHEN OLD.kind = '${kind}' BEGIN UPDATE owner SET password_hash = password_hash || 'x' WHERE id = 1;${extra} END`,
  );

  return () => {
    instance.sql("DROP TRIGGER password_moves");
    instance.sql(`UPDATE owner SET password_hash = '${original}'`);
  };
}
