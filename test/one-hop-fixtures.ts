import { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import { SavedItemResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { Instance, type Json } from "./instance.ts";
import { redditAddressOf, listing, postListing } from "./reader-thread-fixtures.ts";

export { redditAddressOf, redditAddressOf as addressOf };

export const DIGEST = {
  title: "A linked page",
  topic: "Links",
  tags: ["links"],
  summary: "What the post links to.\nWhy it matters.",
  keyPoints: ["The post links to a page"],
};

export const SECRET_KEY = "ab".repeat(32);

const COOLDOWN_MS = 30 * 60 * 1000;

export const LINKED = "https://github.com/threadsift-test/linked-repository";

export interface PostFields {
  readonly selftext?: string;
  readonly url?: Json;
}

export function postOf(id: string, { selftext = "", url }: PostFields): Json {
  const fields = { selftext, num_comments: 1 };

  return postListing(id, url === undefined ? fields : { ...fields, url });
}

export function commentsOf(postId: string): Json {
  return listing([
    {
      kind: "t1",
      data: {
        id: "c1",
        author: "replier",
        body: "The page behind the link settles it for good.",
        parent_id: `t3_${postId}`,
        score: 4,
        created_utc: 1_700_000_100,
        replies: "",
      },
    },
  ]);
}

export function hopThreadOf(id: string, fields: PostFields): string {
  return JSON.stringify([postOf(id, fields), commentsOf(id)]);
}

export function withoutComments(id: string, fields: PostFields): string {
  return JSON.stringify([postOf(id, fields), listing([])]);
}

export function toolsOf(instance: Instance) {
  const paste = (url: string, content: string, digest: Json = null) => {
    const body = digest === null ? { url, content } : { url, content, digest };

    return instance.read("POST", "/api/items", SavedItemResponseSchema, body);
  };

  const query = <Schema extends z.ZodType>(
    schema: Schema,
    statement: string,
    ...params: (string | number)[]
  ): z.infer<Schema>[] => {
    const database = new DatabaseSync(instance.databaseFile, { readOnly: true });

    try {
      return database
        .prepare(statement)
        .all(...params)
        .map((row) => schema.parse({ ...row }));
    } finally {
      database.close();
    }
  };

  const candidates = (itemId: number) =>
    query(
      z.object({ generation: z.number(), linked_url: z.string().nullable() }),
      "select generation, linked_url from reddit_threads where item_id = ? order by generation",
      itemId,
    );

  const stored = async (id: string, fields: PostFields) => {
    const { item } = await paste(redditAddressOf(id), hopThreadOf(id, fields));

    return candidates(item.id).at(-1)?.linked_url;
  };

  const digestJobs = (itemId: number) =>
    query(
      z.object({ state: z.string(), attempts: z.number() }),
      "select state, attempts from jobs where item_id = ? and kind = 'digest'",
      itemId,
    );

  const aiTasks = (itemId: number) =>
    query(
      z.object({ executor: z.string() }),
      "select executor from ai_tasks where item_id = ?",
      itemId,
    );

  const pendingDigests = (itemId: number) =>
    query(
      z.object({ pending: z.number() }),
      "select pending_digest is not null as pending from items where id = ?",
      itemId,
    );

  const askForDigest = async (itemId: number) => {
    await instance.send("POST", `/api/items/${String(itemId)}/digest`);

    return instance.settledItem(itemId);
  };

  return { paste, stored, candidates, digestJobs, aiTasks, pendingDigests, askForDigest };
}

export async function warningsDuring<Value>(
  run: (seen: readonly string[]) => Promise<Value>,
): Promise<{ readonly warnings: readonly string[]; readonly value: Value }> {
  const warnings: string[] = [];
  const warn = console.warn;

  console.warn = (line: string) => {
    warnings.push(line);
  };

  try {
    return { warnings, value: await run(warnings) };
  } finally {
    console.warn = warn;
  }
}

export const hopLines = (warnings: readonly string[]) =>
  warnings.filter((line) => line.includes('"digest-hop"'));

export function seedGithubCooldown(instance: Instance): void {
  const database = new DatabaseSync(instance.databaseFile);

  try {
    database
      .prepare("insert into github_cooldown (id, until) values (1, ?)")
      .run(Date.now() + COOLDOWN_MS);
  } finally {
    database.close();
  }
}

export const hopResults = (warnings: readonly string[]) =>
  hopLines(warnings).map((line) => z.object({ result: z.string() }).parse(JSON.parse(line)).result);
