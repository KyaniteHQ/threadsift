import { eq } from "drizzle-orm";

import { X_READER_API, type XApiTokenState } from "../../../core/contract/x-api-contract.ts";
import {
  type AutoReason,
  X_READER_BOT,
  X_READER_CHOICES,
  type XReaderChoice,
  STATE_NOT_INSTALLED,
  STATE_WORKER,
  type XBotState,
  type XSettingsView,
} from "../../../core/contract/x-settings-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { xSettings } from "../../../core/kernel/schema.ts";
import type { XFetcher } from "../../../core/kernel/x-fetcher-port.ts";
import { grokBotConnection } from "../../ai/core/grok-bot-ready.ts";
import { xApiTokenState } from "./x-api-token.ts";

type ChoicePorts = Pick<Ports, "db" | "xFetcher" | "ai">;

type SettingsPorts = Pick<Ports, "db" | "secrets" | "xFetcher" | "ai">;

export interface XReaders {
  readonly bot: XBotState;
  readonly cli: XFetcher | null;
  readonly api: XApiTokenState;
}

interface AutoReader {
  readonly reader: typeof X_READER_BOT | "grok-cli" | typeof X_READER_API | null;
  readonly because: AutoReason;
}

export function autoReaderOf({ bot, cli, api }: Readonly<XReaders>): AutoReader {
  if (bot === "ready") return { reader: X_READER_BOT, because: "bot-ready" };

  if (cli !== null) return { reader: "grok-cli", because: "cli-installed" };

  return api === "saved"
    ? { reader: X_READER_API, because: "api-token-saved" }
    : { reader: null, because: "no-reader" };
}

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
      refusedUpdate: null,
    } as const;
  }

  const { state, version, refusedUpdate } = await xFetcher.status();

  return { fetcher: xFetcher.id, state, version, refusedUpdate };
}

export async function readXSettings(ports: Readonly<SettingsPorts>): Promise<XSettingsView> {
  const [reader, bot, cli, api] = await Promise.all([
    chosenXReader(ports),
    xBotState(ports),
    cliView(ports),
    xApiTokenState(ports),
  ]);

  return {
    reader,
    choices: offeredReaders(ports),
    bot,
    ...cli,
    api,
    auto: autoReaderOf({ bot, cli: ports.xFetcher, api }),
  };
}

export async function chooseXReader(
  ports: Readonly<SettingsPorts>,
  reader: XReaderChoice,
): Promise<XSettingsView | null> {
  if (!offeredReaders(ports).includes(reader)) return null;

  await saveXReader(ports, reader);

  return readXSettings(ports);
}
