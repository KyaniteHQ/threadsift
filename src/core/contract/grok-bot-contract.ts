import { z } from "zod";

import { resolveUrl } from "./addresses.ts";
import { allowedAiUrl } from "./ai-url.ts";
import { groupedNumber } from "./format.ts";
import { HOP_DEADLINE_MS } from "./request-waits.ts";
import { HEADER_SAFE_SECRET, SECRET_INPUT_MAX } from "./secret-input.ts";

export const GROK_BOT_PING_KIND = "ping";

export const AI_TASK_PATH = "/api/ai-tasks/{id}";

const PUBLIC_ONLY = true;

const QUERY_OR_FRAGMENT_MARK = /[?#]/u;

const GROK_BOT_ADDRESS_RULE = "a public https address with no credentials, query or fragment";

export function allowedGrokBotUrl(address: string): boolean {
  return !QUERY_OR_FRAGMENT_MARK.test(address) && allowedAiUrl(address, PUBLIC_ONLY);
}

export function grokBotAddressOf(address: string): string {
  const trimmed = address.trim();

  return resolveUrl(trimmed)?.href ?? trimmed;
}

export const GrokBotInputSchema = z.object({
  webhookUrl: z
    .string()
    .trim()
    .refine(allowedGrokBotUrl, { error: `must be ${GROK_BOT_ADDRESS_RULE}` }),
  key: z
    .string()
    .max(SECRET_INPUT_MAX)
    .regex(HEADER_SAFE_SECRET, {
      error: `must be 1 to ${groupedNumber(SECRET_INPUT_MAX)} printable ASCII characters, no space`,
    })
    .optional(),
});

export type GrokBotInput = z.infer<typeof GrokBotInputSchema>;

export const GrokBotViewSchema = z.discriminatedUnion("configured", [
  z.object({
    configured: z.literal(false),
    webhookUrl: z.null(),
    key: z.enum(["none", "missing"]),
  }),
  z.object({
    configured: z.literal(true),
    webhookUrl: z.string(),
    key: z.enum(["usable", "unreadable", "missing"]),
  }),
]);

export type GrokBotView = z.infer<typeof GrokBotViewSchema>;

const GrokBotRefusedSchema = z.object({
  kind: z.literal("refused"),
  reason: z.enum(["secret-missing"]),
});

export const GrokBotSaveResponseSchema = z.union([GrokBotViewSchema, GrokBotRefusedSchema]);

const GROK_BOT_RESULTS = [
  "ok",
  "wrong-key",
  "not-found",
  "bot-error",
  "unreachable",
  "timeout",
  "refused",
  "not-configured",
  "secret-missing",
] as const;

const GrokBotResultSchema = z.enum(GROK_BOT_RESULTS);

export type GrokBotResult = z.infer<typeof GrokBotResultSchema>;

export const GrokBotTestSchema = z.object({ result: GrokBotResultSchema });

export const ERROR_TEXT_MAX = 200;

export const KEY_NEEDED =
  "key: a key is needed when the address is new or the saved key cannot be opened";

export const VERIFY_WAIT_MS = 60_000;

export const VERIFY_DEADLINE_MS = VERIFY_WAIT_MS + HOP_DEADLINE_MS;

export const GROK_BOT_FIRST = "Save an address and key in the Grok Bot section first.";

export const GROK_BOT_IN_USE =
  "Can’t remove the Grok Bot while it is set as the provider. Pick and save another provider in the AI section first.";

export const GROK_BOT_UNREADY = ["secret-missing", "not-configured", "refused"] as const;

export type GrokBotUnreadyReason = (typeof GROK_BOT_UNREADY)[number];

export const GrokBotUnreadySchema = z.object({
  error: z.string(),
  code: z.enum(["not-configured", "secret-missing"]),
});

export const GrokBotInUseSchema = z.object({
  error: z.literal(GROK_BOT_IN_USE),
  code: z.literal("in-use"),
});

export interface WebhookBody {
  readonly taskId: number;
  readonly kind: string;
  readonly callbackToken: string;
}
