import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { type Instance, launchFresh, newCode } from "./access.ts";
import {
  inContainer,
  nameFile,
  ownerOf,
  postTextOf,
  storeFileItem,
  storeJob,
  type SeededJob,
} from "./files.ts";
import { tickNow } from "./ingest.ts";
import { isContainerTarget } from "./target.ts";

const TICK_WAIT_MS = 150_000;

const PAGE_KEYS = 100;

let instance: Instance;
let owner: APIRequestContext;
let sequence = 0;

test.beforeEach(async () => {
  const code = newCode();
  instance = launchFresh(code);
  owner = await ownerOf(instance, code, "c".repeat(20));
});

test.afterEach(async () => {
  await owner.dispose();
  instance.stop();
});

function seededItem(job: SeededJob) {
  sequence += 1;
  const url = `https://example.com/cleanup-${sequence}`;
  const id = storeFileItem(instance, { url, title: "Seeded" });

  return { id, job: storeJob(instance, id, url, job) };
}

function store(key: string, text: string): void {
  instance.writeFile(key, Buffer.from(text));
}

function namedFile(job: SeededJob) {
  const item = seededItem(job);
  const key = `items/${item.id}/post-${item.job}-1.md`;

  nameFile(instance, item.id, `'${key}'`);
  store(key, "the file the Item names");

  return { ...item, key };
}

const Cursors = z.array(z.object({ cursor: z.string().nullable() }));

function cursors() {
  return instance.query("SELECT cursor FROM file_cleaning", Cursors);
}

function strayNames(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `stray-${index + 1}.md`).toSorted();
}

function plantStrays(id: number, names: readonly string[]): void {
  inContainer(
    instance,
    `mkdir -p /data/files/items/${id} && cd /data/files/items/${id} && touch ${names.join(" ")}`,
  );
}

function keysOf(id: number, names: readonly string[]): string[] {
  return names.map((name) => `items/${id}/${name}`);
}

function storedKeys(): string[] {
  return instance
    .listFiles("items/")
    .map(({ key }) => key)
    .toSorted();
}

async function waitForKeys(expected: readonly string[]): Promise<void> {
  await expect
    .poll(
      async () => {
        await tickNow(owner, instance);

        return storedKeys();
      },
      { timeout: TICK_WAIT_MS, intervals: [2000] },
    )
    .toEqual(expected.toSorted());
}

test("a tick deletes every file no Item names and no running attempt can publish, and keeps the file an Item names and the file of an attempt that holds its claim", async () => {
  test.setTimeout(TICK_WAIT_MS + 90_000);
  const named = namedFile("done");
  const refreshed = namedFile("done");
  const claimed = seededItem({ running: 2 });
  const unnamed = seededItem("done");
  const heldKey = `items/${claimed.id}/post-${claimed.job}-2.md`;

  store(heldKey, "the file of the attempt that holds its claim");

  const gone = [
    `items/${claimed.id}/post-${claimed.job}-1.md`,
    `items/${unnamed.id}/post-${unnamed.job}-1.md`,
    `items/${refreshed.id}/post-${refreshed.job - 1}-1.md`,
    ...(isContainerTarget()
      ? [`items/${unnamed.id}/.tmp-0123456789abcdef-post-${unnamed.job}-1.md`]
      : []),
  ];

  for (const key of gone) store(key, "a file that nothing can publish");

  await waitForKeys([named.key, heldKey, refreshed.key]);
  expect(postTextOf(instance, named.id).key).toBe(named.key);
  expect(instance.readFile(heldKey)?.toString("utf8")).toBe(
    "the file of the attempt that holds its claim",
  );
});

test.describe("a store with more keys than one page", () => {
  test.skip(
    !isContainerTarget(),
    "seeding over 100 files costs one wrangler call each on the Worker",
  );

  test("is cleaned over later ticks, from a cursor the database keeps", async () => {
    test.setTimeout(2 * TICK_WAIT_MS);
    const { id, key } = namedFile("done");
    const names = strayNames(PAGE_KEYS + 1);

    plantStrays(id, names);

    await waitForKeys([key, ...keysOf(id, names.slice(PAGE_KEYS - 1))]);
    expect(cursors(), "the cursor after the first page").toEqual([
      { cursor: `items/${id}/${names[PAGE_KEYS - 2]}` },
    ]);

    await waitForKeys([key]);
    expect(cursors(), "the cursor after the last page").toEqual([{ cursor: null }]);
  });

  test("a page whose delete fails is listed again by the next tick", async () => {
    test.setTimeout(2 * TICK_WAIT_MS);
    const locked = seededItem("done");
    const filled = namedFile("done");
    const names = strayNames(PAGE_KEYS + 1);

    plantStrays(locked.id, ["stray-0.md"]);
    plantStrays(filled.id, names);
    inContainer(instance, `chmod 555 /data/files/items/${locked.id}`);

    await waitForKeys([
      ...keysOf(locked.id, ["stray-0.md"]),
      filled.key,
      ...keysOf(filled.id, names.slice(PAGE_KEYS - 2)),
    ]);
    expect(
      cursors().filter(({ cursor }) => cursor !== null),
      "a cursor after a page that did not finish",
    ).toEqual([]);

    inContainer(instance, `chmod 755 /data/files/items/${locked.id}`);
    await waitForKeys([filled.key]);
  });
});
