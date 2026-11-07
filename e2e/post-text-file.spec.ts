import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { type Instance, launchFresh, newCode } from "./access.ts";
import {
  ROW_LIMIT_BYTES,
  digestOf,
  inContainer,
  longText,
  nameFile,
  ownerOf,
  storeFileItem,
} from "./files.ts";
import { isContainerTarget } from "./target.ts";

const Detail = z.object({
  item: z.looseObject({
    id: z.number(),
    title: z.string(),
    status: z.string(),
    postText: z.string().nullable(),
  }),
});

const Listed = z.object({ items: z.array(z.looseObject({ id: z.number() })) });

const Status = z.object({ item: z.looseObject({ id: z.number() }) });

const NOT_LISTED_FIELDS = ["postText", "postedAt", "postTextKey", "post_text_key"] as const;

const ROW_TEXT = "the row text that a file or a refusal replaces";

const RAW_CONTROL = /[\p{Cc}\u2028\u2029]/u;

let instance: Instance;
let owner: APIRequestContext;
let sequence = 0;

test.beforeAll(async () => {
  const code = newCode();
  instance = launchFresh(code);
  owner = await ownerOf(instance, code, "f".repeat(20));
});

test.afterAll(async () => {
  await owner.dispose();
  instance.stop();
});

function seeded(postText?: string): number {
  sequence += 1;

  return storeFileItem(instance, {
    url: `https://example.com/file-text-${sequence}`,
    title: "Seeded",
    postText,
  });
}

async function detailOf(id: number) {
  const response = await owner.get(`/api/items/${id}`);

  return { status: response.status(), ...Detail.parse(await response.json()) };
}

function unavailableLines(id: number): string[] {
  return instance
    .logs()
    .split("\n")
    .filter((line) => line.includes("post-text-unavailable") && line.includes(`"itemId":${id},`));
}

async function expectNoPostText(id: number, label: string, secret: string): Promise<void> {
  const { status, item } = await detailOf(id);

  expect(status, label).toBe(200);
  expect(item, label).toMatchObject({ id, title: "Seeded", status: "ready", postText: null });
  expect(JSON.stringify(item), label).not.toContain(secret);
  expect(item, label).not.toHaveProperty("postTextKey");
}

test("an Item whose row names a file of over 1,000,000 bytes returns the whole text byte for byte, before and after a restart", async () => {
  test.setTimeout(180_000);
  const bytes = Buffer.from(longText());
  const id = seeded(ROW_TEXT);
  const key = `items/${id}/post-text.md`;

  expect(bytes.length).toBeGreaterThan(ROW_LIMIT_BYTES);
  instance.writeFile(key, bytes);
  nameFile(instance, id, `'${key}'`);
  expect(instance.listFiles(`items/${id}/`)).toMatchObject([{ key, size: bytes.length }]);

  const expectWhole = async (phase: string): Promise<void> => {
    const { status, item } = await detailOf(id);
    const got = Buffer.from(item.postText ?? "");

    expect(status, phase).toBe(200);
    expect(item.title, phase).toBe("Seeded");
    expect(got.length, phase).toBe(bytes.length);
    expect(digestOf(got), phase).toBe(digestOf(bytes));
    expect(item, phase).not.toHaveProperty("postTextKey");
  };

  await expectWhole("before the restart");
  instance.restart();
  await expectWhole("after the restart");
});

test("a row that names a missing key answers 200 without post text, and the log names the key", async () => {
  const id = seeded(ROW_TEXT);
  const key = `items/${id}/gone.md`;

  nameFile(instance, id, `'${key}'`);
  expect(instance.listFiles(`items/${id}/`)).toEqual([]);
  expect(instance.readFile(key)).toBeNull();
  await expectNoPostText(id, key, ROW_TEXT);
  await expect.poll(() => unavailableLines(id).join("\n")).toContain(key);
});

const REFUSED_KEYS = ["../outside", "/etc/passwd", "items/1/..", "items/01/a", "items/1/a\\b"];

test("a row whose key is ../outside, /etc/passwd, items/1/.., items/01/a or holds a backslash answers 200 without post text and reads nothing outside the store", async () => {
  const cases = REFUSED_KEYS.map((key) => ({
    key,
    id: seeded(ROW_TEXT),
    secret: `outside: ${key}`,
  }));

  for (const { key, id, secret } of cases) {
    if (!(isContainerTarget() && key.endsWith("/.."))) instance.writeFile(key, Buffer.from(secret));

    nameFile(instance, id, `'${key.replaceAll("'", "''")}'`);
  }

  await Promise.all(
    cases.map(async ({ key, id, secret }) => {
      await expectNoPostText(id, key, secret);
      await expect.poll(() => unavailableLines(id).length, key).toBeGreaterThan(0);
    }),
  );
});

test("a key with control characters is logged escaped, never raw", async () => {
  const id = seeded(ROW_TEXT);

  nameFile(instance, id, "'items/1/' || char(7) || char(27) || char(127) || char(8232) || 'x'");
  await expectNoPostText(id, "control characters", ROW_TEXT);
  await expect.poll(() => unavailableLines(id).length).toBeGreaterThan(0);

  const [line = ""] = unavailableLines(id);
  const record = line.slice(line.indexOf("{"), line.lastIndexOf("}") + 1);

  expect(record).not.toMatch(RAW_CONTROL);
  expect(record).toContain(String.raw`\u0007\u001b\u007f\u2028x`);
});

test("the list and the status poll carry no post text and no key, and the detail answer carries no key", async () => {
  const plain = seeded("a short row text");
  const filed = seeded();
  const key = `items/${filed}/post-text.md`;

  instance.writeFile(key, Buffer.from("text held in a file"));
  nameFile(instance, filed, `'${key}'`);

  const listed = Listed.parse(await (await owner.get("/api/items")).json());

  for (const id of [plain, filed]) {
    const entry = listed.items.find((item) => item.id === id);
    const polled = Status.parse(await (await owner.get(`/api/items/${id}/status`)).json()).item;

    expect(entry, `the list holds Item ${id}`).toBeDefined();

    for (const shown of [entry ?? {}, polled]) {
      for (const field of NOT_LISTED_FIELDS) {
        expect(shown, `${field} of Item ${id}`).not.toHaveProperty(field);
      }
    }
  }

  const { item } = await detailOf(filed);

  expect(item.postText).toBe("text held in a file");
  expect(item).not.toHaveProperty("postTextKey");
  expect((await detailOf(plain)).item.postText).toBe("a short row text");
});

function inFolder(id: number, script: string): void {
  inContainer(instance, `mkdir -p /data/files/items/${id} && ${script}`);
}

test.describe("container folder", () => {
  test.skip(!isContainerTarget(), "symlinks and permissions exist only in the container's folder");

  test("a valid key whose leaf, and another whose parent folder, is a symlink to a file outside the store answers without post text, and the sentinel stays unread", async () => {
    const sentinel = "SENTINEL outside the store";
    const leaf = seeded(ROW_TEXT);
    const parent = seeded(ROW_TEXT);
    const regular = seeded();

    inContainer(
      instance,
      `mkdir -p /data/outside-dir /data/files/items && printf %s '${sentinel}' >/data/outside-dir/leaf.md && printf %s '${sentinel}' >/data/outside-leaf.txt && ln -s /data/outside-dir /data/files/items/${parent}`,
    );
    inFolder(leaf, `ln -s /data/outside-leaf.txt /data/files/items/${leaf}/leaf.md`);
    inFolder(regular, `printf %s 'inside the store' >/data/files/items/${regular}/leaf.md`);

    for (const id of [leaf, parent, regular]) nameFile(instance, id, `'items/${id}/leaf.md'`);

    await expectNoPostText(leaf, "symlinked leaf", sentinel);
    await expectNoPostText(parent, "symlinked parent folder", sentinel);
    await expect
      .poll(() => unavailableLines(leaf).join("\n") + unavailableLines(parent).join("\n"))
      .toContain(`items/${parent}/leaf.md`);
    expect((await detailOf(regular)).item.postText).toBe("inside the store");
  });

  test("a key that names a folder gives no post text, and a file that cannot be read is an error, not missing content", async () => {
    const folder = seeded();
    const locked = seeded();

    inFolder(folder, `mkdir /data/files/items/${folder}/leaf.md`);
    inFolder(
      locked,
      `printf %s locked >/data/files/items/${locked}/leaf.md && chmod 000 /data/files/items/${locked}/leaf.md`,
    );

    for (const id of [folder, locked]) nameFile(instance, id, `'items/${id}/leaf.md'`);

    await expectNoPostText(folder, "a folder as the leaf", "never present");
    expect((await owner.get(`/api/items/${locked}`)).status()).toBe(500);
    expect(unavailableLines(locked)).toEqual([]);
  });
});
