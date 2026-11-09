import { type APIResponse, test } from "@playwright/test";
import { z } from "zod";

import type { Instance } from "./access.ts";
import { attachJson } from "./card.ts";
import { digestOf } from "./files.ts";

const TEXT_BODY_CHARACTERS = 20_000;

const AllMedia = z.array(
  z.object({
    id: z.number(),
    item_id: z.number(),
    kind: z.string(),
    source_url: z.string(),
    final_url: z.string().nullable(),
    position: z.number(),
    outcome: z.string(),
    reason: z.string().nullable(),
    file_key: z.string().nullable(),
    content_type: z.string().nullable(),
    size: z.number().nullable(),
  }),
);

const AllItems = z.array(
  z.object({
    id: z.number(),
    url: z.string(),
    title: z.string().nullable(),
    source: z.string(),
    kind: z.string(),
    status: z.string(),
    post_text: z.string().nullable(),
    post_text_key: z.string().nullable(),
  }),
);

type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

async function attachValue(name: string, value: Json): Promise<void> {
  await attachJson(test.info(), `${name}.json`, JSON.stringify(value, null, 2));
}

function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .slice(0, 40);
}

function textOf(text: string | null) {
  return text === null
    ? null
    : {
        characters: text.length,
        sha256: digestOf(text),
        start: text.slice(0, TEXT_BODY_CHARACTERS),
      };
}

export async function attachExchange(what: string, response: APIResponse): Promise<void> {
  const body = await response.body();
  const type = response.headers()["content-type"] ?? "";
  const textual = /^(?:text\/|application\/json)/u.test(type);

  await attachValue(`http-${slugOf(what)}-${digestOf(`${what} ${response.url()}`).slice(0, 8)}`, {
    url: response.url(),
    status: response.status(),
    headers: response.headers(),
    body: { bytes: body.length, sha256: digestOf(body) },
    text: textual ? body.toString("utf8").slice(0, TEXT_BODY_CHARACTERS) : null,
  });
}

export async function attachSnapshot(instance: Instance): Promise<void> {
  const media = instance.query(
    "SELECT id, item_id, kind, source_url, final_url, position, outcome, reason, file_key, content_type, size FROM media ORDER BY item_id, kind, position",
    AllMedia,
  );

  const items = instance.query(
    "SELECT id, normalized_url AS url, title, source, kind, status, post_text, post_text_key FROM items ORDER BY id",
    AllItems,
  );

  const files = instance.listFiles("items/").map(({ key, size, uploadedAt }) => ({
    key,
    size,
    uploadedAt,
    sha256: digestOf(instance.readFile(key) ?? ""),
  }));

  await attachValue("media-rows", media);
  await attachValue("files", files);
  await attachValue(
    "items",
    items.map((item) => ({
      id: item.id,
      url: item.url,
      title: item.title,
      source: item.source,
      kind: item.kind,
      status: item.status,
      postText: textOf(item.post_text),
      postTextKey: item.post_text_key,
    })),
  );
}
