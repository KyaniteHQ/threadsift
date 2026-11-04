import { expect, test } from "@playwright/test";

import { listAll, postLink } from "./api.ts";
import { newRunId, pasteLink, titledPage } from "./links.ts";

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
  expect(brotli.body.fetch).toBe("ok");
  expect(brotli.body.item.title).toBe("Example Domain");
});

const UTF8_TITLE = "Café ☕ Threadsift";

test("a body is decoded as UTF-8, also when its charset label is unknown", async ({ request }) => {
  const run = newRunId();
  const utf8 = await postLink(request, titledPage(`${UTF8_TITLE} ${run}`));
  expect(utf8.body.item.title).toBe(`${UTF8_TITLE} ${run}`);

  const markup = encodeURIComponent(`<title>${UTF8_TITLE} ${run}</title>`);

  const unknown = await postLink(
    request,
    `https://httpbin.dev/response-headers?Content-Type=text/html%3B%20charset%3Dnot-real&t=${markup}`,
  );

  expect(unknown.status).toBe(201);
  expect(unknown.body.fetch).toBe("ok");
  expect(unknown.body.item.title).toBe(`${UTF8_TITLE} ${run}`);
});

test("a second Paste fetches again: fetchedAt moves forward while the id and saved date stay", async ({
  request,
}) => {
  const url = `https://example.com/?run=${newRunId()}`;
  const first = await postLink(request, url);
  const second = await postLink(request, url);

  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  expect(second.body.item.id).toBe(first.body.item.id);
  expect(second.body.item.savedAt).toBe(first.body.item.savedAt);
  expect(first.body.item.fetchedAt).not.toBeNull();
  expect(second.body.item.fetchedAt).toBeGreaterThan(first.body.item.fetchedAt ?? 0);
  expect(second.body.item.title).toBe("Example Domain");
});

const ARABIC_TITLE = "مرحبا بالعالم";

test("a title is read in its own direction, so an Arabic title and an English one each sit right", async ({
  page,
  request,
}) => {
  const run = newRunId();
  const arabic = await postLink(request, titledPage(`${ARABIC_TITLE} ${run}`));
  const english = await postLink(request, titledPage(`Hello world ${run}`));
  await page.goto("/");

  const directionOf = (id: number, title: string) =>
    page
      .locator(`.it[data-key="${id}"] .it-open`)
      .getByText(title)
      .evaluate((element) => getComputedStyle(element).direction);

  expect(await directionOf(arabic.body.item.id, `${ARABIC_TITLE} ${run}`)).toBe("rtl");
  expect(await directionOf(english.body.item.id, `Hello world ${run}`)).toBe("ltr");
});

function normalised(family: string): string {
  return family.replaceAll(/["'\s]/gu, "");
}

test("a link-only row shows its link in the mono face at meta size and muted ink, and a titled row does not", async ({
  page,
  request,
}) => {
  const run = newRunId();
  const linkOnly = await postLink(request, `https://example.com/missing-${run}`);
  const titled = await postLink(request, `https://example.com/?run=${run}`);
  expect(linkOnly.body.item.title).toBeNull();
  expect(titled.body.item.title).toBe("Example Domain");
  await page.goto("/");

  const looksOf = (id: number, selector: string) =>
    page.locator(`.it[data-key="${id}"] ${selector}`).evaluate((element) => {
      const { fontFamily, fontSize, color } = getComputedStyle(element);

      return { fontFamily, fontSize, color };
    });

  const mono = await page
    .locator(".app")
    .evaluate((element) => getComputedStyle(element).getPropertyValue("--f-mono"));

  const bare = await looksOf(linkOnly.body.item.id, ".it-open");
  const meta = await looksOf(linkOnly.body.item.id, ".it-meta");
  const full = await looksOf(titled.body.item.id, ".it-open");

  expect(normalised(bare.fontFamily)).toBe(normalised(mono));
  expect(bare.fontSize).toBe(meta.fontSize);
  expect(bare.color).toBe(meta.color);
  expect(normalised(full.fontFamily)).not.toBe(normalised(mono));
  expect(full.fontSize).not.toBe(meta.fontSize);
  expect(full.color).not.toBe(meta.color);
});
