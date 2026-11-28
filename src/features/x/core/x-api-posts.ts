import { z } from "zod";

import { X_API_PROBLEMS } from "../../../core/contract/x-api-contract.ts";
import { StatusIdSchema } from "../../../core/contract/x-wire.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";
import type { Resources } from "./x-api-plan.ts";

const STATUS_LINK = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/u;

const ABSENT_PROBLEMS = new Set([
  `${X_API_PROBLEMS}resource-not-found`,
  `${X_API_PROBLEMS}not-authorized-for-resource`,
]);

const UrlEntitySchema = z
  .looseObject({
    url: z.string(),
    expanded_url: z.string().optional(),
    media_key: z.string().optional(),
  })
  .readonly();

const EntitiesSchema = z
  .looseObject({ urls: z.array(UrlEntitySchema).readonly().optional() })
  .readonly();

const ReferenceSchema = z.looseObject({ type: z.string(), id: StatusIdSchema }).readonly();

const ApiPostSchema = z
  .looseObject({
    id: StatusIdSchema,
    text: z.string(),
    author_id: z.string(),
    conversation_id: StatusIdSchema.optional(),
    created_at: z.iso.datetime({ offset: true }).optional(),
    note_tweet: z
      .looseObject({ text: z.string(), entities: EntitiesSchema.optional() })
      .readonly()
      .optional(),
    referenced_tweets: z.array(ReferenceSchema).readonly().optional(),
    public_metrics: z
      .looseObject({
        reply_count: z.number().int().nonnegative().optional(),
        like_count: z.number().int().nonnegative().optional(),
      })
      .readonly()
      .optional(),
    attachments: z
      .looseObject({ media_keys: z.array(z.string()).readonly().optional() })
      .readonly()
      .optional(),
    entities: EntitiesSchema.optional(),
  })
  .readonly();

export type ApiPost = z.output<typeof ApiPostSchema>;

const UserSchema = z.looseObject({ id: z.string(), username: z.string() }).readonly();

const MediaSchema = z
  .looseObject({ media_key: z.string(), type: z.string(), url: z.string().optional() })
  .readonly();

const IncludesSchema = z
  .looseObject({
    users: z.array(UserSchema).readonly().default([]),
    tweets: z.array(ApiPostSchema).readonly().default([]),
    media: z.array(MediaSchema).readonly().default([]),
  })
  .readonly()
  .default({ users: [], tweets: [], media: [] });

const ProblemSchema = z
  .looseObject({
    type: z.string().optional(),
    resource_id: z.string().optional(),
    value: z.string().optional(),
  })
  .readonly();

const LookupSchema = z
  .looseObject({
    data: ApiPostSchema.optional(),
    includes: IncludesSchema,
    errors: z.array(ProblemSchema).readonly().default([]),
  })
  .readonly();

const SearchPageSchema = z
  .looseObject({
    data: z.array(ApiPostSchema).readonly().default([]),
    includes: IncludesSchema,
    meta: z.looseObject({ next_token: z.string().optional() }).readonly(),
  })
  .readonly();

export type Lookup = z.output<typeof LookupSchema>;

export type SearchPage = z.output<typeof SearchPageSchema>;

export type Includes = z.output<typeof IncludesSchema>;

export function parsedLookup(text: string): Lookup | null {
  return parsedJson(LookupSchema, text);
}

export function parsedPage(text: string): SearchPage | null {
  return parsedJson(SearchPageSchema, text);
}

const Collection = z.array(z.unknown()).readonly().optional();

const IdsSchema = z
  .array(z.looseObject({ id: z.string() }))
  .readonly()
  .optional();

const CountedSchema = z
  .looseObject({
    data: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
    errors: Collection,
    meta: z.looseObject({ result_count: z.number().int().nonnegative().optional() }).optional(),
    includes: z
      .strictObject({
        tweets: IdsSchema,
        posts: IdsSchema,
        users: Collection,
        media: Collection,
        polls: Collection,
        places: Collection,
        topics: Collection,
        calls: Collection,
      })
      .optional(),
  })
  .refine(
    ({ data, errors, meta }) => data !== undefined || errors !== undefined || meta !== undefined,
  )
  .refine(
    ({ data, meta }) =>
      meta?.result_count === undefined ||
      meta.result_count === (Array.isArray(data) ? data.length : data === undefined ? 0 : 1),
  );

export function resourcesOf(text: string): Resources | null {
  const counted = parsedJson(CountedSchema, text);

  if (counted === null) return null;

  const { data, includes } = counted;
  const own = data === undefined ? 0 : Array.isArray(data) ? data.length : 1;
  const included = new Set(
    [...(includes?.tweets ?? []), ...(includes?.posts ?? [])].map(({ id }) => id),
  );

  return { posts: own + included.size, users: includes?.users?.length ?? 0 };
}

export function rootState(lookup: Lookup, statusId: string): "post" | "absent" | "refused" {
  if (lookup.data !== undefined) return lookup.data.id === statusId ? "post" : "refused";

  const absent = lookup.errors.some(
    ({ type, resource_id: resource, value }) =>
      type !== undefined &&
      ABSENT_PROBLEMS.has(type) &&
      (resource === statusId || value === statusId),
  );

  return absent ? "absent" : "refused";
}

export function referenced(post: ApiPost, type: "quoted" | "replied_to"): string | null {
  return post.referenced_tweets?.find((reference) => reference.type === type)?.id ?? null;
}

function decoded(text: string): string {
  return text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function quotesThatPost(expanded: string | undefined, quotedId: string | null): boolean {
  return quotedId !== null && STATUS_LINK.exec(expanded ?? "")?.[1] === quotedId;
}

export function shownText(post: ApiPost, quoteShown: boolean): string {
  const quotedId = quoteShown ? referenced(post, "quoted") : null;
  const links = [...(post.note_tweet?.entities?.urls ?? []), ...(post.entities?.urls ?? [])];

  const linked = links.reduce((text, { url, expanded_url: expanded, media_key: media }) => {
    const shown =
      media !== undefined || quotesThatPost(expanded, quotedId) ? "" : (expanded ?? url);

    return text.replaceAll(url, shown);
  }, post.note_tweet?.text ?? post.text);

  return decoded(linked).trimEnd();
}

export function postedAtOf(post: ApiPost): number | null {
  return post.created_at === undefined ? null : Date.parse(post.created_at);
}
