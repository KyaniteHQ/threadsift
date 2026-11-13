import { z } from "zod";

import { X_READER_CHOICES, type XReaderChoice } from "./kinds.ts";
import type { Ports } from "./ports.ts";
import { X_FETCHER_STATES } from "./x-fetcher.ts";
import { X_BOT_STATES, chosenXReader, offeredReaders, saveXReader, xBotState } from "./x-reader.ts";

const STATE_NOT_INSTALLED = "not-installed";
const STATE_WORKER = "worker";

export const X_READER_NOT_OFFERED =
  "This install has no grok CLI, so X links can be read by auto or grok-bot only.";

type SettingsPorts = Pick<Ports, "db" | "secrets" | "xFetcher" | "ai">;

export const XSettingsViewSchema = z.object({
  reader: z.enum(X_READER_CHOICES),
  choices: z.array(z.enum(X_READER_CHOICES)).readonly(),
  bot: z.enum(X_BOT_STATES),
  fetcher: z.literal("grok-cli").nullable(),
  state: z.enum([STATE_NOT_INSTALLED, STATE_WORKER, ...X_FETCHER_STATES]),
  version: z.string().nullable(),
});

export const XReaderInputSchema = z.object({ reader: z.enum(X_READER_CHOICES) });

export type XSettingsView = z.output<typeof XSettingsViewSchema>;

async function cliView({ xFetcher, ai }: Readonly<Pick<Ports, "xFetcher" | "ai">>) {
  if (xFetcher === null) {
    return {
      fetcher: null,
      state: ai.publicOnly ? STATE_WORKER : STATE_NOT_INSTALLED,
      version: null,
    } as const;
  }

  const { state, version } = await xFetcher.status();

  return { fetcher: xFetcher.id, state, version };
}

export async function readXSettings(ports: Readonly<SettingsPorts>): Promise<XSettingsView> {
  const [reader, bot, cli] = await Promise.all([
    chosenXReader(ports),
    xBotState(ports),
    cliView(ports),
  ]);

  return { reader, choices: offeredReaders(ports), bot, ...cli };
}

export async function chooseXReader(
  ports: Readonly<SettingsPorts>,
  reader: XReaderChoice,
): Promise<XSettingsView | null> {
  if (!offeredReaders(ports).includes(reader)) return null;

  await saveXReader(ports, reader);

  return readXSettings(ports);
}
