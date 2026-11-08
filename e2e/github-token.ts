import {
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
  type TestInfo,
  expect,
} from "@playwright/test";
import { z } from "zod";

import { GITHUB_TEXT } from "../web/src/github-text.ts";
import { TOKEN_REFUSED } from "../web/src/text.ts";
import { mainInstance } from "./access.ts";
import { postLinkRaw, settled } from "./api.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import {
  DEFUDDLE,
  GITHUB_SETTINGS_ENDPOINT,
  STALE,
  removeGithubToken,
  storedOf,
} from "./github.ts";
import { jobsOf } from "./ingest.ts";
import { rowOf } from "./links.ts";

export { GITHUB_SETTINGS_ENDPOINT };

export const GITHUB_VERIFY_ENDPOINT = `${GITHUB_SETTINGS_ENDPOINT}/verify`;

export const GITHUB_TOKEN_CAP = 4096;

export const ANONYMOUS_LIMIT = 60;

export function githubSection(page: Page): Locator {
  return page.getByRole("region", { name: GITHUB_TEXT.sectionTitle, exact: true });
}

export async function fillToken(page: Page, token: string): Promise<void> {
  await githubSection(page)
    .getByLabel(GITHUB_TEXT.fieldLabel, { exact: true })
    .evaluate((input, value) => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      descriptor?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, token);
}

export async function pressGithub(page: Page, name: string, method: string): Promise<string> {
  const answered = page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      new URL(response.url()).pathname.startsWith(GITHUB_SETTINGS_ENDPOINT),
  );

  await githubSection(page).getByRole("button", { name, exact: true }).click();

  const response = await answered;
  const text = await response.text();
  await response.finished();

  return text;
}

export async function saveInScreen(page: Page, token: string): Promise<string> {
  await fillToken(page, token);

  const raw = await pressGithub(page, GITHUB_TEXT.save, "PUT");

  await expect(githubSection(page).getByLabel(GITHUB_TEXT.fieldLabel, { exact: true })).toHaveValue(
    "",
  );

  return raw;
}

const SealedRows = z.array(z.object({ value: z.string() }));

export function sealedGithubToken(screen: FreshScreen): string | undefined {
  return screen.fresh.query("SELECT sealed_token AS value FROM github_settings", SealedRows)[0]
    ?.value;
}

const Counts = z.array(z.object({ count: z.number() }));

export function githubRows(screen: FreshScreen): number {
  return (
    screen.fresh.query("SELECT count(*) AS count FROM github_settings", Counts)[0]?.count ?? -1
  );
}

const AiRows = z.array(
  z.object({ provider: z.string(), model: z.string(), sealed_key: z.string() }),
);

export function aiRow(screen: FreshScreen) {
  return screen.fresh.query("SELECT provider, model, sealed_key FROM settings", AiRows);
}

export function expectNoToken(captured: string, tokens: readonly string[]): void {
  expect(
    tokens.some((token) => captured.includes(token)),
    "no token value in the captured bytes",
  ).toBe(false);
}

export async function jsonOf<Schema extends z.ZodType>(
  response: APIResponse,
  schema: Schema,
  status = 200,
): Promise<z.output<Schema>> {
  expect(response.status()).toBe(status);

  return schema.parse(await response.json());
}

export async function attach(info: TestInfo, name: string, body: string): Promise<void> {
  await info.attach(name, { body, contentType: "text/plain" });
}

export async function expectSavedRepositoryKept(
  page: Page,
  request: APIRequestContext,
  id: number,
  word: string,
): Promise<void> {
  const item = await settled(request, id);

  expect(item).toMatchObject({
    id,
    status: "ready",
    fetch: "github-token",
    title: STALE.title,
    postText: `${STALE.readme} ${word}`,
    stars: STALE.stars,
  });
  expect(item.repository).toMatchObject({
    description: `${STALE.description} ${word}`,
    stars: STALE.stars,
    language: STALE.language,
    license: STALE.license,
    topics: [STALE.topic],
  });
  expect(storedOf(id).repository).toHaveLength(1);
  expect(jobsOf(id).map((job) => job.state)).toEqual(["done"]);

  await expect(rowOf(page, id).locator(".it-fail")).toContainText(TOKEN_REFUSED.row);
  await expect(
    rowOf(page, id).getByRole("link", { name: TOKEN_REFUSED.link, exact: true }),
  ).toHaveAttribute("href", "/settings");

  await page.goto(`/items/${id}`);
  await expect(page.locator(".rd-note", { hasText: TOKEN_REFUSED.reader })).toBeVisible();
  await page
    .locator(".rd-col")
    .getByRole("link", { name: TOKEN_REFUSED.link, exact: true })
    .click();
  await expect(githubSection(page)).toBeVisible();
}

export async function expectAnonymousRead(request: APIRequestContext, id: number): Promise<void> {
  await removeGithubToken(request);
  expect((await postLinkRaw(request, DEFUDDLE)).status).toBe(200);

  const read = await settled(request, id);

  expect(read).toMatchObject({ id, status: "ready", fetch: "ok", title: "kepano/defuddle" });
  expect(read.postText).toContain("Defuddle");
  expect(read.postText).not.toContain("stale");
}

export function mainLog(): string {
  return mainInstance().logs();
}
