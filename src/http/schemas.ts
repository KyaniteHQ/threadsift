import { z } from "zod";

import { ReaderDigestSchema } from "../core/ai-contract.ts";
import { CommentsViewSchema } from "../core/comment-view.ts";
import { FETCH_RESULTS } from "../core/fetch-results.ts";
import { HighlightsViewSchema } from "../core/highlight-contract.ts";
import { parseCursor } from "../core/item-page.ts";
import {
  BUDGET_SPENT,
  DEFAULT_SCOPES,
  DailyBudgetSchema,
  DIGEST_OUTCOMES,
  FAILURE_REASONS,
  KINDS,
  READ_STATES,
  ScopeListSchema,
  SETUP_CODE_STATUSES,
  SOURCES,
  TokenBudgetSchema,
  WAIT_REASONS,
} from "../core/kinds.ts";
import { NoteViewSchema } from "../core/note-contract.ts";
import { RelatedSchema } from "../core/related-contract.ts";
import { ItemImageSchema, SizedImageSchema } from "./item-image.ts";

export const HttpUrlSchema = z.url({ protocol: /^https?$/u });

export const WaitSchema = z.object({ reason: z.enum(WAIT_REASONS), retryAt: z.number().int() });

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
  fillable: z.boolean(),
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

export const ItemSchema = withStatus(ItemBaseSchema);

const ItemDetailSchema = withStatus(
  ItemBaseSchema.extend({
    postedAt: z.number().int().nullable(),
    postText: z.string().nullable(),
    digest: ReaderDigestSchema.nullable(),
    repository: RepositorySchema.nullable(),
    images: z.array(SizedImageSchema).readonly(),
    comments: CommentsViewSchema,
    highlights: HighlightsViewSchema,
    note: NoteViewSchema,
    related: RelatedSchema,
  }),
);

export const SavedItemResponseSchema = z.object({
  item: ItemSchema,
  url: z.string(),
});

export const ItemResponseSchema = z.object({ item: ItemSchema });

export const ItemDetailResponseSchema = z.object({ item: ItemDetailSchema });

export const ReadStateRequestSchema = z.object({ readState: z.enum(READ_STATES) });

export const SEARCH_MAX = 200;

export function cursorParam<Cursor>(parse: (text: string) => Cursor | null) {
  return z
    .string()
    .transform((text, context) => {
      const cursor = parse(text);

      if (cursor === null) {
        context.addIssue({ code: "custom", message: "not a well-formed cursor" });

        return z.NEVER;
      }

      return cursor;
    })
    .optional();
}

export const ItemQuerySchema = z.object({
  q: z.string().max(SEARCH_MAX).optional(),
  topic: z.string().optional(),
  tag: z.string().optional(),
  source: z.enum(SOURCES).optional(),
  read: z.enum(READ_STATES).optional(),
  url: HttpUrlSchema.optional(),
  cursor: cursorParam(parseCursor),
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

export const ItemPageResponseSchema = z.object({
  items: z.array(ItemSchema),
  next: z.string().nullable(),
});

export const ItemListResponseSchema = ItemPageResponseSchema.extend({ counts: FilterCountsSchema });

export const ItemReadResponseSchema = ItemPageResponseSchema.extend({
  counts: FilterCountsSchema.optional(),
});

const REFUSAL_CODES = [
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

export const BudgetRefusalSchema = z.object({ error: z.string(), code: z.literal(BUDGET_SPENT) });

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

const TokenNameSchema = z.string().trim().min(1).max(TOKEN_NAME_MAX);

export const CreateTokenRequestSchema = z.object({
  name: TokenNameSchema,
  scopes: ScopeListSchema.min(1)
    .readonly()
    .default([...DEFAULT_SCOPES]),
  dailyBudget: DailyBudgetSchema.optional(),
});

export const ChangeBudgetRequestSchema = z.object({ dailyBudget: DailyBudgetSchema });

const TokenSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  createdAt: z.number().int(),
  lastUsedAt: z.number().int().nullable(),
  scopes: ScopeListSchema.readonly(),
  budget: TokenBudgetSchema,
});

export const CreatedTokenResponseSchema = z.object({ token: TokenSchema, value: z.string() });

export const TokenSummaryResponseSchema = z.object({ token: TokenSchema });

export const TokenListResponseSchema = z.object({ tokens: z.array(TokenSchema) });

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const HighlightParamsSchema = IdParamSchema.extend({
  highlightId: z.coerce.number().int().positive(),
});

export type Token = z.infer<typeof TokenSchema>;

export type CreateTokenRequest = z.input<typeof CreateTokenRequestSchema>;

export type ChangeBudgetRequest = z.infer<typeof ChangeBudgetRequestSchema>;

export type Item = z.infer<typeof ItemSchema>;

export type ItemList = z.infer<typeof ItemListResponseSchema>;

export type ItemPage = z.infer<typeof ItemPageResponseSchema>;

export type ItemDetail = z.infer<typeof ItemDetailSchema>;
