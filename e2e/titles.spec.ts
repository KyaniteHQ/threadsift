import { setTimeout as sleep } from "node:timers/promises";

import { expect, test } from "@playwright/test";

import { listAll, postLink } from "./api.ts";
import { newRunId, pasteLink } from "./links.ts";

const ACCEPT_ENCODING = "gzip, deflate, br";

async function encodingOf(url: string): Promise<string | null> {
  const response = await fetch(url, { headers: { "accept-encoding": ACCEPT_ENCODING } });
  await response.body?.cancel();

  return response.headers.get("content-encoding");
}

test("a pasted page gets its title and its row shows it", async ({ page, request }) => {
  await page.goto("/");
  await pasteLink(page, "https://example.com/");

  const saved = (await listAll(request)).find(
    (item) => item.normalizedUrl === "https://example.com/",
  );

  expect(saved?.title).toBe("Example Domain");
  expect(saved?.fetchedAt).not.toBeNull();

  const row = page.locator(`.it[data-key="${saved?.id}"]`);
  await expect(row.locator(".it-open")).toContainText("Example Domain");
  await expect(row.locator(".it-open")).not.toContainText("example.com/");
  await expect(row.locator(".it-meta > span").nth(1)).toHaveText("example.com");
});

test("pages served with gzip and with Brotli get their titles", async ({ request }) => {
  expect(await encodingOf("https://github.com/KyaniteHQ/threadsift")).toBe("gzip");
  expect(await encodingOf("https://example.com/")).toBe("br");

  const gzip = await postLink(request, "https://github.com/KyaniteHQ/threadsift");
  expect(gzip.body.fetch).toBe("ok");
  expect(gzip.body.item.title).toContain("KyaniteHQ/threadsift");

  const brotli = await postLink(request, "https://example.com/");
  expect(brotli.body.item.title).toBe("Example Domain");
});

const UTF8_TITLE = "Café ☕ Threadsift";

function base64Page(run: string): string {
  const html = `<!doctype html><html><head><title>${UTF8_TITLE} ${run}</title></head></html>`;

  return `https://httpbin.org/base64/${Buffer.from(html).toString("base64url")}`;
}

test("a body is decoded as UTF-8, and an unknown charset label is no error", async ({
  request,
}) => {
  const run = newRunId();
  const utf8 = await postLink(request, base64Page(run));
  expect(utf8.body.item.title).toBe(`${UTF8_TITLE} ${run}`);

  const unknown = await postLink(
    request,
    `https://httpbin.org/response-headers?Content-Type=text/html;+charset=not-real&run=${run}`,
  );

  expect(unknown.status).toBe(201);
  expect(unknown.body.fetch).toBe("no-title");
  expect(unknown.body.item.title).toBeNull();
});

test("a second Paste fetches again: fetchedAt moves forward while the id and saved date stay", async ({
  request,
}) => {
  const url = `https://example.com/?run=${newRunId()}`;
  const first = await postLink(request, url);
  await sleep(50);
  const second = await postLink(request, url);

  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  expect(second.body.item.id).toBe(first.body.item.id);
  expect(second.body.item.savedAt).toBe(first.body.item.savedAt);
  expect(first.body.item.fetchedAt).not.toBeNull();
  expect(second.body.item.fetchedAt).toBeGreaterThan(first.body.item.fetchedAt ?? 0);
  expect(second.body.item.title).toBe("Example Domain");
});
