import { z } from "zod";

import { SETUP_CODE_STATUSES } from "./access-contract.ts";
import {
  DEFAULT_SCOPES,
  DailyBudgetSchema,
  ScopeListSchema,
  TokenBudgetSchema,
} from "./agent-token-contract.ts";

export const SessionStateSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("setup"), code: z.enum(SETUP_CODE_STATUSES) }),
  z.object({ state: z.literal("signed-out") }),
  z.object({ state: z.literal("signed-in"), database: z.string().min(1) }),
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

export const CallerScopesResponseSchema = z.object({ scopes: ScopeListSchema.readonly() });

export type Token = z.infer<typeof TokenSchema>;

export type CreateTokenRequest = z.input<typeof CreateTokenRequestSchema>;

export type ChangeBudgetRequest = z.infer<typeof ChangeBudgetRequestSchema>;
