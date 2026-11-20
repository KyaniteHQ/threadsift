import { z } from "zod";

import { GROK_BOT_UNREADY } from "./grok-bot-contract.ts";

export const X_READER_BOT = "grok-bot";

export const X_READER_CHOICES = ["auto", X_READER_BOT, "grok-cli"] as const;

const X_FETCHER_STATES = ["signed-in", "signed-out", "not-proven", "unknown"] as const;

export type XReaderChoice = (typeof X_READER_CHOICES)[number];

export type XFetcherState = (typeof X_FETCHER_STATES)[number];

export const STATE_NOT_INSTALLED = "not-installed";

export const STATE_WORKER = "worker";

export const X_READER_NOT_OFFERED =
  "This install has no grok CLI, so X links can be read by auto or grok-bot only.";

const X_BOT_STATES = ["ready", ...GROK_BOT_UNREADY] as const;

export const XSettingsViewSchema = z.object({
  reader: z.enum(X_READER_CHOICES),
  choices: z.array(z.enum(X_READER_CHOICES)).readonly(),
  bot: z.enum(X_BOT_STATES),
  fetcher: z.literal("grok-cli").nullable(),
  state: z.enum([STATE_NOT_INSTALLED, STATE_WORKER, ...X_FETCHER_STATES]),
  version: z.string().nullable(),
});

export const XReaderInputSchema = z.object({ reader: z.enum(X_READER_CHOICES) });

export type XBotState = (typeof X_BOT_STATES)[number];

export type XSettingsView = z.output<typeof XSettingsViewSchema>;
