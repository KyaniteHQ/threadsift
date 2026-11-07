import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { type APIRequestContext, request } from "@playwright/test";
import { z } from "zod";

import { type Instance, sessionStateOf, sessionValueOf } from "./access.ts";
import { setUpByApi } from "./fresh-screen.ts";

export const ROW_LIMIT_BYTES = 1_000_000;

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

const Ids = z.array(z.object({ id: z.number() }));

export interface FileItem {
  readonly url: string;
  readonly title: string;
  readonly postText?: string | undefined;
}

export function storeFileItem(instance: Instance, item: Readonly<FileItem>): number {
  const text = item.postText === undefined ? "NULL" : `'${item.postText.replaceAll("'", "''")}'`;

  instance.sql(
    `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, status, title, post_text) VALUES ('article', 'article', '${item.url}', '${item.url}', ${Date.now()}, 'ready', '${item.title}', ${text})`,
  );

  const [row] = instance.query(`SELECT id FROM items WHERE normalized_url = '${item.url}'`, Ids);

  if (row === undefined) throw new Error(`no Item at ${item.url}`);

  return row.id;
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
  instance.sql(`UPDATE items SET post_text_key = ${expression} WHERE id = ${id}`);
}

export function inContainer(instance: Instance, script: string): string {
  const [command = "", ...head] = instance.appExec.split(" ");

  return execFileSync(command, [...head, "sh", "-c", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}
