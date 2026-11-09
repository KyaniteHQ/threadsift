import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { type APIRequestContext, expect, request } from "@playwright/test";
import { z } from "zod";

import { type Instance, sessionStateOf, sessionValueOf } from "./access.ts";
import { setUpByApi } from "./fresh-screen.ts";
import { tickNow } from "./ingest.ts";

export const ROW_LIMIT_BYTES = 1_000_000;

export const TICK_WAIT_MS = 150_000;

const FILE_SETTLE_MS = 30_000;

const READ_CHUNK_BYTES = 65_536;

const PARAGRAPH = "Zażółć gęślą jaźń, 日本語のテキスト, 😀🎉, café naïve, naïve café.\n";

export function longText(): string {
  const parts = ["a".repeat(READ_CHUNK_BYTES - 1), "日"];
  let bytes = READ_CHUNK_BYTES + 2;

  for (let line = 0; bytes <= ROW_LIMIT_BYTES + 10_000; line += 1) {
    const text = `${line} ${PARAGRAPH}`;
    parts.push(text);
    bytes += Buffer.byteLength(text);
  }

  return parts.join("");
}

export function digestOf(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function ownerOf(
  { url }: Instance,
  code: string,
  password: string,
): Promise<APIRequestContext> {
  const session = sessionValueOf(await setUpByApi(url, code, password));

  return request.newContext({ baseURL: url, storageState: sessionStateOf(session, url) });
}

export interface FileItem {
  readonly url: string;
  readonly title: string;
  readonly postText?: string | undefined;
  readonly postTextKey?: string | undefined;
}

const StoredIds = z.array(z.object({ id: z.number(), url: z.string() }));

function literal(value: string | undefined): string {
  return value === undefined ? "NULL" : `'${value.replaceAll("'", "''")}'`;
}

export function storeFileItems<Item extends Readonly<FileItem>>(
  instance: Instance,
  items: readonly Item[],
): (Item & { readonly id: number })[] {
  const savedAt = Date.now();

  const rows = items.map(
    ({ url, title, postText, postTextKey }) =>
      `('article', 'article', '${url}', '${url}', ${savedAt}, 'ready', '${title}', ${literal(postText)}, ${literal(postTextKey)})`,
  );

  const urls = items.map(({ url }) => `'${url}'`);

  instance.sql(
    `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, status, title, post_text, post_text_key) VALUES ${rows.join(", ")}`,
  );

  const stored = instance.query(
    `SELECT id, normalized_url AS url FROM items WHERE normalized_url IN (${urls.join(", ")})`,
    StoredIds,
  );

  return items.map((item) => {
    const row = stored.find(({ url }) => url === item.url);

    if (row === undefined) throw new Error(`no Item at ${item.url}`);

    return { ...item, id: row.id };
  });
}

export function storeFileItem(instance: Instance, item: Readonly<FileItem>): number {
  const [stored] = storeFileItems(instance, [item]);

  if (stored === undefined) throw new Error(`no Item at ${item.url}`);

  return stored.id;
}

const Keys = z.array(z.object({ key: z.string().nullable(), inline: z.string().nullable() }));

const JobIds = z.array(z.object({ id: z.number() }));

export function postTextOf(instance: Instance, id: number) {
  const [row] = instance.query(
    `SELECT post_text_key AS key, post_text AS inline FROM items WHERE id = ${id}`,
    Keys,
  );

  if (row === undefined) throw new Error(`no Item ${id}`);

  return row;
}

export type SeededJob = "done" | { readonly running: number };

export function storeJob(
  instance: Instance,
  itemId: number,
  address: string,
  job: SeededJob,
): number {
  const running = job === "done" ? null : job.running;
  const state = running === null ? "done" : "running";
  const claim = running === null ? "NULL" : String(Date.now() + 3_600_000);

  instance.sql(
    `INSERT INTO jobs (kind, item_id, address, state, attempts, next_attempt_at, claim_expires) VALUES ('fetch', ${itemId}, '${address}', '${state}', ${running ?? 1}, 0, ${claim})`,
  );

  const [row] = instance.query(`SELECT max(id) AS id FROM jobs WHERE item_id = ${itemId}`, JobIds);

  if (row === undefined) throw new Error(`no job of Item ${itemId}`);

  return row.id;
}

export function storeLongArticle(
  instance: Instance,
  { url, title, bytes }: Readonly<{ url: string; title: string; bytes: Uint8Array }>,
) {
  const id = storeFileItem(instance, { url, title });
  const job = storeJob(instance, id, url, "done");
  const key = `items/${id}/post-${job}-1.md`;

  nameFile(instance, id, `'${key}'`);
  instance.writeFile(key, bytes);

  return { id, key };
}

export function nameFile(instance: Instance, id: number, expression: string): void {
  instance.sql(`UPDATE items SET post_text = NULL, post_text_key = ${expression} WHERE id = ${id}`);
}

export function inContainer(instance: Instance, script: string): string {
  const [command = "", ...head] = instance.appExec.split(" ");

  return execFileSync(command, [...head, "sh", "-c", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

export async function waitForKeys(
  owner: APIRequestContext,
  instance: Instance,
  expected: readonly string[],
): Promise<void> {
  await expect
    .poll(
      async () => {
        await tickNow(owner, instance);

        return instance
          .listFiles("items/")
          .map(({ key }) => key)
          .toSorted();
      },
      { timeout: TICK_WAIT_MS, intervals: [2000] },
    )
    .toEqual(expected.toSorted());
}

export async function expectKeys(
  instance: Instance,
  prefix: string,
  expected: readonly string[],
  message = "the files",
): Promise<void> {
  await expect
    .poll(
      () =>
        instance
          .listFiles(prefix)
          .map(({ key }) => key)
          .toSorted(),
      { message, timeout: FILE_SETTLE_MS, intervals: [250, 500, 1000] },
    )
    .toEqual(expected.toSorted());
}
