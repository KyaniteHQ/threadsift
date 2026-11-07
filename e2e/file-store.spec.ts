import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";

import { expect, test } from "@playwright/test";

import { FILE_NAME_MAX, FileRefused } from "../src/core/file-keys.ts";
import type { FileStore } from "../src/core/ports.ts";
import {
  type Backend,
  PAGE_SIZE,
  bucketBackend,
  folderBackend,
  keysOf,
  pagesOf,
  textOf,
} from "./file-backends.ts";
import { digestOf } from "./files.ts";
import { isContainerTarget } from "./target.ts";

const BIG_BYTES = 3 * 1024 * 1024;

const CONCURRENT_BYTES = 512 * 1024;

const BAD_KEYS = [
  "",
  "../outside",
  "items/01/a.md",
  "items/1/",
  "items/1/..",
  "items/1/a/b",
  "items/1/a b",
  "items/1/a\\b",
  "items/-1/a",
  "items/1",
];

const BAD_PREFIXES = ["", "items", "items/1", "items/01/", "items/1/a", "files/"];

async function expectRefusals(store: FileStore): Promise<void> {
  for (const key of BAD_KEYS) {
    await expect(store.put(key, new Uint8Array(1)), `put ${key}`).rejects.toBeInstanceOf(
      FileRefused,
    );
    await expect(store.get(key), `get ${key}`).rejects.toBeInstanceOf(FileRefused);
    await expect(store.delete(["items/1/a.md", key]), `delete ${key}`).rejects.toBeInstanceOf(
      FileRefused,
    );
  }

  for (const prefix of BAD_PREFIXES) {
    await expect(store.list(prefix, null, PAGE_SIZE), `list ${prefix}`).rejects.toBeInstanceOf(
      FileRefused,
    );
  }

  await expect(store.list("items/", null, 0)).rejects.toBeInstanceOf(RangeError);
}

async function expectPutGetOverwrite(store: FileStore): Promise<void> {
  const before = Date.now();

  await store.put("items/1/a.md", Buffer.from("héllo 日本語 😀"));
  await expect(textOf(store, "items/1/a.md")).resolves.toBe("héllo 日本語 😀");
  await store.put("items/1/a.md", Buffer.from("replaced"));
  await expect(textOf(store, "items/1/a.md")).resolves.toBe("replaced");
  await expect(textOf(store, "items/1/absent.md")).resolves.toBeNull();
  await expect(textOf(store, "items/7/absent.md")).resolves.toBeNull();

  const [stored] = (await pagesOf(store, "items/1/")).flat();

  expect(stored?.key).toBe("items/1/a.md");
  expect(stored?.uploadedAt ?? 0).toBeGreaterThan(before - 60_000);
  expect(stored?.uploadedAt ?? Infinity).toBeLessThan(Date.now() + 60_000);

  const big = randomBytes(BIG_BYTES);

  await store.put("items/1/big.bin", big);

  const stream = await store.get("items/1/big.bin");

  expect(digestOf(new Uint8Array(await new Response(stream).arrayBuffer()))).toBe(digestOf(big));
  await store.delete(["items/1/big.bin"]);
}

async function expectLongestName(store: FileStore): Promise<void> {
  const key = `items/1/${"n".repeat(FILE_NAME_MAX)}`;

  await store.put(key, Buffer.from("longest"));
  await expect(textOf(store, key)).resolves.toBe("longest");
  await expect(keysOf(store, "items/1/")).resolves.toContain(key);
  await store.delete([key]);
  await expect(textOf(store, key)).resolves.toBeNull();
}

async function expectReadsSurviveDeletes(store: FileStore): Promise<void> {
  const keys = Array.from({ length: 400 }, (_, index) => `items/4/r-${index}.md`);

  await Promise.all(keys.map((key) => store.put(key, Buffer.from(`body of ${key}`))));

  const outcomes = await Promise.all(
    keys.map(async (key, index) => {
      const removed = store.delete([key]);

      for (let turns = 0; turns < index % 8; turns += 1) await setImmediate();

      const [text] = await Promise.all([textOf(store, key), removed]);

      return { key, text };
    }),
  );

  for (const { key, text } of outcomes) expect([null, `body of ${key}`]).toContain(text);

  await expect(keysOf(store, "items/4/")).resolves.toEqual([]);
}

async function expectConcurrentPuts(store: FileStore): Promise<void> {
  const payloads = Array.from({ length: 6 }, () => randomBytes(CONCURRENT_BYTES));

  await Promise.all(payloads.map((payload) => store.put("items/3/race.bin", payload)));

  const stream = await store.get("items/3/race.bin");
  const stored = digestOf(new Uint8Array(await new Response(stream).arrayBuffer()));

  expect(payloads.map((payload) => digestOf(payload))).toContain(stored);
  await expect(keysOf(store, "items/3/")).resolves.toEqual(["items/3/race.bin"]);
  await store.delete(["items/3/race.bin"]);
}

async function expectPrefixesAndPages(backend: Backend): Promise<void> {
  const { store, plant } = backend;

  await store.put("items/1/b.md", Buffer.from("b"));
  await store.put("items/1/c.md", Buffer.from("c"));
  await store.put("items/10/a.md", Buffer.from("ten"));
  await plant("items/1/.tmp-leftover-c.md", "a crash left this");
  await plant("items/1/not a key.md", "foreign");
  await plant("items/01/a.md", "foreign");

  const pages = await pagesOf(store, "items/");

  expect(pages.length, "several pages with a limit of 2").toBeGreaterThan(1);
  expect(pages.every((page) => page.length <= PAGE_SIZE)).toBe(true);
  expect(pages.flat().map(({ key }) => key)).toEqual([
    "items/1/.tmp-leftover-c.md",
    "items/1/a.md",
    "items/1/b.md",
    "items/1/c.md",
    "items/10/a.md",
  ]);
  await expect(keysOf(store, "items/1/")).resolves.toEqual([
    "items/1/.tmp-leftover-c.md",
    "items/1/a.md",
    "items/1/b.md",
    "items/1/c.md",
  ]);
  await expect(keysOf(store, "items/10/")).resolves.toEqual(["items/10/a.md"]);
  await expect(keysOf(store, "items/2/")).resolves.toEqual([]);
}

async function expectDeletes(store: FileStore): Promise<void> {
  await store.delete([
    "items/1/a.md",
    "items/1/a.md",
    "items/1/never.md",
    "items/2/never-stored.md",
  ]);
  await store.delete(["items/1/a.md"]);
  await expect(textOf(store, "items/1/a.md")).resolves.toBeNull();
  await expect(store.delete(["items/1/b.md", "not a key"])).rejects.toBeInstanceOf(FileRefused);
  await expect(textOf(store, "items/1/b.md")).resolves.toBe("b");
  await store.delete([
    "items/1/b.md",
    "items/1/c.md",
    "items/1/.tmp-leftover-c.md",
    "items/10/a.md",
  ]);
  await expect(keysOf(store, "items/")).resolves.toEqual([]);
}

test("the production file store adapter of this target puts, reads, replaces, lists in pages and deletes, and refuses keys outside the grammar", async () => {
  test.setTimeout(180_000);
  const backend = await (isContainerTarget() ? folderBackend() : bucketBackend());

  try {
    await expectRefusals(backend.store);
    await expectPutGetOverwrite(backend.store);
    await expectConcurrentPuts(backend.store);
    await expectLongestName(backend.store);
    await expectReadsSurviveDeletes(backend.store);
    await expectPrefixesAndPages(backend);
    await expectDeletes(backend.store);
  } finally {
    await backend.close();
  }
});

async function expectNothingReachable(store: FileStore, keys: readonly string[]): Promise<void> {
  for (const key of keys) {
    await expect(store.get(key), `get ${key}`).rejects.toBeInstanceOf(FileRefused);
    await expect(store.put(key, Buffer.from("x")), `put ${key}`).rejects.toBeInstanceOf(
      FileRefused,
    );
    await expect(store.delete([key]), `delete ${key}`).rejects.toBeInstanceOf(FileRefused);
  }
}

async function expectOutsideUntouched(outside: string): Promise<void> {
  await expect(readFile(join(outside, "items", "1", "leaf.md"), "utf8")).resolves.toBe("SENTINEL");
  await expect(readdir(join(outside, "items"))).resolves.toEqual(["1"]);
  await expect(readdir(join(outside, "items", "1"))).resolves.toEqual(["leaf.md"]);
}

test.describe("container folder", () => {
  test.skip(!isContainerTarget(), "symlinks exist only in the container's folder");

  test("the folder adapter refuses symlinked leaves and parent folders, and lists neither", async () => {
    const { store, dir, close } = await folderBackend();

    try {
      const outside = join(dir, "outside");

      await mkdir(join(dir, "files", "items", "1"), { recursive: true });
      await mkdir(outside);
      await writeFile(join(outside, "leaf.md"), "SENTINEL");
      await symlink(join(outside, "leaf.md"), join(dir, "files", "items", "1", "leaf.md"));
      await symlink(outside, join(dir, "files", "items", "2"));

      await expectNothingReachable(store, ["items/1/leaf.md", "items/2/leaf.md"]);

      await expect(keysOf(store, "items/")).resolves.toEqual([]);
      await expect(readFile(join(outside, "leaf.md"), "utf8")).resolves.toBe("SENTINEL");
    } finally {
      await close();
    }
  });
});

test.describe("container folder ancestors", () => {
  test.skip(!isContainerTarget(), "symlinks exist only in the container's folder");

  for (const linked of ["files", "items"]) {
    test(`the folder adapter refuses a symlinked ${linked} folder for every call and leaves the folder outside unread and unwritten`, async () => {
      const { store, dir, close } = await folderBackend();

      try {
        const outside = join(dir, "outside");

        await mkdir(join(outside, "items", "1"), { recursive: true });
        await writeFile(join(outside, "items", "1", "leaf.md"), "SENTINEL");

        if (linked === "files") {
          await symlink(outside, join(dir, "files"));
        } else {
          await mkdir(join(dir, "files"));
          await symlink(join(outside, "items"), join(dir, "files", "items"));
        }

        await expectNothingReachable(store, ["items/1/leaf.md", "items/5/new.md"]);

        for (const prefix of ["items/", "items/1/", "items/5/"]) {
          await expect(store.list(prefix, null, 10), `list ${prefix}`).rejects.toBeInstanceOf(
            FileRefused,
          );
        }

        await expectOutsideUntouched(outside);
      } finally {
        await close();
      }
    });
  }
});
