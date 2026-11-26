import {
  ASSUMPTIONS,
  type Billed,
  type Counts,
  PRICE_MICROS,
  billedPostsOf,
  capsRecord,
  costOf,
  totalOf,
  usd,
} from "./x-api-probe-cost.ts";
import type { Reading } from "./x-api-probe-count.ts";
import type { Config } from "./x-api-probe-input.ts";
import { BALANCE_SETTLE_MS, type PlannedRequest, worstOf } from "./x-api-probe-plan.ts";

export type Ending =
  | { readonly kind: "completed" }
  | { readonly kind: "cap"; readonly label: string }
  | { readonly kind: "low-balance"; readonly balanceUsd: string; readonly needUsd: string }
  | { readonly kind: "balance-unread"; readonly label: string }
  | { readonly kind: "uncountable"; readonly label: string }
  | {
      readonly kind: "over-plan";
      readonly label: string;
      readonly counted: Billed;
      readonly planned: Billed;
    }
  | { readonly kind: "answer"; readonly label: string; readonly status: number }
  | { readonly kind: "no-answer"; readonly label: string; readonly errorClass: string };

export type Sent = {
  readonly request: PlannedRequest;
  readonly outcome:
    | { readonly kind: "answer"; readonly status: number }
    | { readonly kind: "no-answer"; readonly errorClass: string };
  readonly reading: Reading | null;
  readonly charged: Counts;
  readonly balanceMicros: number | null;
};

export type RunState = { readonly sent: readonly Sent[]; readonly ending: Ending };

function queryText(request: PlannedRequest): string {
  const pairs = Object.entries(request.query).map(([key, value]) => `${key}=${value}`);

  return pairs.length === 0 ? request.path : `${request.path}?${pairs.join("&")}`;
}

function countsText(counts: Counts): string {
  return `${billedPostsOf(counts)} posts, ${counts.users} users, ${counts.usageReads} usage reads = ${usd(costOf(counts))} USD`;
}

export function printPlan(config: Config): void {
  const { probe } = config.input;

  for (const [index, request] of config.plan.entries()) {
    const wait = request.settleFirst ? ` (waits ${BALANCE_SETTLE_MS / 1000} s first)` : "";

    process.stdout.write(
      `${probe} ${index + 1} ${request.label}${wait}\n  GET ${queryText(request)}\n  worst case: ${countsText(request.worst)}\n`,
    );
  }
  process.stdout.write(
    `${probe} worst case of the run: ${countsText(worstOf(config.plan))}; caps ${usd(config.caps.usdMicros)} USD and ${config.caps.posts} posts\n${probe} assumptions that S1 measures:\n${ASSUMPTIONS.map((line) => `  - ${line}\n`).join("")}`,
  );
}

export function redacted(text: string, token: string): string {
  return [token, encodeURIComponent(token), JSON.stringify(token).slice(1, -1)]
    .reduce((kept, secret) => kept.replaceAll(secret, "[redacted]"), text)
    .replaceAll(/Bearer\s+[^\s"'\\]+/giu, "Bearer [redacted]");
}

function readingText(reading: Reading | null): readonly string[] {
  if (reading === null) return ["counts=none"];
  if (reading.kind === "uncountable") return ["counts=uncountable"];
  const { counts, postIds, problems } = reading;

  return [
    `posts=${counts.posts} includedPosts=${counts.includedPosts} users=${counts.users} media=${counts.media} errors=${counts.errors}`,
    postIds.length > 0 ? `ids=${postIds.join(",")}` : "",
    problems.length > 0 ? `problems=${problems.join(",")}` : "",
  ];
}

export function printSent(probe: string, index: number, sent: Sent): void {
  const parts = [
    `${probe} ${index + 1} ${sent.request.label}`,
    sent.outcome.kind === "answer"
      ? `status=${sent.outcome.status}`
      : `no-answer=${sent.outcome.errorClass}`,
    sent.balanceMicros === null ? "" : `balance=${usd(sent.balanceMicros)} USD`,
    ...readingText(sent.reading),
  ];

  process.stdout.write(`${parts.filter((part) => part !== "").join(" ")}\n`);
}

function balanceAt(state: RunState, role: "opening-balance" | "closing-balance") {
  return state.sent.find((item) => item.request.role === role)?.balanceMicros ?? null;
}

function measuredSpendOf(state: RunState) {
  const balances = state.sent.flatMap((item) =>
    item.balanceMicros === null
      ? []
      : [{ label: item.request.label, totalBalanceUsd: usd(item.balanceMicros) }],
  );
  const opening = balanceAt(state, "opening-balance");
  const closing = balanceAt(state, "closing-balance");

  if (opening === null || closing === null)
    return {
      known: false,
      reason: `measured spend unknown: the ${opening === null ? "opening" : "closing"} balance was not read`,
      balances,
    } as const;
  return { known: true, spentUsd: usd(opening - closing), balances } as const;
}

export function summaryOf(config: Config, folder: string, state: RunState) {
  const counted = state.sent.flatMap((item) =>
    item.reading?.kind === "counted" ? [item.reading.counts] : [],
  );
  const total = totalOf(counted);

  return {
    probe: config.input.probe,
    folder,
    ending: state.ending,
    caps: capsRecord(config.caps),
    pricesUsd: {
      post: usd(PRICE_MICROS.post),
      user: usd(PRICE_MICROS.user),
      usageReadAssumed: usd(PRICE_MICROS.usageRead),
    },
    assumptions: ASSUMPTIONS,
    requests: state.sent.map((item) => ({
      label: item.request.label,
      outcome: item.outcome,
      counts: item.reading?.kind === "counted" ? item.reading.counts : null,
    })),
    totals: total,
    countedSpend: {
      complete: counted.length === state.sent.length,
      posts: billedPostsOf(total),
      atTablePricesUsd: usd(costOf({ ...total, usageReads: 0 })),
      withUsageReadsAssumedUsd: usd(costOf(total)),
    },
    chargedForCapsUsd: usd(costOf(totalOf(state.sent.map((item) => item.charged)))),
    measuredSpend: measuredSpendOf(state),
  };
}
