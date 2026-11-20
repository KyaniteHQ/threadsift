import { statusIdOf } from "../../../core/contract/links.ts";
import type { XReadNote } from "../../../core/contract/x-read-note.ts";
import {
  X_READER_BOT,
  type XReaderChoice,
  type XBotState,
} from "../../../core/contract/x-settings-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import type { XFetcher } from "../../../core/kernel/x-fetcher-port.ts";
import type { Fetched } from "../../media/core/details.ts";
import { hasOpenIntakeTask } from "./x-intake-state.ts";
import { chosenXReader, xBotState } from "./x-settings.ts";

type ReaderPorts = Pick<Ports, "db" | "secrets" | "xFetcher" | "ai">;

interface XReaders {
  readonly bot: XBotState;
  readonly cli: XFetcher | null;
}

export type XRoute =
  | { readonly kind: typeof X_READER_BOT }
  | { readonly kind: "grok-cli"; readonly fetcher: XFetcher }
  | { readonly kind: "none"; readonly note: XReadNote | null };

const BOT: XRoute = { kind: X_READER_BOT };

const NO_READER: XRoute = { kind: "none", note: null };

const NOTE_OF_BOT_STATE = {
  "not-configured": "bot-not-set-up",
  "secret-missing": "bot-key-unopened",
  refused: "bot-address-refused",
} as const satisfies Readonly<Record<Exclude<XBotState, "ready">, XReadNote>>;

function cliRoute(cli: XFetcher | null, missing: XReadNote | null): XRoute {
  return cli === null ? { kind: "none", note: missing } : { kind: "grok-cli", fetcher: cli };
}

function routeOf(choice: XReaderChoice, { bot, cli }: Readonly<XReaders>): XRoute {
  switch (choice) {
    case "auto":
      return bot === "ready" ? BOT : cliRoute(cli, null);
    case X_READER_BOT:
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
