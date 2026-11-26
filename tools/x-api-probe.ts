import { promises as fs } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

import { errnoCodeOf, errorClassOf } from "../src/core/kernel/failure-log.ts";
import { parsedJson } from "../src/core/kernel/parsed-json.ts";
import { balanceOf, billedOf, countedOf } from "./x-api-probe-count.ts";
import { type Config, Refusal, configOf } from "./x-api-probe-input.ts";
import {
  BALANCE_SETTLE_MS,
  type PlannedRequest,
  costOf,
  planOf,
  sumOf,
  usd,
  withinCaps,
  worstOf,
} from "./x-api-probe-plan.ts";
import {
  type Ending,
  type RunState,
  type Sent,
  printPlan,
  printSent,
  redacted,
  summaryOf,
} from "./x-api-probe-report.ts";

const API_ORIGIN = "https://api.x.com";
const REQUEST_DEADLINE_MS = 30_000;
const KEPT_HEADERS = [
  "content-type",
  "date",
  "x-rate-limit-limit",
  "x-rate-limit-remaining",
  "x-rate-limit-reset",
  "x-transaction-id",
  "x-response-time",
] as const;

type Answer =
  | {
      readonly kind: "answer";
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly text: string;
    }
  | { readonly kind: "no-answer"; readonly errorClass: string };

type Run = {
  readonly config: Config;
  readonly plan: readonly PlannedRequest[];
  readonly folder: string;
  readonly token: string;
};

async function writeRecord(run: Run, name: string, json: string): Promise<void> {
  await fs.writeFile(join(run.folder, name), `${redacted(json, run.token)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
}

async function send(request: PlannedRequest, token: string): Promise<Answer> {
  const url = new URL(request.path, API_ORIGIN);

  for (const [key, value] of Object.entries(request.query)) url.searchParams.set(key, value);
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_DEADLINE_MS),
    });
    const headers = Object.fromEntries(
      KEPT_HEADERS.flatMap((name) => {
        const value = response.headers.get(name);

        return value === null ? [] : [[name, value]];
      }),
    );

    return { kind: "answer", status: response.status, headers, text: await response.text() };
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;

    return { kind: "no-answer", errorClass: `${errorClassOf(error)}/${errnoCodeOf(cause)}` };
  }
}

function endingOf(request: PlannedRequest, answer: Answer): Ending | null {
  if (answer.kind === "no-answer")
    return { kind: "no-answer", label: request.label, errorClass: answer.errorClass };
  if (answer.status === 401 || answer.status === 429 || answer.status >= 500)
    return { kind: "answer", label: request.label, status: answer.status };
  return null;
}

async function step(
  run: Run,
  index: number,
  request: PlannedRequest,
): Promise<{ readonly sent: Sent; readonly ending: Ending | null }> {
  if (request.settleFirst) await sleep(BALANCE_SETTLE_MS);
  const answer = await send(request, run.token);
  const text = answer.kind === "answer" ? answer.text : null;
  const counted = text === null ? null : countedOf(request.kind, text);
  const sent: Sent = {
    label: request.label,
    status: answer.kind === "answer" ? answer.status : null,
    counted,
    billed: counted === null ? request.worst : billedOf(counted.counts),
    balanceMicros: text === null || request.kind !== "balance" ? null : balanceOf(text),
  };
  const record = {
    request: { method: "GET", path: request.path, query: request.query },
    sentAt: new Date().toISOString(),
    answer:
      answer.kind === "answer"
        ? {
            status: answer.status,
            headers: answer.headers,
            body: parsedJson(z.json(), answer.text) ?? answer.text,
          }
        : answer,
    counts: counted?.counts ?? null,
  };

  await writeRecord(
    run,
    `${String(index + 1).padStart(2, "0")}-${request.label}.json`,
    JSON.stringify(record, null, 2),
  );
  printSent(run.config.input.probe, index, sent);
  return { sent, ending: endingOf(request, answer) };
}

function balanceEnding(first: Sent, plan: readonly PlannedRequest[]): Ending | null {
  const need = costOf(worstOf(plan));

  if (first.balanceMicros === null) return { kind: "balance-unread" };
  if (first.balanceMicros < need)
    return { kind: "low-balance", balanceUsd: usd(first.balanceMicros), needUsd: usd(need) };
  return null;
}

async function runPlan(run: Run): Promise<RunState> {
  const sent: Sent[] = [];
  const final = run.plan.at(-1);
  let capped: Ending | null = null;

  for (const [index, request] of run.plan.entries()) {
    const isFinal = request === final;

    if (capped !== null && !isFinal) continue;
    const spent = sumOf(sent.map((item) => item.billed));
    const reserve = isFinal || final === undefined ? [] : [final.worst];

    if (!withinCaps(sumOf([spent, request.worst, ...reserve]), run.config.caps)) {
      capped ??= { kind: "cap", label: request.label };
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- Requests go one at a time, so each balance read follows the requests before it and each cap check counts every earlier answer.
    const done = await step(run, index, request);

    sent.push(done.sent);
    const ending = done.ending ?? (index === 0 ? balanceEnding(done.sent, run.plan) : null);

    if (ending !== null) return { sent, ending };
  }
  return { sent, ending: capped ?? { kind: "completed" } };
}

async function runLive(
  config: Config,
  plan: readonly PlannedRequest[],
  token: string,
  runsDir: string,
): Promise<number> {
  const stamp = new Date()
    .toISOString()
    .replace(/\.\d+Z$/u, "Z")
    .replaceAll(":", "-");
  const run: Run = { config, plan, token, folder: join(runsDir, `${stamp}-${config.input.probe}`) };

  await fs.mkdir(runsDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(run.folder, { mode: 0o700 });
  const planRecord = {
    input: config.input,
    caps: { usd: usd(config.caps.usdMicros), posts: config.caps.posts },
    settleSeconds: BALANCE_SETTLE_MS / 1000,
    requests: plan.map((request) => ({ ...request, worstUsd: usd(costOf(request.worst)) })),
    worstUsd: usd(costOf(worstOf(plan))),
  };

  await writeRecord(run, "plan.json", JSON.stringify(planRecord, null, 2));
  const state = await runPlan(run);
  const summary = summaryOf(run.config, run.folder, state);

  await writeRecord(run, "summary.json", JSON.stringify(summary, null, 2));
  process.stdout.write(
    `${JSON.stringify({ ending: summary.ending, countedSpend: summary.countedSpend, measuredSpend: summary.measuredSpend, folder: run.folder })}\n`,
  );
  return state.ending.kind === "completed" ? 0 : 1;
}

function main(): number | Promise<number> {
  const config = configOf();
  const plan = planOf(config.input);

  if (config.caps.usdMicros === 0 || config.caps.posts === 0) {
    process.stdout.write(
      `${config.input.probe}: a cap is 0, so the run sends no request, not even a balance read\n`,
    );
    return 0;
  }
  printPlan(config, plan);
  const worst = worstOf(plan);

  if (!withinCaps(worst, config.caps))
    throw new Refusal(
      `the worst case of ${config.input.probe} is ${usd(costOf(worst))} USD and ${worst.posts} posts, above the caps; raise them to at least that, up to the ceiling`,
    );
  switch (config.mode.kind) {
    case "dry":
      process.stdout.write(
        `${config.input.probe}: dry run, the worst case fits the caps, no request sent\n`,
      );
      return 0;
    case "live":
      return runLive(config, plan, config.mode.token, config.mode.runsDir);
    default:
      return config.mode satisfies never;
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  if (!(error instanceof Refusal)) throw error;
  process.stderr.write(`live:x-api refused: ${error.message}\n`);
  process.exitCode = 1;
}
