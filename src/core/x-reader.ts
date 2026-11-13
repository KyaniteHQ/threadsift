import { eq } from "drizzle-orm";

import { hasOpenIntakeTask } from "./bot-task-states.ts";
import type { Fetched } from "./details.ts";
import { GROK_BOT_UNREADY, type GrokBotUnready, grokBotConnection } from "./grok-bot.ts";
import { X_READER_CHOICES, type XReadNote, type XReaderChoice } from "./kinds.ts";
import { statusIdOf } from "./links.ts";
import type { Ports } from "./ports.ts";
import { xSettings } from "./schema.ts";
import type { XFetcher } from "./x-fetcher.ts";

export const X_BOT_STATES = ["ready", ...GROK_BOT_UNREADY] as const;

export type XBotState = (typeof X_BOT_STATES)[number];

type ChoicePorts = Pick<Ports, "db" | "xFetcher" | "ai">;

type ReaderPorts = Pick<Ports, "db" | "secrets" | "xFetcher" | "ai">;

interface XReaders {
  readonly bot: XBotState;
  readonly cli: XFetcher | null;
}

export type XRoute =
  | { readonly kind: "grok-bot" }
  | { readonly kind: "grok-cli"; readonly fetcher: XFetcher }
  | { readonly kind: "none"; readonly note: XReadNote | null };

const BOT: XRoute = { kind: "grok-bot" };

export const NO_READER: XRoute = { kind: "none", note: null };

const NOTE_OF_BOT_STATE = {
  "not-configured": "bot-not-set-up",
  "secret-missing": "bot-key-unopened",
  refused: "bot-address-refused",
} as const satisfies Readonly<Record<GrokBotUnready, XReadNote>>;

export function offeredReaders({
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

export async function saveXReader(
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

function cliRoute(cli: XFetcher | null, missing: XReadNote | null): XRoute {
  return cli === null ? { kind: "none", note: missing } : { kind: "grok-cli", fetcher: cli };
}

export function routeOf(choice: XReaderChoice, { bot, cli }: Readonly<XReaders>): XRoute {
  switch (choice) {
    case "auto":
      return bot === "ready" ? BOT : cliRoute(cli, null);
    case "grok-bot":
      return bot === "ready" ? BOT : { kind: "none", note: NOTE_OF_BOT_STATE[bot] };
    case "grok-cli":
      return cliRoute(cli, "cli-not-installed");
    default: {
      const exhaustive: never = choice;

      return exhaustive;
    }
  }
}

export async function xRouteOf(
  ports: Readonly<ReaderPorts>,
  job: Readonly<{ id: number; address: string }>,
): Promise<XRoute> {
  if (statusIdOf(job.address) === null) return NO_READER;

  if (await hasOpenIntakeTask(ports.db, job.id)) return BOT;

  const [choice, bot] = await Promise.all([chosenXReader(ports), xBotState(ports)]);

  return routeOf(choice, { bot, cli: ports.xFetcher });
}

export function noted(fetched: Readonly<Fetched>, route: Readonly<XRoute>): Fetched {
  if (route.kind !== "none" || route.note === null || fetched.status === "waiting") return fetched;

  return { ...fetched, note: route.note };
}
