import { expectArticle, expectOther, requireFixture } from "./check-content.ts";
import {
  consumersOk,
  idleMinutes,
  inOrder,
  itemDetail,
  measuredPaste,
  sumOf,
} from "./check-measure.ts";
import { BEER, BIRD, BREAD, EXAMPLE, type Page } from "./check-pages.ts";
import type { Run } from "./check-run.ts";
import type { Findings } from "./check-types.ts";
import type { Copy } from "./copy-calls.ts";
import { workerSettings } from "./copy-control.ts";

const RUNS_PER_PAGE = 3;

const PAGES = [EXAMPLE, BREAD, BIRD, BEER] as const;

export function stats(values: readonly number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return {
    min: sorted[0] ?? Number.NaN,
    median: sorted[middle] ?? Number.NaN,
    max: sorted.at(-1) ?? Number.NaN,
  };
}

async function totalCpu(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
  page: Readonly<Page>,
  index: number,
): Promise<number> {
  const label = `cpu-${String(PAGES.indexOf(page))}-${String(index)}`;
  const pasted = await measuredPaste(run, copy, label, page.url, findings);
  const detail = await itemDetail(copy, pasted.id);

  if (page === EXAMPLE) {
    expectOther(findings, page, detail);
  } else {
    expectArticle(findings, page, detail);
  }

  const { ok, outcomes } = consumersOk(pasted.consumers);
  findings.check(
    `${page.name} run ${String(index + 1)}: every consumer invocation ended ok`,
    ok,
    outcomes,
  );

  const total = sumOf(pasted.consumers, "cpuMs");
  findings.measure(`${page.name} run ${String(index + 1)}: total fetch-consumer cpu ms`, total);

  return total;
}

async function pageMedian(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
  page: Readonly<Page>,
): Promise<number> {
  const runs = await inOrder(
    Array.from({ length: RUNS_PER_PAGE }, (_, index) => index),
    (index) => totalCpu(run, copy, findings, page, index),
  );

  const { min, median, max } = stats(runs);
  findings.measure(`${page.name}: min total fetch-consumer cpu ms`, min);
  findings.measure(`${page.name}: median total fetch-consumer cpu ms`, median);
  findings.measure(`${page.name}: max total fetch-consumer cpu ms`, max);

  return median;
}

export async function cpuCheck(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<void> {
  await inOrder(PAGES, (page) => requireFixture(findings, page));

  findings.measure(
    "idle minutes before the first measured Paste (180 when none earlier)",
    await idleMinutes(run, "queue", Date.now()),
  );

  const [example, ...articles] = await inOrder(PAGES, (page) =>
    pageMedian(run, copy, findings, page),
  );

  for (const [index, median] of articles.entries()) {
    findings.measure(
      `${PAGES[index + 1]?.name ?? ""}: added cpu ms compared with example.com`,
      median - (example ?? Number.NaN),
    );
  }

  const deployed = await workerSettings(run.stage, run.stage.target.name);

  findings.check(
    "limits.cpu_ms on the deployed Worker equals wrangler.jsonc of the deployed head",
    deployed.cpuMs === run.cpuLimitMs,
    `${String(deployed.cpuMs)} against ${String(run.cpuLimitMs)}`,
  );
}
