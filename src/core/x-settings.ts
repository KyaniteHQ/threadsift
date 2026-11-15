import type { XReaderChoice } from "./kinds.ts";
import type { Ports } from "./ports.ts";
import { chosenXReader, offeredReaders, saveXReader, xBotState } from "./x-reader.ts";
import { STATE_NOT_INSTALLED, STATE_WORKER, type XSettingsView } from "./x-settings-contract.ts";

type SettingsPorts = Pick<Ports, "db" | "secrets" | "xFetcher" | "ai">;

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
