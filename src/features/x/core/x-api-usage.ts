import { z } from "zod";

import { DAY_MS } from "../../../core/contract/time-units.ts";
import { X_API_USAGE_READ_MICROS } from "../../../core/contract/x-api-contract.ts";
import { report } from "../../../core/kernel/failure-log.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";
import { claimingRun } from "../../wiki/core/scheduled-claim.ts";
import { meteredGet } from "./x-api-metered.ts";
import type { ReadPorts } from "./x-api-send.ts";
import { recordXPosts, spentOn, utcDayOf } from "./x-api-spend.ts";
import { loadXApi, tokenSaved } from "./x-api-token.ts";

const USAGE_TASK = "x-api-usage";

const USAGE_PATH = "/2/usage/tweets?days=2&usage.fields=daily_project_usage";

const UsageSchema = z.object({
  data: z.object({
    daily_project_usage: z.object({
      usage: z
        .array(z.object({ date: z.string(), usage: z.string().regex(/^\d+$/u).nullish() }))
        .readonly(),
    }),
  }),
});

function postsOn(text: string, day: string): number | null {
  const usage = parsedJson(UsageSchema, text)?.data.daily_project_usage.usage ?? [];
  const entry = usage.find(({ date }) => date.startsWith(day));

  return entry?.usage === undefined || entry.usage === null ? null : Number(entry.usage);
}

export async function readXApiUsage(ports: Readonly<ReadPorts>, now: number): Promise<void> {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const claimed = await claimingRun(ports.db, USAGE_TASK, today, DAY_MS, tokenSaved());

  if (claimed.length === 0) return;

  const { auth, limits } = await loadXApi(ports);

  if (auth.kind !== "token") return;

  const yesterday = utcDayOf(today - DAY_MS);
  const sent = await meteredGet(
    {
      db: ports.db,
      dayLimitMicros: limits.dayLimitMicros,
      item: null,
      price: { kind: "flat", micros: X_API_USAGE_READ_MICROS },
    },
    {
      origin: ports.config.xApiOrigin,
      token: auth.token,
      path: USAGE_PATH,
      signal: new AbortController().signal,
    },
  );

  if (sent === null) {
    report(USAGE_TASK, { read: "over-limit" });

    return;
  }

  const { answer } = sent;
  const xPosts = answer.kind === "ok" ? postsOn(answer.text, yesterday) : null;
  const counted = await spentOn(ports.db, yesterday);

  report(USAGE_TASK, {
    read: xPosts === null ? "no-data" : "read",
    status: answer.kind === "refused" ? answer.status : null,
    day: yesterday,
    countedPosts: counted.posts,
    countedUsers: counted.users,
    xPosts,
  });

  if (xPosts !== null) await recordXPosts(ports.db, yesterday, xPosts);
}
