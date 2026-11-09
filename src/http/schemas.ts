import { z } from "zod";

import { DigestSchema, ReaderDigestSchema } from "../core/ai-contract.ts";
import { CommentsViewSchema } from "../core/comment-view.ts";
import { logFailure } from "../core/failure-log.ts";
import { FETCH_RESULTS } from "../core/fetch-results.ts";
import { HighlightsViewSchema } from "../core/highlight-contract.ts";
import {
  DIGEST_OUTCOMES,
  FAILURE_REASONS,
  KINDS,
  type FailureReason,
  READ_STATES,
  SOURCES,
  WAIT_REASONS,
  type WaitReason,
} from "../core/kinds.ts";
import type { ItemRow } from "../core/schema.ts";
import { SETUP_CODE_STATUSES } from "../core/setup-code.ts";
import { SuppliedPageSchema } from "../core/supplied-page.ts";
import { type ImageColumns, ItemImageSchema, SizedImageSchema, imageOf } from "./item-image.ts";

const HttpUrlSchema = z.url({ protocol: /^https?$/u });

const WaitSchema = z.object({ reason: z.enum(WAIT_REASONS), retryAt: z.number().int() });

const ItemBaseSchema = z.object({
  id: z.number().int(),
  source: z.enum(SOURCES),
  kind: z.enum(KINDS),
  normalizedUrl: HttpUrlSchema,
  originalUrl: HttpUrlSchema,
  savedAt: z.number().int(),
  title: z.string().nullable(),
  digestTitle: z.string().nullable(),
  digestTopic: z.string().nullable(),
  digestOutcome: z.enum(DIGEST_OUTCOMES),
  author: z.string().nullable(),
  community: z.string().nullable(),
  fetchedAt: z.number().int().nullable(),
  fetch: z.enum(FETCH_RESULTS).nullable(),
  readState: z.enum(READ_STATES),
  stars: z.number().int().nonnegative().nullable(),
  commentsKept: z.number().int().nonnegative().nullable(),
  commentsTotal: z.number().int().nonnegative().nullable(),
  wait: WaitSchema.nullable(),
  image: ItemImageSchema.nullable(),
});

const RepositorySchema = z.object({
  description: z.string().nullable(),
  stars: z.number().int().nonnegative(),
  language: z.string().nullable(),
  license: z.string().nullable(),
  topics: z.array(z.string()).readonly(),
  pushedAt: z.number().int().nullable(),
});

function withStatus<Fields extends Readonly<Record<string, z.ZodType>>>(base: z.ZodObject<Fields>) {
  return z.union([
    base.extend({
      status: z.literal("failed"),
      reason: z.enum(FAILURE_REASONS),
      retry: z.literal("paste"),
    }),
    base.extend({ status: z.literal("processing"), reason: z.null(), retry: z.null() }),
    base.extend({
      status: z.literal("ready"),
      reason: z.null(),
      retry: z.enum(["digest", "paste"]),
      digestOutcome: z.literal("failed"),
    }),
    base.extend({
      status: z.literal("ready"),
      reason: z.null(),
      retry: z.null(),
      digestOutcome: z.literal("none"),
    }),
  ]);
}

const ItemSchema = withStatus(ItemBaseSchema);

const ItemDetailSchema = withStatus(
  ItemBaseSchema.extend({
    postedAt: z.number().int().nullable(),
    postText: z.string().nullable(),
    digest: ReaderDigestSchema.nullable(),
    repository: RepositorySchema.nullable(),
    images: z.array(SizedImageSchema).readonly(),
    comments: CommentsViewSchema,
    highlights: HighlightsViewSchema,
  }),
);

export const SaveItemRequestSchema = z.object({
  content: z.string().optional(),
  digest: DigestSchema.optional(),
  page: SuppliedPageSchema.optional(),
  url: z.string().trim().pipe(HttpUrlSchema),
});

export const SavedItemResponseSchema = z.object({
  item: ItemSchema,
  url: z.string(),
});

export const ItemResponseSchema = z.object({ item: ItemSchema });

export const ItemDetailResponseSchema = z.object({ item: ItemDetailSchema });

export const ReadStateRequestSchema = z.object({ readState: z.enum(READ_STATES) });

export const SEARCH_MAX = 200;

export const ItemQuerySchema = z.object({
  q: z.string().max(SEARCH_MAX).optional(),
  topic: z.string().optional(),
  tag: z.string().optional(),
  source: z.enum(SOURCES).optional(),
  read: z.enum(READ_STATES).optional(),
});

const CountedNameSchema = z.object({
  key: z.string(),
  name: z.string(),
  count: z.number().int(),
});

function counted<Key extends z.ZodType<string>>(key: Key) {
  return z.array(z.object({ key, count: z.number().int() })).readonly();
}

export const FilterCountsSchema = z.object({
  total: z.number().int(),
  unread: z.number().int(),
  sources: counted(z.enum(SOURCES)),
  reads: counted(z.enum(READ_STATES)),
  topics: z.array(CountedNameSchema).readonly(),
  tags: z.array(CountedNameSchema).readonly(),
});

export const ItemListResponseSchema = z.object({
  items: z.array(ItemSchema),
  counts: FilterCountsSchema,
});

export const REFUSAL_CODES = [
  "wrong",
  "owner-exists",
  "locked",
  "setup-missing",
  "setup-short",
  "password-short",
  "password-long",
  "password-changed",
  "reset-missing",
  "reset-short",
  "reset-used",
  "no-owner",
] as const;

export type RefusalCode = (typeof REFUSAL_CODES)[number];

export const ErrorResponseSchema = z.object({
  error: z.string(),
  fetch: z.literal("refused").optional(),
  code: z.enum(REFUSAL_CODES).optional(),
});

export const SessionStateSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("setup"), code: z.enum(SETUP_CODE_STATUSES) }),
  z.object({ state: z.enum(["signed-out", "signed-in"]) }),
]);

export const SetupCodeRequestSchema = z.object({ code: z.string() });

export const SetupRequestSchema = z.object({ code: z.string(), password: z.string() });

export const LoginRequestSchema = z.object({ password: z.string() });

export const ChangePasswordRequestSchema = z.object({
  current: z.string(),
  password: z.string(),
});

export const ResetPasswordRequestSchema = z.object({ code: z.string(), password: z.string() });

export const TOKEN_NAME_MAX = 80;

export const TokenNameSchema = z.string().trim().min(1).max(TOKEN_NAME_MAX);

export const CreateTokenRequestSchema = z.object({ name: TokenNameSchema });

export const TokenSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  createdAt: z.number().int(),
  lastUsedAt: z.number().int().nullable(),
});

export const CreatedTokenResponseSchema = z.object({ token: TokenSchema, value: z.string() });

export const TokenListResponseSchema = z.object({ tokens: z.array(TokenSchema) });

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const HighlightParamsSchema = IdParamSchema.extend({
  highlightId: z.coerce.number().int().positive(),
});

export type Token = z.infer<typeof TokenSchema>;

export type Item = z.infer<typeof ItemSchema>;

export type ItemList = z.infer<typeof ItemListResponseSchema>;

export type ItemDetail = z.infer<typeof ItemDetailSchema>;

type StatusFields =
  | { readonly status: "failed"; readonly reason: FailureReason; readonly retry: "paste" }
  | { readonly status: "processing"; readonly reason: null; readonly retry: null }
  | {
      readonly status: "ready";
      readonly reason: null;
      readonly retry: "digest" | "paste";
      readonly digestOutcome: "failed";
    }
  | {
      readonly status: "ready";
      readonly reason: null;
      readonly retry: null;
      readonly digestOutcome: "none";
    };

type StatusRow = Pick<ItemRow, "id" | "status" | "reason"> & {
  readonly digestOutcome: (typeof DIGEST_OUTCOMES)[number];
  readonly digestSource: boolean;
  readonly waitReason: WaitReason | null;
  readonly retryAt: number | null;
} & ImageColumns;

type Wait = z.infer<typeof WaitSchema>;

function waitOf({ status, waitReason, retryAt }: Readonly<StatusRow>): Wait | null {
  return status === "processing" && waitReason !== null && retryAt !== null
    ? { reason: waitReason, retryAt }
    : null;
}

function statusOf(item: Readonly<StatusRow>): StatusFields {
  const { id, status, reason } = item;

  if (status === "failed") {
    if (reason === null) {
      throw new Error(`Item ${String(id)} is failed and has no reason`);
    }

    return { status, reason, retry: "paste" };
  }

  if (reason !== null) {
    throw new Error(`Item ${String(id)} is ${status} and has the reason ${reason}`);
  }

  if (status === "processing") return { status, reason, retry: null };

  if (item.digestOutcome === "pending") {
    throw new Error(`Item ${String(id)} is ready and its Digest is pending`);
  }

  if (item.digestOutcome === "none") return { status, reason, retry: null, digestOutcome: "none" };

  return {
    status,
    reason,
    retry: item.digestSource ? "digest" : "paste",
    digestOutcome: "failed",
  };
}

export function itemView<Row extends StatusRow>(
  row: Readonly<Row>,
): Omit<Row, keyof ImageColumns | "status" | "reason" | "digestSource" | "waitReason" | "retryAt"> &
  StatusFields & {
    readonly wait: Wait | null;
    readonly image: z.infer<typeof ItemImageSchema> | null;
  } {
  const {
    digestSource: _digestSource,
    waitReason: _waitReason,
    retryAt: _retryAt,
    imageKey: _imageKey,
    imageAlt: _imageAlt,
    ...view
  } = row;

  return { ...view, ...statusOf(row), wait: waitOf(row), image: imageOf(row) };
}

export function shownItems<Row extends StatusRow>(rows: readonly Readonly<Row>[]) {
  return rows.flatMap((row) => {
    try {
      const view = itemView(row);
      ItemSchema.parse(view);

      return [view];
    } catch (error) {
      logFailure("item-not-shown", { itemId: row.id }, error);

      return [];
    }
  });
}
