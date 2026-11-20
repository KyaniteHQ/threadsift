import { z } from "zod";

import { SETTINGS_CHANGED } from "./ai-contract.ts";
import { PROVIDERS } from "./provider-families.ts";

export const CONNECT_START_PATH = "/api/settings/ai/openrouter/start";
export const CONNECT_CALLBACK_PATH = "/api/settings/ai/openrouter/callback";
export const CONNECT_LIFETIME_MS = 10 * 60 * 1000;

export const ConnectStartInputSchema = z.object({
  model: PROVIDERS.openrouter.fields.model,
  revision: z.number().int().min(0),
});

export type ConnectStartInput = z.infer<typeof ConnectStartInputSchema>;

export const ConnectStartResponseSchema = z.object({
  authorizationUrl: z.url(),
  expiresAt: z.number().int(),
});

export const ConnectNoticeSchema = z.enum([
  "connected",
  "incomplete",
  SETTINGS_CHANGED,
  "possible-orphan",
  "activation-pending",
]);

export type ConnectNotice = z.infer<typeof ConnectNoticeSchema>;

export const NOTICE_PARAMETER = "openrouter";

export const SETTINGS_PATH = "/settings";

export function returnAddress(notice: ConnectNotice | null): string {
  return notice === null ? SETTINGS_PATH : `${SETTINGS_PATH}?${NOTICE_PARAMETER}=${notice}`;
}

export type OpenRouterExchange =
  | { readonly kind: "key"; readonly key: string }
  | { readonly kind: "refused" }
  | { readonly kind: "uncertain" };
