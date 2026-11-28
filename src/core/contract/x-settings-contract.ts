import { z } from "zod";

import { GROK_BOT_UNREADY } from "./grok-bot-contract.ts";
import { X_API_TOKEN_STATES, X_READER_API } from "./x-api-contract.ts";

export const X_READER_BOT = "grok-bot";

export const X_READER_CHOICES = ["auto", X_READER_BOT, "grok-cli", X_READER_API] as const;

const X_FETCHER_STATES = ["signed-in", "signed-out", "not-proven", "unknown"] as const;

export type XReaderChoice = (typeof X_READER_CHOICES)[number];

export type XFetcherState = (typeof X_FETCHER_STATES)[number];

export const X_CLI_BARS = ["extra-tools", "probe-acted"] as const;

export type XCliBar = (typeof X_CLI_BARS)[number];

export const CliVersionSchema = z.string().regex(/^[0-9][0-9A-Za-z.+-]{0,63}$/u);

export const RefusedUpdateSchema = z.object({
  version: CliVersionSchema,
  reason: z.enum(X_CLI_BARS),
});

export type RefusedUpdate = z.output<typeof RefusedUpdateSchema>;

export const STATE_NOT_INSTALLED = "not-installed";

export const STATE_WORKER = "worker";

export const X_READER_NOT_OFFERED =
  "This install has no grok CLI, so X links can be read by auto, grok-bot or x-api only.";

const X_BOT_STATES = ["ready", ...GROK_BOT_UNREADY] as const;

export const AUTO_REASONS = ["bot-ready", "cli-installed", "api-token-saved", "no-reader"] as const;

export type AutoReason = (typeof AUTO_REASONS)[number];

export const XSettingsViewSchema = z.object({
  reader: z.enum(X_READER_CHOICES),
  choices: z.array(z.enum(X_READER_CHOICES)).readonly(),
  bot: z.enum(X_BOT_STATES),
  fetcher: z.literal("grok-cli").nullable(),
  state: z.enum([STATE_NOT_INSTALLED, STATE_WORKER, ...X_FETCHER_STATES]),
  version: z.string().nullable(),
  refusedUpdate: RefusedUpdateSchema.nullable(),
  api: z.enum(X_API_TOKEN_STATES),
  auto: z.object({
    reader: z.enum([X_READER_BOT, "grok-cli", X_READER_API]).nullable(),
    because: z.enum(AUTO_REASONS),
  }),
});

export const XReaderInputSchema = z.object({ reader: z.enum(X_READER_CHOICES) });

export type XBotState = (typeof X_BOT_STATES)[number];

export type XSettingsView = z.output<typeof XSettingsViewSchema>;
