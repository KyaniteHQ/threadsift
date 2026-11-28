import { pause } from "../../../core/contract/pause.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { meteredGet } from "./x-api-metered.ts";
import { type Resources, type XApiRequest, isSearch, microsOf } from "./x-api-plan.ts";
import type { XApiSent } from "./x-api-request.ts";
import { itemSpentOn, spentOn, utcDayOf } from "./x-api-spend.ts";

const SEARCH_SPACING_MS = 1000;

export type ReadPorts = Pick<Ports, "db" | "secrets" | "config">;

export interface Run {
  readonly ports: Readonly<ReadPorts>;
  readonly itemId: number;
  readonly token: string;
  readonly itemLimitMicros: number;
  readonly dayLimitMicros: number;
  readonly signal: AbortSignal;
}

export interface Tally {
  readonly requests: number;
  readonly counted: Resources;
  readonly lastSearchAt: number | null;
}

export function spentBy(tally: Readonly<Tally>): number {
  return microsOf(tally.counted);
}

export async function sent(
  run: Readonly<Run>,
  tally: Readonly<Tally>,
  request: Readonly<XApiRequest>,
): Promise<{ readonly sent: XApiSent; readonly tally: Tally } | null> {
  if (isSearch(request) && tally.lastSearchAt !== null) {
    await pause(Math.max(0, tally.lastSearchAt + SEARCH_SPACING_MS - Date.now()), run.signal);
  }

  const answer = await meteredGet(
    {
      db: run.ports.db,
      dayLimitMicros: run.dayLimitMicros,
      itemId: run.itemId,
      price: { kind: "resources", worst: request.worst },
    },
    {
      origin: run.ports.config.xApiOrigin,
      token: run.token,
      path: request.path,
      signal: run.signal,
    },
  );

  if (answer === null) return null;

  const counted = answer.counted ?? request.worst;

  return {
    sent: answer,
    tally: {
      requests: tally.requests + 1,
      counted: {
        posts: tally.counted.posts + counted.posts,
        users: tally.counted.users + counted.users,
      },
      lastSearchAt: isSearch(request) ? Date.now() : tally.lastSearchAt,
    },
  };
}

export async function leftFor(run: Readonly<Run>): Promise<number> {
  const day = utcDayOf(Date.now());
  const [today, item] = await Promise.all([
    spentOn(run.ports.db, day),
    itemSpentOn(run.ports.db, run.itemId, day),
  ]);

  return Math.min(run.itemLimitMicros - item, run.dayLimitMicros - today.micros);
}
