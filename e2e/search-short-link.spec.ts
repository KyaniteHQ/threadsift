import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { postLinkRaw, settled } from "./api.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { X_POST, newRunId, throughRedirects } from "./links.ts";
import { checkIndex, expectFinds, partsOf } from "./search.ts";

let screen: FreshScreen;

test.use({ trace: "off", video: "off", screenshot: "off" });

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

test("a Paste that stops at a redirect leaves the index as it was, for a new Item and for a known one", async () => {
  const { request } = screen.context;
  const url = `${throughRedirects(X_POST, 1)}&run=${newRunId()}`;

  const created = await postLinkRaw(request, url);
  expect(created.status).toBe(201);
  const { id } = created.body.item;
  expect((await settled(request, id)).fetch).toBe("redirect-stopped");
  expect(partsOf(screen, id)).toEqual([]);

  screen.fresh.sql(
    `UPDATE items SET title = 'Zymurgy handbook' WHERE id = ${id}; INSERT INTO search_parts (item_id, kind, body) VALUES (${id}, 'title', 'Zymurgy handbook')`,
  );

  await expectFinds(request, [["zymurgy", [id]]]);

  const known = await postLinkRaw(request, url);
  expect(known.status).toBe(200);
  expect(await settled(request, id)).toMatchObject({ title: "Zymurgy handbook" });
  expect(partsOf(screen, id)).toEqual([{ kind: "title", length: "Zymurgy handbook".length }]);
  await expectFinds(request, [["zymurgy", [id]]]);
  checkIndex(screen);
});
