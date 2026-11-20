import { z } from "zod";

import { REFUSAL_CODES, SETUP_CODE_STATUSES } from "../core/access-contract.ts";
import {
  BUDGET_SPENT,
  DEFAULT_SCOPES,
  DailyBudgetSchema,
  ScopeListSchema,
  TokenBudgetSchema,
} from "../core/agent-token-contract.ts";
import { READ_STATES, SOURCES } from "../core/item-contract.ts";
import { parseCursor } from "../core/item-cursor.ts";
import { RESTORING_CODE } from "../core/restore-contract.ts";
import { ItemDetailSchema } from "./item-detail-wire.ts";
import { HttpUrlSchema, ItemSchema } from "./item-wire.ts";

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

export const FILTER_FIELDS = {
  q: z.string().max(SEARCH_MAX).optional(),
  topic: z.string().optional(),
  tag: z.string().optional(),
  source: z.enum(SOURCES).optional(),
};

export const ItemQuerySchema = z.object({
  ...FILTER_FIELDS,
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

export const ErrorResponseSchema = z.object({
  error: z.string(),
  fetch: z.literal("refused").optional(),
  code: z.enum(REFUSAL_CODES).optional(),
});

export const UnavailableResponseSchema = z.object({
  error: z.string(),
  code: z.literal(RESTORING_CODE),
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
