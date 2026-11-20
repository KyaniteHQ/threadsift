import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { parseArgs } from "node:util";

import { z } from "zod";

import {
  type Harness,
  ROUTES,
  type Route,
  type Variant,
  counted,
  inSequence,
  median,
  request,
  WORKING_TREE,
  startHarness,
} from "./worker-build-cost-harness.ts";

const TICKS_PER_SECOND = 100;
const SLOW_ROUTE_DIVISOR = 4;
const SLOW_ROUTE = "GET /api/openapi.json";

const Counts = z.object({
  requests: z.coerce.number().int().positive().default(1500),
  rounds: z.coerce.number().int().positive().default(4),
  warmup: z.coerce.number().int().nonnegative().default(200),
});

const { values } = parseArgs({
  options: {
    baseline: { type: "string" },
    candidate: { type: "string" },
    requests: { type: "string" },
    rounds: { type: "string" },
    warmup: { type: "string" },
    out: { type: "string" },
  },
});
const { requests, rounds, warmup } = Counts.parse(values);
const baseline = z.string().min(1).parse(values.baseline);
const candidate = z.string().min(1).default(WORKING_TREE).parse(values.candidate);

function workerdProcesses(variant: Readonly<Variant>): readonly string[] {
  const listing = execFileSync("ps", ["-o", "pid=,comm=", "-g", String(variant.processGroup)], {
    encoding: "utf8",
  });
  return listing
    .split("\n")
    .map((line) => line.trim().split(/\s+/u))
    .flatMap(([pid, name]) => (name === "workerd" && pid !== undefined ? [pid] : []));
}

function cpuTicks(pids: readonly string[]): number {
  return pids
    .map((pid) => readFileSync(`/proc/${pid}/stat`, "utf8"))
    .map((stat) => stat.slice(stat.lastIndexOf(")") + 2).split(" "))
    .reduce((sum, fields) => sum + Number(fields[11]) + Number(fields[12]), 0);
}

async function cpuMsPerRequest(
  variant: Readonly<Variant>,
  route: Readonly<Route>,
  count: number,
): Promise<number> {
  const pids = workerdProcesses(variant);
  await inSequence(counted(warmup), () => request(variant, route));
  const before = cpuTicks(pids);
  await inSequence(counted(count), () => request(variant, route));
  return ((cpuTicks(pids) - before) * 1000) / TICKS_PER_SECOND / count;
}

async function measure(harness: Readonly<Harness>, route: Readonly<Route>) {
  const count = route.name === SLOW_ROUTE ? Math.round(requests / SLOW_ROUTE_DIVISOR) : requests;
  const perRound: Record<"baseline" | "candidate", number[]> = { baseline: [], candidate: [] };
  await inSequence(counted(rounds), (round) =>
    inSequence(
      round % 2 === 0 ? harness.variants : harness.variants.toReversed(),
      async (variant) => {
        perRound[variant.name].push(await cpuMsPerRequest(variant, route, count));
      },
    ),
  );
  return { count, perRound };
}

const harness = await startHarness([baseline, candidate], "worker-build-cost-cpu-time");
try {
  console.log(
    "| route | requests per round | baseline CPU ms per request | candidate CPU ms per request | added ms |",
  );
  console.log("|---|---|---|---|---|");
  const routes = ROUTES.filter(({ authorized, path }) => authorized || path === "/api/session");
  const results = await inSequence(routes, async (route) => {
    const result = await measure(harness, route);
    const [before, after] = [median(result.perRound.baseline), median(result.perRound.candidate)];
    console.log(
      `| ${route.name} | ${result.count} | ${before.toFixed(2)} | ${after.toFixed(2)} | ${(after - before).toFixed(2)} |`,
    );
    return { route: route.name, ...result };
  });
  console.log(
    `\nMedian of ${rounds} rounds, ${warmup} warm-up requests before each round, load average (1 min) at the end ${loadavg()[0]?.toFixed(1)}`,
  );
  if (values.out !== undefined) {
    writeFileSync(values.out, JSON.stringify({ requests, rounds, warmup, results }));
  }
} finally {
  await harness.stop();
}
