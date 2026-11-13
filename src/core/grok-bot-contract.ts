import { z } from "zod";

import { resolveUrl } from "./addresses.ts";
import { allowedAiUrl } from "./ai-url.ts";
import { SECRET_INPUT_MAX } from "./secret-input.ts";

export const GROK_BOT_KEY_MAX = SECRET_INPUT_MAX;

export const GROK_BOT_PING_KIND = "ping";

const PUBLIC_ONLY = true;

const QUERY_OR_FRAGMENT_MARK = /[?#]/u;

const HEADER_SAFE_KEY = /^[\u0021-\u007E]+$/u;

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
    .max(GROK_BOT_KEY_MAX)
    .regex(HEADER_SAFE_KEY, { error: "must be 1 to 4,096 printable ASCII characters, no space" })
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

export const KEY_NEEDED =
  "key: a key is needed when the address is new or the saved key cannot be opened";
