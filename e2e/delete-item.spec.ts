import { expect, test } from "@playwright/test";

import { SAME_ORIGIN, newCode, newPassword } from "./access.ts";
import { getItem } from "./api.ts";
import { agentHeaders } from "./catalog.ts";
import { expectNoOwnedRows, holdSweeps, ownedRows } from "./deletion.ts";
import { longText, storeFileItem, storeLongArticle } from "./files.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { releaseSweepThrottle, tickNow } from "./ingest.ts";

const WAIT_MS = 150_000;

test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.configure({ timeout: 360_000 });

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

test("a malformed id is refused with valid credentials and deletes nothing, a cross-site owner request is refused, an agent token deletes the Item once and the second delete answers 404", async () => {
  const { request } = screen.context;

  const id = storeFileItem(screen.fresh, {
    url: "https://example.com/delete-guard",
    title: "Delete guard",
  });

  const token = await agentHeaders(screen);

  for (const malformed of ["0", "-1", "1.5", "abc"]) {
    const refused = await request.delete(`/api/items/${malformed}`, { headers: SAME_ORIGIN });
    expect(refused.status(), `the owner deleting /api/items/${malformed}`).toBe(400);

    const refusedToken = await request.delete(`/api/items/${malformed}`, { headers: token });
    expect(refusedToken.status(), `a token deleting /api/items/${malformed}`).toBe(400);
  }

  const forged = await request.delete(`/api/items/${id}`, {
    headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
  });

  expect(forged.status(), "a cross-site owner delete").toBe(403);
  expect(ownedRows(screen.fresh, id)["items"]).toBe(1);

  expect((await request.delete(`/api/items/${id}`, { headers: token })).status()).toBe(204);
  expect((await request.delete(`/api/items/${id}`, { headers: token })).status()).toBe(404);
  expect((await getItem(request, id)).status).toBe(404);
  expectNoOwnedRows(screen.fresh, id);
});

function keysOf(id: number): string[] {
  return screen.fresh.listFiles(`items/${id}/`).map(({ key }) => key);
}

test("the store holds no key of the Item right after the delete, and the next cleanup pass removes a key written after it", async () => {
  const { request } = screen.context;
  const token = await agentHeaders(screen);

  const { id, key } = storeLongArticle(screen.fresh, {
    url: "https://example.com/delete-files",
    title: "Delete files",
    bytes: Buffer.from(longText()),
  });

  holdSweeps(screen.fresh);
  screen.fresh.writeFile(`items/${id}/post-9-1.md`, Buffer.from("the file of an earlier attempt"));
  expect(keysOf(id)).toEqual([key, `items/${id}/post-9-1.md`]);

  expect((await request.delete(`/api/items/${id}`, { headers: token })).status()).toBe(204);
  expect(keysOf(id), "no sweep has run since the answer").toEqual([]);
  expect(screen.fresh.listFiles("items/")).toEqual([]);

  const late = `items/${id}/post-12-1.md`;
  screen.fresh.writeFile(late, Buffer.from("a file a running job wrote after the delete"));
  expect(keysOf(id)).toEqual([late]);

  releaseSweepThrottle(screen.fresh);
  await expect
    .poll(
      async () => {
        await tickNow(request, screen.fresh);

        return keysOf(id);
      },
      { timeout: WAIT_MS, intervals: [2000] },
    )
    .toEqual([]);
  expectNoOwnedRows(screen.fresh, id);
});
