import { expect, test } from "@playwright/test";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { newCode, newPassword } from "./access.ts";
import { settled } from "./api.ts";
import { expectLoaded, fileRequests, watchedPage } from "./article-image-screen.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { expectOwnBytes, expectServed, imageRows, routesIn } from "./media.ts";
import { reader } from "./reader.ts";

test.describe.configure({ timeout: 240_000 });

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const WORDS = Array.from({ length: 140 }, (_, index) => `word${index}`).join(" ");

let screen: FreshScreen;

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterAll(async () => {
  await screen.close();
});

test("a picture stored from a Reddit page is served by its file route and drawn in the Reader as a picture", async ({
  browser,
}) => {
  const { request } = screen.context;
  const run = Date.now().toString(36);

  const response = await request.post("/api/items", {
    data: {
      url: `https://www.reddit.com/r/typescript/comments/r${run}/a_post/`,
      page: { markdown: `${WORDS}\n\n![a figure](data:image/png;base64,${PNG})`, title: "A post" },
    },
  });

  expect(response.status()).toBe(201);

  const { item } = SavedItemResponseSchema.parse(await response.json());
  const done = await settled(request, item.id);
  const [stored] = imageRows(screen.fresh, item.id);

  expect(done).toMatchObject({ source: "reddit", kind: "reddit-post", fetch: "ok" });
  expect(stored).toMatchObject({ outcome: "stored", content_type: "image/png" });

  if (stored === undefined) throw new Error("no image row");

  expectOwnBytes(stored, screen.fresh.readFile(stored.file_key ?? ""));
  expect(routesIn(done.postText)).toEqual([`/api/files/${stored.file_key ?? ""}`]);
  await expectServed(request, screen.fresh, stored);

  const { context, page, requests } = await watchedPage(browser, screen, {});

  await page.goto(`/items/${item.id}`);
  await expect(reader(page)).toBeVisible();
  await expectLoaded(page, ".rd-orig .md img.pic", 1);
  expect(new Set(fileRequests(requests).map((url) => new URL(url).pathname))).toEqual(
    new Set([`/api/files/${stored.file_key ?? ""}`]),
  );
  await context.close();
});
