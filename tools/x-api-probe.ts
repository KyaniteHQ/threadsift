import { appStep, dryAppRun } from "./x-api-probe-app-step.ts";
import {
  ASSUMPTIONS,
  billedOf,
  billedPostsOf,
  capsRecord,
  costOf,
  exceedsPlan,
  totalOf,
  usd,
  withinCaps,
} from "./x-api-probe-cost.ts";
import { type Config, configOf } from "./x-api-probe-input.ts";
import {
  BALANCE_SETTLE_MS,
  PLAN_FILE,
  Refusal,
  SUMMARY_FILE,
  endsRunOn,
  usageFailureRuleOf,
  worstOf,
} from "./x-api-probe-plan.ts";
import type { PlannedRequest } from "./x-api-probe-plan.ts";
import {
  type Ending,
  type RunState,
  type Sent,
  balanceAt,
  printPlan,
  summaryOf,
} from "./x-api-probe-report.ts";
import { createdRunFolder } from "./x-api-probe-runs-dir.ts";
import { type Run, step, writeRecord } from "./x-api-probe-step.ts";

const MIDNIGHT_MARGIN_MS = 15 * 60_000;

const DAY_MS = 86_400_000;

type Next = { readonly kind: "go" } | { readonly kind: "stop" | "end"; readonly ending: Ending };

function openingNext(config: Config, sent: Sent): Next {
  const need = costOf(worstOf(config.plan));

  if (sent.balanceMicros === null)
    return { kind: "end", ending: { kind: "balance-unread", label: sent.request.label } };
  if (sent.balanceMicros < need)
    return {
      kind: "end",
      ending: { kind: "low-balance", balanceUsd: usd(sent.balanceMicros), needUsd: usd(need) },
    };
  return { kind: "go" };
}

type Outcome = Sent["outcome"];

function appNext(label: string, outcome: Extract<Outcome, { kind: "app" }>): Next {
  return outcome.published
    ? { kind: "go" }
    : { kind: "stop", ending: { kind: "unpublished", label, why: outcome.why } };
}

function nextOf(config: Config, sent: Sent, outcome: Exclude<Outcome, { kind: "app" }>): Next {
  const { label, role, worst } = sent.request;

  if (outcome.kind === "no-answer")
    return { kind: "end", ending: { kind: "no-answer", label, errorClass: outcome.errorClass } };
  const { status } = outcome;

  if (endsRunOn(sent.request, status))
    return { kind: "end", ending: { kind: "answer", label, status } };
  switch (role) {
    case "opening-balance":
      return openingNext(config, sent);
    case "mid-balance":
      return sent.balanceMicros === null
        ? { kind: "stop", ending: { kind: "balance-unread", label } }
        : { kind: "go" };
    case "lookup":
      if (sent.reading?.kind !== "counted")
        return { kind: "stop", ending: { kind: "uncountable", label } };
      if (exceedsPlan(sent.reading.counts, worst))
        return {
          kind: "stop",
          ending: {
            kind: "over-plan",
            label,
            counted: billedOf(sent.reading.counts),
            planned: billedOf(worst),
          },
        };
      return { kind: "go" };
    case "usage":
    case "closing-balance":
    case "app-read":
      return { kind: "go" };
    default:
      return role satisfies never;
  }
}

function sentBy(run: Run, index: number, request: PlannedRequest): Promise<Sent> {
  return request.role === "app-read" ? appStep(run, index, request) : step(run, index, request);
}

function nextAfter(config: Config, sent: Sent): Next {
  const { outcome } = sent;

  return outcome.kind === "app"
    ? appNext(sent.request.label, outcome)
    : nextOf(config, sent, outcome);
}

function overCap(config: Config, state: RunState): Ending | null {
  const opening = balanceAt(state, "opening-balance");
  const closing = balanceAt(state, "closing-balance");

  if (opening === null || closing === null || opening - closing <= config.caps.usdMicros)
    return null;
  return {
    kind: "over-cap",
    measuredUsd: usd(opening - closing),
    capUsd: usd(config.caps.usdMicros),
  };
}

async function runPlan(run: Run): Promise<RunState> {
  const { plan, caps } = run.config;
  const closing = plan.find((request) => request.role === "closing-balance");
  const sent: Sent[] = [];
  let stop: Ending | null = null;

  for (const [index, request] of plan.entries()) {
    const isClosing = request === closing;

    if (stop !== null && !isClosing) continue;
    const reserve = isClosing || closing === undefined ? [] : [closing.worst];
    const charged = totalOf([...sent.map((item) => item.charged), request.worst, ...reserve]);

    if (!withinCaps(charged, caps)) {
      stop ??= { kind: "cap", label: request.label };
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- Requests go one at a time, so each balance read follows the requests before it and each cap check counts every earlier answer.
    const done = await sentBy(run, index, request);

    sent.push(done);
    const next = nextAfter(run.config, done);

    if (next.kind === "end") return { sent, ending: next.ending };
    if (next.kind === "stop") stop ??= next.ending;
  }
  const closingRead = sent.find((item) => item.request === closing);
  const measuredOver = overCap(run.config, { sent, ending: { kind: "completed" } });

  return {
    sent,
    ending:
      measuredOver ??
      stop ??
      ((closingRead?.balanceMicros ?? null) === null
        ? { kind: "balance-unread", label: closing?.label ?? "balance-after" }
        : { kind: "completed" }),
  };
}

function minutesToMidnight(config: Config, now: number): number | null {
  const left = DAY_MS - (now % DAY_MS);

  if (!config.plan.some((request) => request.role === "app-read") || left >= MIDNIGHT_MARGIN_MS)
    return null;
  return Math.floor(left / 60_000);
}

async function runLive(config: Config, token: string, runFolder: string): Promise<number> {
  const run: Run = { config, token, folder: runFolder };
  const minutesLeft = minutesToMidnight(config, Date.now());

  if (minutesLeft !== null) {
    process.stdout.write(
      `${config.input.probe}: ${String(minutesLeft)} min to 00:00 UTC, under the ${String(MIDNIGHT_MARGIN_MS / 60_000)} min margin, so no request was sent\n`,
    );
    return 1;
  }

  await createdRunFolder(runFolder);
  const planRecord = {
    input: config.input,
    caps: capsRecord(config.caps),
    settleSeconds: BALANCE_SETTLE_MS / 1000,
    assumptions: ASSUMPTIONS,
    onUsageFailure: usageFailureRuleOf(config.input.probe, config.plan),
    requests: config.plan.map((request) => ({
      ...request,
      worstUsd: usd(costOf(request.worst)),
    })),
    worstUsd: usd(costOf(worstOf(config.plan))),
  };

  await writeRecord(run, PLAN_FILE, JSON.stringify(planRecord, null, 2));
  const state = await runPlan(run);
  const summary = summaryOf(config, run.folder, state);

  await writeRecord(run, SUMMARY_FILE, JSON.stringify(summary, null, 2));
  process.stdout.write(
    `${JSON.stringify({ ending: summary.ending, usageQuestion: summary.usageQuestion, countedSpend: summary.countedSpend, measuredSpend: summary.measuredSpend, folder: run.folder })}\n`,
  );
  return state.ending.kind === "completed" ? 0 : 1;
}

async function dryRun(config: Config): Promise<number> {
  const { probe } = config.input;
  const appRead = config.plan.find((request) => request.role === "app-read");

  process.stdout.write(`${probe}: dry run, the worst case fits the caps, no request sent to X\n`);
  if (appRead !== undefined && (probe === "S4" || probe === "S5"))
    process.stdout.write(`${await dryAppRun(probe, appRead.path)}\n`);
  return 0;
}

function main(): Promise<number> {
  const config = configOf();

  if (config.caps.usdMicros === 0 || config.caps.posts === 0) {
    process.stdout.write(
      `${config.input.probe}: a cap is 0, so the run sends no request, not even a balance read\n`,
    );
    return Promise.resolve(0);
  }
  printPlan(config);
  const worst = worstOf(config.plan);

  if (!withinCaps(worst, config.caps))
    throw new Refusal(
      `the worst case of ${config.input.probe} is ${usd(costOf(worst))} USD and ${billedPostsOf(worst)} posts, above the caps; raise them to at least that, up to the ceiling`,
    );
  switch (config.mode.kind) {
    case "dry":
      return dryRun(config);
    case "live":
      return runLive(config, config.mode.token, config.mode.runFolder);
    default:
      return config.mode satisfies never;
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  if (!(error instanceof Refusal)) throw error;
  process.stderr.write(`x-api:probe refused: ${error.message}\n`);
  process.exitCode = 1;
}
