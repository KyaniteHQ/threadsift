import { eq } from "drizzle-orm";

import { grokBotConnection } from "../ai/grok-bot-ready.ts";
import {
  X_READER_CHOICES,
  type XReaderChoice,
  STATE_NOT_INSTALLED,
  STATE_WORKER,
  type XBotState,
  type XSettingsView,
} from "../contract/x-settings-contract.ts";
import type { Ports } from "../kernel/ports.ts";
import { xSettings } from "../kernel/schema.ts";

type ChoicePorts = Pick<Ports, "db" | "xFetcher" | "ai">;

type SettingsPorts = Pick<Ports, "db" | "secrets" | "xFetcher" | "ai">;

function offeredReaders({
  xFetcher,
  ai,
}: Readonly<Pick<Ports, "xFetcher" | "ai">>): readonly XReaderChoice[] {
  return xFetcher === null && ai.publicOnly
    ? X_READER_CHOICES.filter((choice) => choice !== "grok-cli")
    : X_READER_CHOICES;
}

export async function chosenXReader(ports: Readonly<ChoicePorts>): Promise<XReaderChoice> {
  const [row] = await ports.db
    .select({ reader: xSettings.reader })
    .from(xSettings)
    .where(eq(xSettings.id, 1));

  const saved = row?.reader ?? "auto";

  return offeredReaders(ports).includes(saved) ? saved : "auto";
}

async function saveXReader(
  { db }: Readonly<Pick<Ports, "db">>,
  reader: XReaderChoice,
): Promise<void> {
  await db
    .insert(xSettings)
    .values({ id: 1, reader })
    .onConflictDoUpdate({ target: xSettings.id, set: { reader } });
}

export async function xBotState(
  ports: Readonly<Pick<Ports, "db" | "secrets">>,
): Promise<XBotState> {
  const connection = await grokBotConnection(ports);

  return connection.kind === "ready" ? "ready" : connection.reason;
}

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
