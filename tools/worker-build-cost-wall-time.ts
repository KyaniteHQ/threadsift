import { writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

import { z } from "zod";

import {
  ROUTES,
  type Route,
  type Variant,
  type Variants,
  request,
  WORKING_TREE,
  withHarness,
} from "./worker-build-cost-harness.ts";
import { counted, inSequence, median, percentile } from "./worker-build-cost-stats.ts";

const Counts = z.object({
  pairs: z.coerce.number().int().positive().default(400),
  warmup: z.coerce.number().int().nonnegative().default(60),
});

const { values } = parseArgs({
  options: {
    baseline: { type: "string" },
    candidate: { type: "string" },
    pairs: { type: "string" },
    warmup: { type: "string" },
    out: { type: "string" },
  },
});
const { pairs, warmup } = Counts.parse(values);
const baseline = z.string().min(1).parse(values.baseline);
const candidate = z.string().min(1).default(WORKING_TREE).parse(values.candidate);

interface Samples {
  readonly baseline: readonly number[];
  readonly candidate: readonly number[];
}

async function timed(variant: Readonly<Variant>, route: Readonly<Route>): Promise<number> {
  const start = performance.now();
  await request(variant, route);
  return performance.now() - start;
}

async function measure(variants: Variants, route: Readonly<Route>): Promise<Samples> {
  const taken: Record<Variant["name"], number[]> = { baseline: [], candidate: [] };
  const [first, second] = variants;
  await inSequence(counted(warmup + pairs), (pair) =>
    inSequence(pair % 2 === 0 ? [first, second] : [second, first], async (variant) => {
      const ms = await timed(variant, route);
      if (pair >= warmup) taken[variant.name].push(ms);
    }),
  );
  return taken;
}

function row(label: string, samples: readonly number[], baselineMedian: number): string {
  const added = median(samples);
  const share = baselineMedian === 0 ? 0 : (added / baselineMedian) * 100;
  return `| ${label} | ${added.toFixed(2)} | ${percentile(samples, 95).toFixed(2)} | ${percentile(samples, 99).toFixed(2)} | ${share.toFixed(1)} |`;
}

function report(route: Readonly<Route>, samples: Readonly<Samples>): string {
  const baselineMedian = median(samples.baseline);
  const differences = samples.baseline.map((ms, index) => (samples.candidate[index] ?? ms) - ms);
  return [
    `## ${route.name}`,
    "| series | median ms | p95 ms | p99 ms | share of baseline median % |",
    "|---|---|---|---|---|",
    row("baseline", samples.baseline, baselineMedian),
    row("candidate", samples.candidate, baselineMedian),
    row("candidate minus baseline, per pair", differences, baselineMedian),
  ].join("\n");
}

await withHarness([baseline, candidate], "worker-build-cost-wall-time", async (variants) => {
  const load = [loadavg()[0]];
  const results = await inSequence(ROUTES, async (route) => {
    const samples = await measure(variants, route);
    console.log(report(route, samples));
    load.push(loadavg()[0]);
    return { route: route.name, samples };
  });
  console.log(
    `\npairs ${pairs}, warm-up pairs ${warmup}, load average (1 min) before each route and at the end: ${load.map((n) => n?.toFixed(1)).join(", ")}`,
  );
  if (values.out !== undefined) {
    writeFileSync(values.out, JSON.stringify({ pairs, warmup, load, results }));
  }
});
