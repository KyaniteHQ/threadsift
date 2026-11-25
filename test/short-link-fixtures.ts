import assert from "node:assert/strict";

import { z } from "zod";

import { SavedItemResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { parseLink } from "../src/core/contract/links.ts";
import type { Database } from "../src/core/kernel/database.ts";
import type { ShortLinkResolution } from "../src/features/fetch/core/fetch-link.ts";
import type { Existing } from "../src/features/item/core/item-rows.ts";
import {
  saveResolution,
  saveResolved,
  saveUnresolved,
} from "../src/features/paste/core/item-save.ts";
import { type AliasedItem, aliasedItem } from "../src/features/paste/core/short-link-aliases.ts";
import type { Instance } from "./instance.ts";
import { exec, rowCount, rows } from "./related-fixtures.ts";
import { holdLibrary, releaseLibrary } from "./restore-fixtures.ts";

const AliasSchema = z.object({
  normalized_url: z.string(),
  address: z.string(),
  item_id: z.number(),
});

const JobSchema = z.object({ address: z.string(), state: z.string() });

const EXISTING: readonly Existing[] = ["refresh", "keep"];

export const withEachExisting = <Case extends object>(cases: readonly Case[]) =>
  cases.flatMap((row) => EXISTING.map((existing) => Object.assign({}, row, { existing })));

export const FAILED: ShortLinkResolution = { kind: "failed", fetched: { status: "unresolved" } };

export const redditPost = (code: string) =>
  `https://www.reddit.com/r/library/comments/${code}/a_post/`;

export const redditComment = (code: string, comment: string) => `${redditPost(code)}${comment}/`;

export const resolvedTo = (address: string): ShortLinkResolution => ({ kind: "resolved", address });

export const aliasRow = (short: string, address: string, itemId: number) => ({
  normalized_url: parseLink(short).normalizedUrl,
  address,
  item_id: itemId,
});

export const itemsAt = (instance: Instance, address: string) =>
  rowCount(instance, "items", "normalized_url = ?", parseLink(address).normalizedUrl);

export const aliasesAt = (instance: Instance, short: string) =>
  rows(
    instance,
    AliasSchema,
    "select normalized_url, address, item_id from item_aliases where normalized_url = ?",
    parseLink(short).normalizedUrl,
  );

export const fetchJobsOf = (instance: Instance, itemId: number) =>
  rows(
    instance,
    JobSchema,
    "select address, state from jobs where item_id = ? and kind = 'fetch' order by id",
    itemId,
  );

export const fetchesAt = (instance: Instance, itemId: number, address: string) =>
  fetchJobsOf(instance, itemId).filter((job) => job.address === address).length;

export const aliasOf = (instance: Instance, short: string): Promise<AliasedItem | undefined> =>
  aliasedItem(instance.core.db, parseLink(short).normalizedUrl);

export const firstResolved = (
  instance: Instance,
  short: string,
  target: string,
  address = target,
  existing: Existing = "refresh",
) =>
  saveResolved(instance.core, {
    shortLink: parseLink(short).normalizedUrl,
    paste: { originalUrl: short, address, digest: undefined, addedByToken: null },
    link: parseLink(target),
    existing,
    stale: undefined,
  });

export const failedUnder = (instance: Instance, short: string) =>
  saveUnresolved(instance.core, {
    paste: { address: short, addedByToken: null },
    link: parseLink(short),
    fetched: { status: "unresolved" },
    existing: "refresh",
  });

export async function stagedStaleAlias(instance: Instance, short: string) {
  const share = `https://www.reddit.com/r/library/s/${new URL(short).pathname.slice(1)}`;
  const saved = await firstResolved(instance, short, share);

  assert.ok(saved !== null && saved.created, "the share link saves an Item");
  await instance.settledItem(saved.item.id);
  exec(instance, "update items set read_state = 'read' where id = ?", saved.item.id);

  return { share, id: saved.item.id };
}

export async function stillAtShareLink(instance: Instance, id: number, share: string) {
  const item = await instance.detail(id);

  assert.equal(item.normalizedUrl, parseLink(share).normalizedUrl);
  assert.equal(item.readState, "read");
}

export async function pasteVia(instance: Instance, short: string) {
  const answer = await instance.send("POST", "/api/items", { url: short });

  return { status: answer.status, saved: SavedItemResponseSchema.parse(JSON.parse(answer.body)) };
}

export const repastedFrom = (
  instance: Instance,
  short: string,
  resolution: ShortLinkResolution,
  known: AliasedItem | undefined,
  existing: Existing = "refresh",
) =>
  saveResolution(
    instance.core,
    { pasted: short, digest: undefined, existing, addedByToken: null },
    resolution,
    known,
  );

export async function repasted(
  instance: Instance,
  short: string,
  resolution: ShortLinkResolution,
  existing: Existing = "refresh",
) {
  return repastedFrom(instance, short, resolution, await aliasOf(instance, short), existing);
}

export async function beforeSecondBatch<Result>(
  instance: Instance,
  staged: () => Promise<void> | void,
  run: () => Promise<Result>,
): Promise<Result> {
  const { db } = instance.core;
  const real = db.batch.bind(db);
  let batches = 0;

  Object.defineProperty(db, "batch", {
    configurable: true,
    value: async (queries: Parameters<Database["batch"]>[0]) => {
      batches += 1;

      if (batches === 2) await staged();

      return real(queries);
    },
  });

  try {
    const result = await run();

    assert.ok(batches >= 2, "the Paste reached the write the change is staged before");

    return result;
  } finally {
    Reflect.deleteProperty(db, "batch");
  }
}

export async function holdingBeforeSecondBatch<Result>(
  instance: Instance,
  run: () => Promise<Result>,
  alongside?: () => void,
): Promise<Result> {
  try {
    return await beforeSecondBatch(
      instance,
      () => {
        holdLibrary(instance, "running", null);
        alongside?.();
      },
      run,
    );
  } finally {
    releaseLibrary(instance);
  }
}
