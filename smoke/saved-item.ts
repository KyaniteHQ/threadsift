import { execFile } from "node:child_process";

import { type APIRequestContext, expect } from "@playwright/test";
import type { ZodType } from "zod";

import {
  ItemDetailResponseSchema,
  ItemResponseSchema,
  SavedItemResponseSchema,
} from "../src/core/contract/item-route-wire.ts";
import type { SaveItemInput } from "../src/core/contract/save-wire.ts";

export async function savedItem(
  request: APIRequestContext,
  input: Readonly<SaveItemInput>,
): Promise<number> {
  const saved = await request.post("/api/items", { data: input });

  expect(saved.status(), `the Paste of ${input.url}`).toBe(201);

  return SavedItemResponseSchema.parse(await saved.json()).item.id;
}

async function readItem<Read>(
  request: APIRequestContext,
  path: string,
  schema: ZodType<{ item: Read }>,
): Promise<Read> {
  const read = await request.get(path);

  return schema.parse(await read.json()).item;
}

export function itemDetail(request: APIRequestContext, id: number) {
  return readItem(request, `/api/items/${String(id)}`, ItemDetailResponseSchema);
}

export function itemStatus(request: APIRequestContext, id: number) {
  return readItem(request, `/api/items/${String(id)}/status`, ItemResponseSchema);
}

export const savedTopicItem = (
  request: APIRequestContext,
  topic: Readonly<{ link: string; name: string; itemTitle: string; summary: string }>,
  markdown: string,
  { tag, keyPoint }: Readonly<{ tag: string; keyPoint: string }>,
): Promise<number> =>
  savedItem(request, {
    url: topic.link,
    page: { markdown, title: topic.itemTitle },
    digest: {
      title: topic.itemTitle,
      topic: topic.name,
      tags: [tag],
      summary: topic.summary,
      keyPoints: [keyPoint],
    },
  });

const PORT = process.env["THREADSIFT_SMOKE_PORT"] ?? "8799";

const DATABASE_COMMAND = {
  container: [
    "podman",
    "exec",
    `threadsift-smoke-${PORT}`,
    "node",
    "-e",
    "const db = new (require('node:sqlite').DatabaseSync)('/data/threadsift.db'); db.exec('pragma busy_timeout = 5000'); db.exec(process.argv[1]);",
  ],
  worker: [
    "pnpm",
    "exec",
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    ".wrangler/smoke/state",
    "--command",
  ],
} as const;

function runOnDatabase(statement: string): Promise<void> {
  const target = process.env["THREADSIFT_TARGET"] === "worker" ? "worker" : "container";
  const [command = "", ...args] = DATABASE_COMMAND[target];

  return new Promise((resolve, reject) => {
    execFile(command, [...args, statement], { timeout: 60_000 }, (error) => {
      if (error === null) resolve();
      else reject(new Error(`${command} could not change the smoke database`, { cause: error }));
    });
  });
}

export async function whileRestoreHolds(act: () => Promise<void>): Promise<void> {
  const now = String(Date.now());

  await runOnDatabase(
    `insert into restores (state, phase, failure, restored, bytes, parts, part_bytes, created_at, updated_at) values ('failed', 'files', 'gave-up', '{}', 1, 1, 1, ${now}, ${now})`,
  );

  try {
    await act();
  } finally {
    await runOnDatabase("delete from restores");
  }
}
