import { statusIdOf } from "../../../core/contract/links.ts";
import { X_READER_API, type XApiTokenState } from "../../../core/contract/x-api-contract.ts";
import type { XReadNote } from "../../../core/contract/x-read-note.ts";
import {
  X_READER_BOT,
  type XReaderChoice,
  type XBotState,
} from "../../../core/contract/x-settings-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import type { XFetcher } from "../../../core/kernel/x-fetcher-port.ts";
import type { Fetched } from "../../media/core/details.ts";
import { type ApiRead, fetchedByXApi } from "./x-api-read.ts";
import { xApiTokenState } from "./x-api-token.ts";
import { type ToVerify, fetchedByX } from "./x-fetcher.ts";
import { hasOpenIntakeTask } from "./x-intake-state.ts";
import { type XReaders, autoReaderOf, chosenXReader, xBotState } from "./x-settings.ts";

type ReaderPorts = Pick<Ports, "db" | "secrets" | "xFetcher" | "ai">;

export type XRead = Fetched | ToVerify | ApiRead;

export type XRoute =
  | { readonly kind: typeof X_READER_BOT }
  | { readonly kind: "grok-cli"; readonly fetcher: XFetcher }
  | { readonly kind: typeof X_READER_API }
  | { readonly kind: "none"; readonly note: XReadNote | null };

const BOT: XRoute = { kind: X_READER_BOT };

const API: XRoute = { kind: X_READER_API };

const NOTE_OF_API_STATE = {
  none: "api-not-set-up",
  unreadable: "api-key-unopened",
} as const satisfies Readonly<Record<Exclude<XApiTokenState, "saved">, XReadNote>>;

const NO_READER: XRoute = { kind: "none", note: null };

const NOTE_OF_BOT_STATE = {
  "not-configured": "bot-not-set-up",
  "secret-missing": "bot-key-unopened",
  refused: "bot-address-refused",
} as const satisfies Readonly<Record<Exclude<XBotState, "ready">, XReadNote>>;

function cliRoute(cli: XFetcher | null, missing: XReadNote | null): XRoute {
  return cli === null ? { kind: "none", note: missing } : { kind: "grok-cli", fetcher: cli };
}

function autoRoute(readers: Readonly<XReaders>): XRoute {
  switch (autoReaderOf(readers).reader) {
    case X_READER_BOT:
      return BOT;
    case "grok-cli":
      return cliRoute(readers.cli, null);
    case X_READER_API:
      return API;
    case null:
      return NO_READER;
    default:
      throw new Error("unknown auto reader");
  }
}

export function routeOf(choice: XReaderChoice, readers: Readonly<XReaders>): XRoute {
  const { bot, cli, api } = readers;

  switch (choice) {
    case "auto":
      return autoRoute(readers);
    case X_READER_BOT:
      return bot === "ready" ? BOT : { kind: "none", note: NOTE_OF_BOT_STATE[bot] };
    case "grok-cli":
      return cliRoute(cli, "cli-not-installed");
    case X_READER_API:
      return api === "saved" ? API : { kind: "none", note: NOTE_OF_API_STATE[api] };
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

  const [choice, bot, api] = await Promise.all([
    chosenXReader(ports),
    xBotState(ports),
    xApiTokenState(ports),
  ]);

  return routeOf(choice, { bot, cli: ports.xFetcher, api });
}

export function noted(fetched: Readonly<Fetched>, route: Readonly<XRoute>): Fetched {
  if (route.kind !== "none" || route.note === null || fetched.status === "waiting") return fetched;

  return { ...fetched, note: route.note };
}

export function fetchedByReader(
  ports: Readonly<Pick<Ports, "db" | "secrets" | "config" | "network">>,
  route: Readonly<XRoute>,
  job: Readonly<{ itemId: number; address: string; attempts: number }>,
  deadline: AbortSignal,
): Promise<XRead> | null {
  if (route.kind === X_READER_API) return fetchedByXApi(ports, job, deadline);

  return fetchedByX(ports, route.kind === "grok-cli" ? route.fetcher : null, job, deadline);
}
