import { expect, test } from "@playwright/test";

import { createToken, expectRefusal, revokeToken } from "./access-helpers.ts";
import { anonymous, bearer } from "./access.ts";
import { nameFile, storeFileItem, storeJob } from "./files.ts";
import {
  type Library,
  SMALL_PAGE,
  closeLibrary,
  openLibrary,
  pasteArticle,
} from "./media-pages.ts";
import { expectPrivate, expectServed, imageRows, routeOf } from "./media.ts";
import { isContainerTarget } from "./target.ts";

test.describe.configure({ timeout: 300_000 });

let library: Library;

test.beforeEach(async () => {
  library = await openLibrary();
});

test.afterEach(async () => {
  await closeLibrary(library);
});

test("the file route serves a published image to the owner and to an agent token, and refuses no credential and a revoked token", async () => {
  const { instance, owner } = library;
  const item = await pasteArticle(owner, "route", SMALL_PAGE);
  const [row] = imageRows(instance, item.id);

  if (row === undefined) throw new Error("no stored image");

  const path = routeOf(row.file_key ?? "");
  await expectServed(owner, instance, row);

  const stranger = await anonymous(instance.url);
  const signedOut = await stranger.get(path);

  await expectRefusal(signedOut, 401, "no credential");
  expectPrivate(signedOut);
  await stranger.dispose();

  const { token, value } = await createToken(owner, "Image reader");
  const agent = await anonymous(instance.url);

  await expectServed(agent, instance, row, bearer(value));
  expect((await revokeToken(owner, token.id)).status()).toBeLessThan(300);

  const revoked = await agent.get(path, { headers: bearer(value) });

  await expectRefusal(revoked, 401, "a revoked token");
  expectPrivate(revoked);
  await agent.dispose();
});

test("the file route answers 404, with the same headers, for a key that no published row names", async () => {
  const { instance, owner } = library;
  const item = await pasteArticle(owner, "route", SMALL_PAGE);
  const [row] = imageRows(instance, item.id);

  if (row === undefined) throw new Error("no stored image");

  const published = row.file_key ?? "";
  const name = published.split("/").at(-1) ?? "";
  const bytes = Buffer.from("89504e470d0a1a0a", "hex");

  const other = storeFileItem(instance, { url: "https://example.com/other-owner", title: "Other" });
  const job = storeJob(instance, item.id, SMALL_PAGE, "done");
  const textKey = `items/${item.id}/post-${job}-1.md`;

  const refused = [
    ["an unpublished image", `items/${item.id}/img-99-1-0.png`],
    ["a published image under another Item", `items/${other}/${name}`],
    ["a post text file the Item names", textKey],
    ...(isContainerTarget()
      ? [["a temporary file", `items/${item.id}/.tmp-0123456789abcdef-${name}`]]
      : []),
  ] as const;

  nameFile(instance, item.id, `'${textKey}'`);

  for (const [, key] of refused) instance.writeFile(key, bytes);

  for (const [what, key] of refused) {
    const response = await owner.get(routeOf(key));

    await expectRefusal(response, 404, what);
    expectPrivate(response);
  }

  for (const [what, path] of [
    ["a dot-dot name", `/api/files/items/${item.id}/%2e%2e%2fimg-1-1-0.png`],
    ["a name outside the grammar", `/api/files/items/${item.id}/a%20b.png`],
    ["an id that is not a number", `/api/files/items/x/${name}`],
  ] as const) {
    await expectRefusal(await owner.get(path), 404, what);
  }

  await expectServed(owner, instance, row);
});
