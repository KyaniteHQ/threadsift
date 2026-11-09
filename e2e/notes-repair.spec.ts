import { expect, test } from "@playwright/test";

import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { indexOf, putPost } from "./highlights.ts";
import { tickNow } from "./ingest.ts";
import { noteParts, partsBesidesNote, saved } from "./notes.ts";
import { matches, checkIndex, sweptTo } from "./search.ts";
import { marker, run } from "./thread-fixtures.ts";

test.describe.configure({ timeout: 480_000 });

async function repairs(screen: FreshScreen): Promise<void> {
  const { request } = screen.context;
  const itemId = await putPost(request, `nq${run}`, "Post text of nq.");
  const cleared = await putPost(request, `nk${run}`, "Post text of nk.");
  const word = marker("repair");
  const stray = marker("stray");

  await saved(request, itemId, `Repair ${word}`, 0);
  await saved(request, cleared, "Gone", 0);
  await saved(request, cleared, "", 1);

  await expect
    .poll(
      async () => {
        await tickNow(request, screen.fresh);

        return indexOf(screen, itemId)[0]?.fingerprint ?? null;
      },
      { timeout: 150_000, intervals: [2000] },
    )
    .not.toBeNull();

  const beside = partsBesidesNote(screen, itemId);

  screen.fresh.sql(`DELETE FROM search_parts WHERE item_id = ${itemId} AND kind = 'note'`);
  expect(await matches(request, word)).toEqual([]);
  await sweptTo(screen, word, [itemId]);
  expect(noteParts(screen, itemId)).toEqual([`Repair ${word}`]);

  screen.fresh.sql(
    `UPDATE search_parts SET body = '${stray}' WHERE item_id = ${itemId} AND kind = 'note'; INSERT INTO search_parts (item_id, kind, body) VALUES (${itemId}, 'note', 'Repair ${word}'), (${cleared}, 'note', '${stray}')`,
  );
  await sweptTo(screen, stray, []);
  await sweptTo(screen, word, [itemId]);

  expect(noteParts(screen, itemId)).toEqual([`Repair ${word}`]);
  expect(noteParts(screen, cleared)).toEqual([]);
  expect(partsBesidesNote(screen, itemId)).toEqual(beside);
  checkIndex(screen);
}

test("the reconciler writes a missing, wrong, duplicate or orphaned Note part again and rewrites nothing else", async ({
  browser,
}) => {
  const screen = await openSignedIn(browser, newCode(), newPassword());

  try {
    await repairs(screen);
  } finally {
    await screen.close();
  }
});
