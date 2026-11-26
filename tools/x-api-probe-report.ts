import type { Counted } from "./x-api-probe-count.ts";
import { totalOf } from "./x-api-probe-count.ts";
import type { Config } from "./x-api-probe-input.ts";
import {
  BALANCE_SETTLE_MS,
  PRICE_MICROS,
  type PlannedRequest,
  type Resources,
  costOf,
  sumOf,
  usd,
  worstOf,
} from "./x-api-probe-plan.ts";

export type Ending =
  | { readonly kind: "completed" }
  | { readonly kind: "cap"; readonly label: string }
  | { readonly kind: "low-balance"; readonly balanceUsd: string; readonly needUsd: string }
  | { readonly kind: "balance-unread" }
  | { readonly kind: "answer"; readonly label: string; readonly status: number }
  | { readonly kind: "no-answer"; readonly label: string; readonly errorClass: string };

export type Sent = {
  readonly label: string;
  readonly status: number | null;
  readonly counted: Counted | null;
  readonly billed: Resources;
  readonly balanceMicros: number | null;
};

export type RunState = { readonly sent: readonly Sent[]; readonly ending: Ending };

function queryText(request: PlannedRequest): string {
  const pairs = Object.entries(request.query).map(([key, value]) => `${key}=${value}`);

  return pairs.length === 0 ? request.path : `${request.path}?${pairs.join("&")}`;
}

function resourcesText(resources: Resources): string {
  return `${resources.posts} posts, ${resources.users} users, ${resources.usageReads} usage reads = ${usd(costOf(resources))} USD`;
}

export function printPlan(config: Config, plan: readonly PlannedRequest[]): void {
  for (const [index, request] of plan.entries()) {
    const wait = request.settleFirst ? ` (waits ${BALANCE_SETTLE_MS / 1000} s first)` : "";

    process.stdout.write(
      `${config.input.probe} ${index + 1} ${request.label}${wait}\n  GET ${queryText(request)}\n  worst case: ${resourcesText(request.worst)}\n`,
    );
  }
  process.stdout.write(
    `${config.input.probe} worst case of the run: ${resourcesText(worstOf(plan))}; caps ${usd(config.caps.usdMicros)} USD and ${config.caps.posts} posts\n`,
  );
}

export function redacted(text: string, token: string): string {
  return [token, encodeURIComponent(token), JSON.stringify(token).slice(1, -1)]
    .reduce((kept, secret) => kept.replaceAll(secret, "[redacted]"), text)
    .replaceAll(/Bearer\s+[^\s"'\\]+/giu, "Bearer [redacted]");
}

export function printSent(probe: string, index: number, sent: Sent): void {
  const ids = sent.counted?.postIds ?? [];
  const problems = sent.counted?.problems ?? [];
  const counts = sent.counted?.counts;
  const parts = [
    `${probe} ${index + 1} ${sent.label}`,
    `status=${sent.status ?? "none"}`,
    counts === undefined
      ? "counts=none"
      : `posts=${counts.posts} includedPosts=${counts.includedPosts} users=${counts.users} media=${counts.media} errors=${counts.errors}`,
    sent.balanceMicros === null ? "" : `balance=${usd(sent.balanceMicros)} USD`,
    ids.length > 0 ? `ids=${ids.join(",")}` : "",
    problems.length > 0 ? `problems=${problems.join(",")}` : "",
  ];

  process.stdout.write(`${parts.filter((part) => part !== "").join(" ")}\n`);
}

export function summaryOf(config: Config, folder: string, state: RunState) {
  const billed = sumOf(state.sent.map((item) => item.billed));
  const balances = state.sent.flatMap((item) =>
    item.balanceMicros === null
      ? []
      : [{ label: item.label, totalBalanceUsd: usd(item.balanceMicros) }],
  );
  const first = state.sent[0]?.balanceMicros ?? null;
  const lastSent = state.sent.at(-1);
  const last = lastSent?.label === "balance-after" ? lastSent.balanceMicros : null;

  return {
    probe: config.input.probe,
    folder,
    ending: state.ending,
    caps: { usd: usd(config.caps.usdMicros), posts: config.caps.posts },
    pricesUsd: {
      post: usd(PRICE_MICROS.post),
      user: usd(PRICE_MICROS.user),
      usageReadAssumed: usd(PRICE_MICROS.usageRead),
    },
    requests: state.sent.map((item) => ({
      label: item.label,
      status: item.status,
      counts: item.counted?.counts ?? null,
    })),
    totals: totalOf(
      state.sent.flatMap((item) => (item.counted === null ? [] : [item.counted.counts])),
    ),
    countedSpend: {
      atTablePricesUsd: usd(costOf({ ...billed, usageReads: 0 })),
      withUsageReadsAssumedUsd: usd(costOf(billed)),
      posts: billed.posts,
    },
    measuredSpend: {
      balances,
      spentUsd: first === null || last === null ? null : usd(first - last),
    },
  };
}
