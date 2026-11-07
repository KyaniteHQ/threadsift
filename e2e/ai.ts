import { createDecipheriv, randomBytes } from "node:crypto";

import { type Browser, type Locator, type Page, expect } from "@playwright/test";
import { z } from "zod";

import { DigestSchema } from "../src/core/ai-contract.ts";
import { PROOF_MODEL, workersAiUrl } from "../tools/workers-ai-proof.ts";
import { AI_TEXT } from "../web/src/ai-text.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";

export async function screenWithEnv(
  browser: Browser,
  name: string,
  value: string | undefined,
): Promise<FreshScreen> {
  const previous = process.env[name];

  if (value === undefined) delete process.env[name];
  else process.env[name] = value;

  try {
    return await openSignedIn(browser, newCode(), newPassword());
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

export function aiScreen(browser: Browser, secret?: string): Promise<FreshScreen> {
  return screenWithEnv(browser, "THREADSIFT_SECRET_KEY", secret);
}

export function aiSecretMissing(page: Page): Locator {
  return page
    .getByRole("region", { name: AI_TEXT.title, exact: true })
    .getByText(AI_TEXT["secret-missing"], { exact: true });
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
    baseUrl: workersAiUrl(account),
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
  await fillKey(page, key);
  await saveAndExpectKeyCleared(page);
}

export async function fillKey(page: Page, key: string): Promise<void> {
  await page.getByLabel(AI_TEXT.key, { exact: true }).evaluate((input, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, key);
}

export async function saveAndExpectKeyCleared(page: Page): Promise<void> {
  await pressKeepingFocus(page.getByRole("button", { name: AI_TEXT.save, exact: true }));
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

export function openSealed(value: string, secret: string): string {
  const [version, iv, ciphertext] = value.split(".");
  expect(version).toBe("v1");
  const encrypted = Buffer.from(ciphertext ?? "", "base64url");
  expect(Buffer.from(iv ?? "", "base64url").length).toBe(12);

  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(secret, "hex"),
    Buffer.from(iv ?? "", "base64url"),
  );

  decipher.setAuthTag(encrypted.subarray(-16));

  return Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString(
    "utf8",
  );
}

export function expectDigest(
  digest: Readonly<{
    title: string;
    topic: string;
    tags: readonly string[];
    summary: string;
    keyPoints: readonly string[];
  }>,
): void {
  expect(digest.title.trim().length).toBeGreaterThan(0);
  expect(digest.topic.trim().length).toBeGreaterThan(0);
  expect(digest.tags.length).toBeLessThanOrEqual(3);
  expect(digest.summary.split(/\r\n|\r|\n/u).length).toBeLessThanOrEqual(2);
  expect(digest.keyPoints.length).toBeGreaterThanOrEqual(1);
  expect(digest.title.toLowerCase()).not.toContain("notebook weekly");
}

export async function pressKeepingFocus(
  button: Locator,
  endpoint = AI_SETTINGS_ENDPOINT,
): Promise<void> {
  await button.focus();
  await button.evaluate((element) => {
    element.dataset["focusProof"] = "held";
    element.addEventListener(
      "blur",
      () => {
        element.dataset["focusProof"] = "lost";
      },
      { once: true },
    );
  });

  const response = button
    .page()
    .waitForResponse((answer) => answer.url().endsWith(endpoint), { timeout: 120_000 });

  await button.press("Enter");
  await (await response).finished();
  await expect(button.locator("xpath=ancestor::form")).toHaveAttribute("aria-busy", "false");
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("data-focus-proof", "held");
}

function aiCall(screen: FreshScreen, method: string, path: string, body?: string): Promise<string> {
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

export const AI_SETTINGS_ENDPOINT = "/api/settings/ai";
export const AI_VERIFY_ENDPOINT = `${AI_SETTINGS_ENDPOINT}/verify`;

export function countRows(screen: FreshScreen, table: string): number {
  return (
    screen.fresh.query(
      `SELECT count(*) AS count FROM ${table}`,
      z.array(z.object({ count: z.number() })),
    )[0]?.count ?? -1
  );
}

export function sealedKey(screen: FreshScreen): string {
  return (
    screen.fresh.query(
      "SELECT sealed_key AS value FROM settings",
      z.array(z.object({ value: z.string() })),
    )[0]?.value ?? ""
  );
}

export async function aiJson<Result>(
  screen: FreshScreen,
  schema: z.ZodType<Result>,
  method: string,
  path: string,
  body?: string,
): Promise<Result> {
  return schema.parse(JSON.parse(await aiCall(screen, method, path, body)));
}

export function putSettings<Result>(
  screen: FreshScreen,
  schema: z.ZodType<Result>,
  body: Readonly<Record<string, string>>,
): Promise<Result> {
  return aiJson(screen, schema, "PUT", AI_SETTINGS_ENDPOINT, JSON.stringify(body));
}

export function readDigestTask(screen: FreshScreen) {
  const task = screen.fresh.query(
    "SELECT kind, executor, input_revision AS inputRevision, item_id AS itemId, deadline, state, result, attempts FROM ai_tasks",
    z.array(
      z.object({
        kind: z.string(),
        executor: z.string(),
        inputRevision: z.number(),
        itemId: z.number().nullable(),
        deadline: z.number(),
        state: z.string(),
        result: z.string(),
        attempts: z.number(),
      }),
    ),
  );

  expect(task[0]).toMatchObject({
    kind: "digest",
    executor: "http",
    inputRevision: 1,
    itemId: null,
    state: "done",
    attempts: 1,
  });
  expect(task[0]?.deadline ?? 0).toBeGreaterThan(Date.now());

  return DigestSchema.parse(JSON.parse(task[0]?.result ?? "null"));
}

export function hasAiCredentials(): boolean {
  return (
    (process.env["CLOUDFLARE_WORKERS_AI_TOKEN"] ?? "") !== "" &&
    (process.env["CLOUDFLARE_ACCOUNT_ID"] ?? "") !== ""
  );
}

export function wrongAiKey(): string {
  return process.env["THREADSIFT_WRONG_AI_KEY"] ?? newSealingKey();
}
