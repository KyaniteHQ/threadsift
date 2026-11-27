import { pause } from "../../../core/contract/pause.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { type Resources, type XApiRequest, microsOf } from "./x-api-plan.ts";
import { type XApiSent, xApiGet } from "./x-api-request.ts";
import { reserved, settled, spentOn, utcDayOf } from "./x-api-spend.ts";

const SEARCH_SPACING_MS = 1000;

export type ReadPorts = Pick<Ports, "db" | "secrets" | "config">;

export interface Run {
  readonly ports: Readonly<ReadPorts>;
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
  const day = utcDayOf(Date.now());
  const worstMicros = microsOf(request.worst);
  const { db } = run.ports;

  if (!(await reserved(db, { day, worstMicros, dayLimitMicros: run.dayLimitMicros }))) return null;

  if (request.search && tally.lastSearchAt !== null) {
    await pause(Math.max(0, tally.lastSearchAt + SEARCH_SPACING_MS - Date.now()), run.signal);
  }

  const answer = await xApiGet({
    origin: run.ports.config.xApiOrigin,
    token: run.token,
    path: request.path,
    signal: run.signal,
  });
  const counted = answer.counted ?? request.worst;

  await settled(db, { day, worstMicros, counted });

  return {
    sent: answer,
    tally: {
      requests: tally.requests + 1,
      counted: {
        posts: tally.counted.posts + counted.posts,
        users: tally.counted.users + counted.users,
      },
      lastSearchAt: request.search ? Date.now() : tally.lastSearchAt,
    },
  };
}

export async function leftFor(run: Readonly<Run>, tally: Readonly<Tally>): Promise<number> {
  const today = await spentOn(run.ports.db, utcDayOf(Date.now()));

  return Math.min(run.itemLimitMicros - spentBy(tally), run.dayLimitMicros - today.micros);
}
