import { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { Instance, type Json } from "./instance.ts";

export const DIGEST = {
  title: "A linked page",
  topic: "Links",
  tags: ["links"],
  summary: "What the post links to.\nWhy it matters.",
  keyPoints: ["The post links to a page"],
};

export const SECRET_KEY = "ab".repeat(32);

export const UNREACHABLE = "https://hop.invalid/page";

export interface PostFields {
  readonly selftext?: string;
  readonly url?: Json;
}

export function postOf(id: string, { selftext = "", url }: PostFields): Json {
  const post = {
    id,
    title: `Post ${id}`,
    author: "poster",
    subreddit: "links",
    selftext,
    created_utc: 1_700_000_000,
    num_comments: 1,
  };

  const data = url === undefined ? post : { ...post, url };

  return { kind: "Listing", data: { children: [{ kind: "t3", data }] } };
}

export function commentsOf(postId: string): Json {
  return {
    kind: "Listing",
    data: {
      children: [
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
      ],
    },
  };
}

export function threadOf(id: string, fields: PostFields): string {
  return JSON.stringify([postOf(id, fields), commentsOf(id)]);
}

export function withoutComments(id: string, fields: PostFields): string {
  return JSON.stringify([postOf(id, fields), { kind: "Listing", data: { children: [] } }]);
}

export function addressOf(id: string): string {
  return `https://www.reddit.com/r/links/comments/${id}/a_post/`;
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
    const { item } = await paste(addressOf(id), threadOf(id, fields));

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

  const askForDigest = async (itemId: number) => {
    await instance.send("POST", `/api/items/${String(itemId)}/digest`);

    return instance.settledItem(itemId);
  };

  return { paste, stored, candidates, digestJobs, aiTasks, askForDigest };
}
