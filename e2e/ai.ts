import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { type Browser, expect } from "@playwright/test";

import { AI_TEXT } from "../web/src/ai-text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";

export const PROOF_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export async function aiScreen(browser: Browser, secret: string | undefined): Promise<FreshScreen> {
  const previous = process.env["THREADSIFT_SECRET_KEY"];

  if (secret === undefined) delete process.env["THREADSIFT_SECRET_KEY"];
  else process.env["THREADSIFT_SECRET_KEY"] = secret;

  try {
    return await openSignedIn(browser, newCode(), newPassword());
  } finally {
    if (previous === undefined) delete process.env["THREADSIFT_SECRET_KEY"];
    else process.env["THREADSIFT_SECRET_KEY"] = previous;
  }
}

export function newSealingKey(): string {
  return randomBytes(32).toString("hex");
}

export function proofProvider() {
  const key = process.env["CLOUDFLARE_WORKERS_AI_TOKEN"];
  const account = process.env["CLOUDFLARE_ACCOUNT_ID"];

  if (key === undefined || account === undefined) throw new Error("Workers AI credentials missing");

  return {
    key,
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1`,
    model: PROOF_MODEL,
    provider: "openai-compatible",
  };
}

export async function saveInBrowser(
  screen: FreshScreen,
  key: string,
  baseUrl: string,
  model = PROOF_MODEL,
): Promise<void> {
  const { page } = screen;
  await page.goto("/settings");
  await page.getByLabel(AI_TEXT.baseUrl, { exact: true }).fill(baseUrl);
  await page.getByLabel(AI_TEXT.model, { exact: true }).fill(model);
  await page.getByLabel(AI_TEXT.key, { exact: true }).evaluate((input, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, key);
  await page.getByRole("button", { name: AI_TEXT.save, exact: true }).click();
  await expect(page.getByText(AI_TEXT.saved, { exact: true })).toBeVisible();
  await expect(page.getByLabel(AI_TEXT.key, { exact: true })).toHaveValue("");
}

export function assertNoSecret(text: string, keys: readonly string[]): void {
  expect(
    keys.some((key) => text.includes(key)),
    "no key value in the captured bytes",
  ).toBe(false);
  expect(/authorization/iu.test(text), "no credential header in the captured bytes").toBe(false);
}

export function searchArtifacts(dir: string, keys: readonly string[]): number {
  let count = 0;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) count += searchArtifacts(path, keys);
    else {
      assertNoSecret(readFileSync(path).toString("utf8"), keys);
      count += 1;
    }
  }

  return count;
}

export function aiCall(
  screen: FreshScreen,
  method: string,
  path: string,
  body?: string,
): Promise<string> {
  return screen.page.evaluate(
    async ({ method: verb, path: route, body: data }) => {
      const init: RequestInit = { method: verb, headers: { "content-type": "application/json" } };

      if (data !== undefined) init.body = data;
      const response = await fetch(route, init);

      return response.text();
    },
    { method, path, body },
  );
}
