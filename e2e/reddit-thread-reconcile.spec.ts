import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { sweptTo } from "./search.ts";
import {
  FIRST_DIGEST,
  expectKeptOnly,
  find,
  firstTree,
  marker,
  post,
  postUrl,
  run,
} from "./thread-fixtures.ts";
import { bigBody, fourBigComments } from "./thread-large.ts";
import { AUTHORED_DIGEST, savedThread, threadJson } from "./threads.ts";

test.describe.configure({ timeout: 480_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

let screen: FreshScreen;

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

function dropCommentParts(itemId: number): void {
  screen.fresh.sql(
    `DELETE FROM search_parts WHERE item_id = ${itemId} AND kind = 'comment'; DELETE FROM search_fingerprints WHERE item_id = ${itemId}`,
  );
}

test("the search reconciler writes the Kept comment parts again when they are missing", async () => {
  const { request } = screen.context;
  const id = `a${run}`;
  const tag = "first";

  const { item } = await savedThread(request, {
    url: postUrl(id),
    content: threadJson(post(id, `${marker("post")} The post body.`), firstTree(tag)),
    digest: FIRST_DIGEST,
  });

  dropCommentParts(item.id);
  expect(await find(request, marker("deep", tag))).toEqual([]);

  await sweptTo(screen, marker("deep", tag), [item.id]);
  await expectKeptOnly(request, item.id, tag);
});

test("the search reconciler writes the parts of Kept comments that total over 2,000,000 bytes, and the last Kept comment is found", async () => {
  const { request } = screen.context;
  const id = `p${run}`;
  const tag = "recon";

  const { item } = await savedThread(request, {
    url: postUrl(id),
    content: fourBigComments(id, tag),
    digest: { ...AUTHORED_DIGEST, keptComments: ["t1_l1", "t1_l2", "t1_l4"] },
  });

  const keptBytes = ["endone", "endtwo", "endfour"].reduce(
    (total, end) => total + Buffer.byteLength(bigBody(marker(end, tag))),
    0,
  );

  expect(keptBytes).toBeGreaterThan(2_000_000);

  dropCommentParts(item.id);
  expect(await find(request, marker("endfour", tag))).toEqual([]);

  await sweptTo(screen, marker("endfour", tag), [item.id]);
  expect(await find(request, marker("endone", tag))).toEqual([item.id]);
  expect(await find(request, marker("endtwo", tag))).toEqual([item.id]);
  expect(await find(request, marker("endthree", tag))).toEqual([]);
});
