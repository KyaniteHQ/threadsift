import { z } from "zod";

import { SecretInputSchema } from "./secret-input.ts";
import { WholeCount } from "./whole-count.ts";

export const X_READER_API = "x-api";

export const X_API_ORIGIN = "https://api.x.com";

export const X_API_PROVIDER_DIGESTS = false;

export const MICROS_PER_USD = 1_000_000;

export const X_API_POST_MICROS = 5000;

export const X_API_USER_MICROS = 10_000;

export const X_API_USAGE_READ_MICROS = 200_000;

export const X_API_ITEM_LIMIT_MICROS = 1_000_000;

export const X_API_DAY_LIMIT_MICROS = 3_000_000;

export const X_API_ITEM_LIMIT_MIN_MICROS = 50_000;

const X_API_ITEM_LIMIT_MAX_MICROS = 10_000_000;

const X_API_DAY_LIMIT_MAX_MICROS = 100_000_000;

export const X_API_TOKEN_STATES = ["none", "saved", "unreadable"] as const;

export type XApiTokenState = (typeof X_API_TOKEN_STATES)[number];

export const XApiTokenInputSchema = z.object({ token: SecretInputSchema });

export type XApiTokenInput = z.infer<typeof XApiTokenInputSchema>;

export const XApiLimitsInputSchema = z
  .object({
    itemLimitMicros: z
      .number()
      .int()
      .min(X_API_ITEM_LIMIT_MIN_MICROS)
      .max(X_API_ITEM_LIMIT_MAX_MICROS),
    dayLimitMicros: z
      .number()
      .int()
      .min(X_API_ITEM_LIMIT_MIN_MICROS)
      .max(X_API_DAY_LIMIT_MAX_MICROS),
  })
  .refine(({ itemLimitMicros, dayLimitMicros }) => dayLimitMicros >= itemLimitMicros, {
    error: "dayLimitMicros must be at least itemLimitMicros",
    path: ["dayLimitMicros"],
  });

export type XApiLimits = z.infer<typeof XApiLimitsInputSchema>;

export const XApiSpendSchema = z.object({
  day: z.iso.date(),
  micros: WholeCount,
  posts: WholeCount,
  users: WholeCount,
});

export type XApiSpend = z.infer<typeof XApiSpendSchema>;

export const XApiSettingsViewSchema = z.object({
  token: z.enum(X_API_TOKEN_STATES),
  secretReady: z.boolean(),
  itemLimitMicros: WholeCount,
  dayLimitMicros: WholeCount,
  today: XApiSpendSchema,
});

export type XApiSettingsView = z.infer<typeof XApiSettingsViewSchema>;

export const X_API_REFUSALS = [
  "secret-missing",
  "not-configured",
  "api-key-rejected",
  "api-not-enrolled",
  "api-ip-blocked",
  "api-out-of-credits",
  "api-rate-limited",
  "api-refused",
  "api-unreachable",
  "api-answer-refused",
] as const;

export type XApiRefusal = (typeof X_API_REFUSALS)[number];

const XApiRefusedSchema = z.object({
  kind: z.literal("refused"),
  reason: z.enum(X_API_REFUSALS),
  status: z.number().int().nullable(),
});

export type XApiRefused = z.infer<typeof XApiRefusedSchema>;

export const XApiVerifyResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("verified"), balanceUsd: z.number() }),
  XApiRefusedSchema,
]);

export type XApiVerifyResult = z.infer<typeof XApiVerifyResultSchema>;

export const XApiSaveResponseSchema = z.union([XApiSettingsViewSchema, XApiRefusedSchema]);

export function refusedXApi(reason: XApiRefusal, status: number | null = null): XApiRefused {
  return { kind: "refused", reason, status };
}

export function postsMicros(posts: number, users: number): number {
  return posts * X_API_POST_MICROS + users * X_API_USER_MICROS;
}
