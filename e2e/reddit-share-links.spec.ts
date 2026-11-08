import { expect, test } from "@playwright/test";

import { NOTICES } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { itemOf, listAll, postLinkRaw, settled } from "./api.ts";
import { livePasted } from "./articles.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { pasteCard, pasteLink } from "./links.ts";
import { skipWhenRunnerBlocked } from "./share-link-block.ts";
import { aliasesOf, fetchAddressesOf } from "./short-links.ts";

test.describe.configure({ timeout: 240_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

const SHARED = [
  {
    what: "post",
    name: "post",
    share: "https://reddit.com/r/fossdroid/s/Wptky3Ma2I",
    shareKey: "https://reddit.com/r/fossdroid/s/Wptky3Ma2I",
    canonical:
      "https://www.reddit.com/r/fossdroid/comments/1659ic4/material_files_is_still_maintained/",
    identity: "https://reddit.com/r/all/comments/1659ic4/",
    kind: "reddit-post",
    title: "Material Files Is Still Maintained",
  },
  {
    what: "comment (the /comment/<id>/ address)",
    name: "comment-new",
    share: "https://www.reddit.com/r/gifs/s/9W7csSs7LA",
    shareKey: "https://reddit.com/r/gifs/s/9W7csSs7LA",
    canonical: "https://www.reddit.com/r/gifs/comments/1xn17o9/comment/19s3al7u4qqbn/",
    identity: "https://reddit.com/r/all/comments/1xn17o9/_/19s3al7u4qqbn/",
    kind: "reddit-comment",
    title: "Ataraxia II",
  },
  {
    what: "comment (the /<title>/<id>/ address)",
    name: "comment-old",
    share: "https://reddit.com/r/Common_Lisp/s/1WrzgrAl3O",
    shareKey: "https://reddit.com/r/Common_Lisp/s/1WrzgrAl3O",
    canonical:
      "https://www.reddit.com/r/Common_Lisp/comments/16ln534/github_workflow_for_continuous_delivery/k15lfw8/",
    identity: "https://reddit.com/r/all/comments/16ln534/_/k15lfw8/",
    kind: "reddit-comment",
    title: "GitHub workflow for continuous delivery",
  },
] as const;

const COMMENT_PARENT = "https://www.reddit.com/r/gifs/comments/1xn17o9/";
const COMMENT_PARENT_IDENTITY = "https://reddit.com/r/all/comments/1xn17o9/";

const NOT_SHARE_LINKS = [
  { what: "a share link on old.reddit.com", url: "https://old.reddit.com/r/factorio/s/h8fWoCEcMx" },
  { what: "a /s/ link without a community", url: "https://www.reddit.com/s/h8fWoCEcMx" },
  { what: "a /s/ link under /user/", url: "https://www.reddit.com/user/spez/s/h8fWoCEcMx" },
  {
    what: "a share link with a path after its code",
    url: "https://reddit.com/r/gifs/s/9W7csSs7LA/x",
  },
] as const;

const UNKNOWN_CODE = "https://reddit.com/r/gifs/s/ZZZZZZZZZZ";

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

type Shared = (typeof SHARED)[number];

async function pastedThreeWays(shared: Shared) {
  const { request } = screen.context;

  const name = `share-${shared.name}`;

  const { first, last, fetches } = await livePasted(
    name,
    async () => {
      const { status, body } = await postLinkRaw(request, shared.share);
      const item = await settled(request, body.item.id);
      await skipWhenRunnerBlocked(screen, name);

      return { status, item };
    },
    ({ item }) => item.fetch,
  );

  const { id } = last.item;

  expect(first.status).toBe(201);

  expect(last.item).toMatchObject({
    kind: shared.kind,
    source: "reddit",
    normalizedUrl: shared.identity,
    originalUrl: shared.share,
    title: shared.title,
    fetch: "ok",
  });

  expect(aliasesOf(screen)).toEqual([{ normalizedUrl: shared.shareKey, itemId: id }]);

  const again = await postLinkRaw(request, shared.share);

  expect([again.status, again.body.item.id]).toEqual([200, id]);
  await settled(request, id);

  const canonical = await postLinkRaw(request, shared.canonical);

  expect([canonical.status, canonical.body.item.id]).toEqual([200, id]);
  await settled(request, id);

  expect(await listAll(request)).toHaveLength(1);
  expect(aliasesOf(screen)).toEqual([{ normalizedUrl: shared.shareKey, itemId: id }]);

  const addresses = fetchAddressesOf(screen, id);

  expect(addresses).toHaveLength(fetches.length + 2);
  expect(addresses.filter((address) => address.includes("/s/"))).toEqual([]);
}

for (const shared of SHARED) {
  test(`a share link to a ${shared.what} is the canonical Item, pasted twice and at the canonical address, and keeps the share link as its alias`, () =>
    pastedThreeWays(shared));
}

test("a share link to a comment never joins its post, and the post stays its own Item", async () => {
  const { request } = screen.context;
  const [, comment] = SHARED;
  const shared = await postLinkRaw(request, comment.share);
  await settled(request, shared.body.item.id);
  await skipWhenRunnerBlocked(screen, "share-comment-and-post");
  const parent = await postLinkRaw(request, COMMENT_PARENT);
  await settled(request, parent.body.item.id);

  expect(parent.status).toBe(201);
  expect(parent.body.item.id).not.toBe(shared.body.item.id);

  const again = await postLinkRaw(request, comment.share);

  expect([again.status, again.body.item.id]).toEqual([200, shared.body.item.id]);
  await settled(request, again.body.item.id);

  const items = await listAll(request);

  expect(items.map(({ normalizedUrl }) => normalizedUrl).toSorted()).toEqual(
    [COMMENT_PARENT_IDENTITY, comment.identity].toSorted(),
  );

  expect(aliasesOf(screen)).toEqual([
    { normalizedUrl: comment.shareKey, itemId: shared.body.item.id },
  ]);
});

test("a share link whose redirect does not end on a post or comment stays a link under its own address, with no alias, and is tried again on the next Paste", async () => {
  const { request } = screen.context;
  const first = await postLinkRaw(request, UNKNOWN_CODE);
  const { id } = first.body.item;

  expect(first.status).toBe(201);
  await settled(request, id);
  await skipWhenRunnerBlocked(screen, "share-unknown-code");

  expect(await itemOf(request, id)).toMatchObject({
    kind: "link",
    source: "other",
    normalizedUrl: UNKNOWN_CODE,
    title: null,
    fetch: "unresolved",
  });

  const again = await postLinkRaw(request, UNKNOWN_CODE);

  expect([again.status, again.body.item.id]).toEqual([200, id]);
  expect(await settled(request, id)).toMatchObject({ fetch: "unresolved" });
  expect(aliasesOf(screen)).toEqual([]);
  expect(await listAll(request)).toHaveLength(1);
  expect(fetchAddressesOf(screen, id)).toEqual([]);
});

test("the paste card says Threadsift could not find the post or comment when a share link does not lead to one", async () => {
  const { page } = screen;
  await page.goto("/");
  await pasteLink(page, UNKNOWN_CODE);
  await skipWhenRunnerBlocked(screen, "share-paste-card");

  await expect(pasteCard(page)).toContainText(NOTICES.unresolved.text);
});

async function savedAsPlainLink(url: string) {
  const { request } = screen.context;
  const { status, body } = await postLinkRaw(request, url);

  expect(status).toBe(201);

  expect(await settled(request, body.item.id)).toMatchObject({
    kind: "link",
    source: "other",
    fetch: "not-requested",
    title: null,
  });

  expect(aliasesOf(screen)).toEqual([]);
  expect(fetchAddressesOf(screen, body.item.id)).toEqual([url]);
}

for (const form of NOT_SHARE_LINKS) {
  test(`${form.what} is saved as a plain link, with no request and no alias`, () =>
    savedAsPlainLink(form.url));
}
