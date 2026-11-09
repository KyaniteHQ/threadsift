import { expect, test } from "@playwright/test";

import { SAME_ORIGIN } from "./access.ts";
import { addMediaRow } from "./deletion.ts";
import {
  type SeededJob,
  TICK_WAIT_MS,
  inContainer,
  storeFileItem,
  storeJob,
  waitForKeys,
} from "./files.ts";
import {
  NO_IMAGE_PAGE,
  SMALL_PAGE,
  SMALL_PAGE_IMAGES,
  type Library,
  closeLibrary,
  openLibrary,
  pasteArticle,
  repoint,
} from "./media-pages.ts";
import { imageFiles, mediaOf, routeOf } from "./media.ts";
import { isContainerTarget } from "./target.ts";

let library: Library;
let sequence = 0;

test.beforeEach(async () => {
  library = await openLibrary();
});

test.afterEach(async () => {
  await closeLibrary(library);
});

function seededItem(job: SeededJob) {
  sequence += 1;
  const url = `https://example.com/image-sweep-${sequence}`;
  const id = storeFileItem(library.instance, { url, title: "Seeded" });

  return { id, job: storeJob(library.instance, id, url, job) };
}

async function waitForFiles(expected: readonly string[]): Promise<void> {
  await waitForKeys(library.owner, library.instance, expected);
}

test("a tick keeps the images a row names and the images of an attempt that holds its claim, and deletes abandoned and superseded images", async () => {
  test.setTimeout(TICK_WAIT_MS + 90_000);
  const { instance } = library;
  const named = seededItem("done");
  const claimed = seededItem({ running: 2 });
  const superseded = seededItem("done");
  const namedKey = `items/${named.id}/img-${named.job}-1-0.png`;
  const heldKey = `items/${claimed.id}/img-${claimed.job}-2-1.jpg`;
  const heldTemporary = `items/${claimed.id}/.tmp-0123456789abcdef-img-${claimed.job}-2-0.png`;
  const bytes = Buffer.from("89504e470d0a1a0a", "hex");

  addMediaRow(instance, named.id, namedKey);

  const gone = [
    `items/${named.id}/img-${named.job - 1}-1-0.png`,
    `items/${claimed.id}/img-${claimed.job}-1-0.png`,
    `items/${claimed.id}/img-${claimed.job}-3-0.png`,
    `items/${superseded.id}/img-${superseded.job}-1-0.png`,
    `items/${superseded.id}/img-${superseded.job}-1-1.png`,
  ];

  for (const key of [namedKey, heldKey, ...gone]) instance.writeFile(key, bytes);

  if (isContainerTarget()) instance.writeFile(heldTemporary, bytes);

  await waitForFiles([namedKey, heldKey, ...(isContainerTarget() ? [heldTemporary] : [])]);
});

test("deleting an Item leaves no media row and no file, and its images stop serving", async () => {
  const { instance, owner } = library;
  const item = await pasteArticle(owner, "stored", SMALL_PAGE);
  const [row] = mediaOf(instance, item.id);

  expect(imageFiles(instance, item.id)).toHaveLength(SMALL_PAGE_IMAGES);
  expect((await owner.get(routeOf(row?.file_key ?? ""))).status()).toBe(200);
  expect((await owner.delete(`/api/items/${item.id}`, { headers: SAME_ORIGIN })).status()).toBe(
    204,
  );
  expect(mediaOf(instance, item.id)).toEqual([]);
  expect(instance.listFiles(`items/${item.id}/`)).toEqual([]);
  expect((await owner.get(routeOf(row?.file_key ?? ""))).status()).toBe(404);
});

test.describe("a delete that fails", () => {
  test.skip(!isContainerTarget(), "a Worker's R2 delete does not fail on a folder mode");

  test("leaves the superseded images to a later tick, which deletes them", async () => {
    test.setTimeout(TICK_WAIT_MS + 120_000);
    const { instance, owner } = library;
    const item = await pasteArticle(owner, "stored", SMALL_PAGE);

    expect(imageFiles(instance, item.id)).toHaveLength(SMALL_PAGE_IMAGES);
    inContainer(instance, `chmod 555 /data/files/items/${item.id}`);
    repoint(instance, item.id, NO_IMAGE_PAGE);

    const bare = await pasteArticle(owner, "bare", NO_IMAGE_PAGE);

    expect(bare.id).toBe(item.id);
    expect(mediaOf(instance, item.id), "the refresh published without the images").toEqual([]);
    expect(imageFiles(instance, item.id), "the refused deletes left the files").toHaveLength(
      SMALL_PAGE_IMAGES,
    );

    inContainer(instance, `chmod 755 /data/files/items/${item.id}`);
    await waitForFiles([]);
  });
});
