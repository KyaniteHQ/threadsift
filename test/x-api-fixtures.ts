import type { Json } from "./instance.ts";

export const ROOT_ID = "1900000000000000100";

export const AUTHOR_ID = "71";

export const AUTHOR = "reader_one";

export interface PostFields {
  readonly id: string;
  readonly authorId?: string;
  readonly text?: string;
  readonly noteText?: string;
  readonly conversationId?: string;
  readonly createdAt?: string;
  readonly repliedTo?: string | undefined;
  readonly quotes?: string | undefined;
  readonly replyCount?: number;
  readonly likes?: number;
  readonly mediaKeys?: readonly string[];
  readonly urls?: readonly Json[];
}

export function post({
  id,
  authorId = AUTHOR_ID,
  text = `Post ${id}`,
  noteText,
  conversationId = ROOT_ID,
  createdAt = "2026-11-20T10:00:00.000Z",
  repliedTo,
  quotes,
  replyCount = 0,
  likes = 0,
  mediaKeys,
  urls,
}: PostFields): Json {
  const referenced = [
    ...(repliedTo === undefined ? [] : [{ type: "replied_to", id: repliedTo }]),
    ...(quotes === undefined ? [] : [{ type: "quoted", id: quotes }]),
  ];

  const present = Object.entries({
    note_tweet: noteText === undefined ? null : { text: noteText },
    referenced_tweets: referenced.length === 0 ? null : referenced,
    attachments: mediaKeys === undefined ? null : { media_keys: mediaKeys },
    entities: urls === undefined ? null : { urls },
  }).filter(([, value]) => value !== null);

  return {
    ...Object.fromEntries(present),
    id,
    text,
    author_id: authorId,
    conversation_id: conversationId,
    created_at: createdAt,
    edit_history_tweet_ids: [id],
    public_metrics: {
      reply_count: replyCount,
      like_count: likes,
      retweet_count: 0,
      quote_count: 0,
      bookmark_count: 0,
      impression_count: 10,
    },
  };
}

export function user(id: string, username: string): Json {
  return { id, username, name: `Name of ${username}` };
}

export function photo(key: string, url: string): Json {
  return { media_key: key, type: "photo", url, width: 1200, height: 800 };
}

export function lookup(
  data: Json,
  includes: Readonly<{ users?: Json[]; tweets?: Json[]; media?: Json[] }> = {},
): Json {
  return { data, includes: { users: [user(AUTHOR_ID, AUTHOR)], ...includes } };
}

export function searchPage(
  data: readonly Json[],
  users: readonly Json[] = [],
  nextToken: string | null = null,
): Json {
  const paging = Object.entries({ next_token: nextToken }).filter(([, value]) => value !== null);

  return {
    data,
    includes: { users },
    meta: { result_count: data.length, ...Object.fromEntries(paging) },
  };
}

export function absent(id: string, type: "resource-not-found" | "not-authorized-for-resource") {
  return {
    errors: [
      {
        type: `https://api.x.com/2/problems/${type}`,
        title: type === "resource-not-found" ? "Not Found Error" : "Authorization Error",
        resource_type: "tweet",
        resource_id: id,
        parameter: "id",
        value: id,
        detail: `Synthetic detail for ${id}.`,
      },
    ],
  };
}
