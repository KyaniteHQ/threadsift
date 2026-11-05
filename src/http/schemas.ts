import { z } from "zod";

import { FETCH_RESULTS } from "../core/fetch-results.ts";
import { KINDS, SOURCES } from "../core/kinds.ts";
import { SETUP_CODE_STATUSES } from "../core/setup-code.ts";

const HttpUrlSchema = z.url({ protocol: /^https?$/u });

const ItemSchema = z.object({
  id: z.number().int(),
  source: z.enum(SOURCES),
  kind: z.enum(KINDS),
  normalizedUrl: HttpUrlSchema,
  originalUrl: HttpUrlSchema,
  savedAt: z.number().int(),
  title: z.string().nullable(),
  author: z.string().nullable(),
  community: z.string().nullable(),
  fetchedAt: z.number().int().nullable(),
});

export const SaveItemRequestSchema = z.object({
  url: z.string().trim().pipe(HttpUrlSchema),
});

export const SavedItemResponseSchema = z.object({
  item: ItemSchema,
  url: z.string(),
  fetch: z.enum(FETCH_RESULTS),
});

export const ItemListResponseSchema = z.object({
  items: z.array(ItemSchema),
});

export const REFUSAL_CODES = [
  "wrong",
  "owner-exists",
  "locked",
  "setup-missing",
  "setup-short",
  "password-short",
  "password-long",
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

export const TokenIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type Token = z.infer<typeof TokenSchema>;

export type Item = z.infer<typeof ItemSchema>;
