import { setTimeout as sleep } from "node:timers/promises";

import type { z } from "zod";

import {
  ItemDetailResponseSchema,
  ItemResponseSchema,
  SavedItemResponseSchema,
} from "../src/core/contract/item-route-wire.ts";
import type { Item } from "../src/core/contract/item-wire.ts";
import { XApiSettingsViewSchema, type XApiSpend } from "../src/core/contract/x-api-contract.ts";
import { type AutoReason, XSettingsViewSchema } from "../src/core/contract/x-settings-contract.ts";
import { parsedJson } from "../src/core/kernel/parsed-json.ts";
import { type App, type AppCall, startedApp } from "./x-api-probe-app.ts";
import { type Counts, NO_COUNTS, PRICE_MICROS, costOf } from "./x-api-probe-cost.ts";
import { APP_READ, type PlannedRequest, appLimitsOf, recordNameOf } from "./x-api-probe-plan.ts";
import { type Sent, printSent } from "./x-api-probe-report.ts";
import { type Run, writeRecord } from "./x-api-probe-step.ts";

const SETTLE_MS = 300_000;
const POLL_MS = 2000;

type AppRead = {
  readonly published: boolean;
  readonly why: string;
  readonly counts: Counts | null;
  readonly micros: number | null;
  readonly record: AppRecord | null;
  readonly log: readonly string[];
};

type AppRecord = {
  readonly autoBecause: AutoReason;
  readonly limits: Readonly<ReturnType<typeof appLimitsOf>>;
  readonly item: ItemDetail | null;
  readonly today: XApiSpend | null;
};

type ItemDetail = z.infer<typeof ItemDetailResponseSchema>["item"];

class Unread extends Error {}

function bodyOf<Body>(schema: z.ZodType<Body>, call: Readonly<AppCall>, what: string): Body {
  const parsed = parsedJson(schema, call.text);

  if (parsed === null) throw new Unread(`${what} answered ${String(call.status)}`);
  return parsed;
}

async function settledItem(app: Readonly<App>, id: number): Promise<Item> {
  const deadline = Date.now() + SETTLE_MS;

  while (Date.now() < deadline) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- The Item is polled every 2 s until its fetch settles.
    const read = await app.call("GET", `/api/items/${String(id)}/status`);
    const { item } = bodyOf(ItemResponseSchema, read, "the Item status");

    if (item.status !== "processing" || item.wait !== null) return item;
    // oxlint-disable-next-line eslint/no-await-in-loop -- The Item is polled every 2 s until its fetch settles.
    await sleep(POLL_MS);
  }
  throw new Unread(`the Item did not settle within ${SETTLE_MS / 1000} s`);
}

async function pastedRead(app: Readonly<App>, probe: "S4" | "S5", link: string): Promise<AppRead> {
  const limits = appLimitsOf(probe);
  const limited = await app.call("PUT", "/api/settings/x-api/limits", limits);

  bodyOf(XApiSettingsViewSchema, limited, "the limits save");
  const x = bodyOf(XSettingsViewSchema, await app.call("GET", "/api/settings/x"), "the X settings");

  if (x.auto.reader !== "x-api")
    return {
      published: false,
      why: `auto uses ${x.auto.reader ?? "no reader"}, so the link was not pasted`,
      counts: null,
      micros: null,
      record: { autoBecause: x.auto.because, limits, item: null, today: null },
      log: [],
    };
  const pasted = bodyOf(
    SavedItemResponseSchema,
    await app.call("POST", "/api/items", { url: link }),
    "the Paste",
  );
  const item = await settledItem(app, pasted.item.id);
  const detail = bodyOf(
    ItemDetailResponseSchema,
    await app.call("GET", `/api/items/${String(pasted.item.id)}`),
    "the Item detail",
  );
  const { today } = bodyOf(
    XApiSettingsViewSchema,
    await app.call("GET", "/api/settings/x-api"),
    "the X API settings",
  );

  return {
    published: item.fetch === "ok",
    why: `fetch=${item.fetch ?? "none"} xNote=${item.xNote ?? "none"} wait=${item.wait?.reason ?? "none"}`,
    counts: { ...NO_COUNTS, posts: today.posts, users: today.users },
    micros: today.micros,
    record: { autoBecause: x.auto.because, limits, item: detail.item, today },
    log: [],
  };
}

const UNSENT_ORIGIN = "http://127.0.0.1:9";

const DRY_TOKEN = "dry-run-token-that-x-never-sees";

type AppProbe = "S4" | "S5";

async function appReadWith(
  probe: AppProbe,
  { token, link, origin }: Readonly<{ token: string; link: string; origin: string | null }>,
): Promise<AppRead> {
  const app = await startedApp(
    APP_READ[probe].target,
    origin === null ? {} : { THREADSIFT_X_API_ORIGIN: origin },
  );

  try {
    const saved = await app.call("PUT", "/api/settings/x-api", { token });

    bodyOf(XApiSettingsViewSchema, saved, "the token save");
    const read = await pastedRead(app, probe, link);

    return {
      ...read,
      log: app.logLines().filter((line) => line.includes("x-api")),
    };
  } finally {
    await app.stop();
  }
}

function appProbeOf(run: Readonly<Run>): AppProbe {
  const { probe } = run.config.input;

  if (probe !== "S4" && probe !== "S5") throw new Unread(`${probe} has no app read`);
  return probe;
}

function appReadOf(run: Readonly<Run>, request: Readonly<PlannedRequest>): Promise<AppRead> {
  return appReadWith(appProbeOf(run), { token: run.token, link: request.path, origin: null });
}

export async function dryAppRun(probe: AppProbe, link: string): Promise<string> {
  const read = await appReadWith(probe, { token: DRY_TOKEN, link, origin: UNSENT_ORIGIN });

  return `${probe}: dry app run against ${UNSENT_ORIGIN}, which never connects: published=${String(read.published)} ${read.why}; the Instance is stopped and its folder removed`;
}

function countsOfApp(read: Readonly<AppRead>): Counts | null {
  if (read.counts === null || read.micros === null) return null;
  const usageReads = (read.micros - costOf(read.counts)) / PRICE_MICROS.usageRead;

  return Number.isInteger(usageReads) && usageReads >= 0 ? { ...read.counts, usageReads } : null;
}

async function readOrWhy(run: Readonly<Run>, request: Readonly<PlannedRequest>): Promise<AppRead> {
  try {
    return await appReadOf(run, request);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return {
      published: false,
      why: error.message,
      counts: null,
      micros: null,
      record: null,
      log: [],
    };
  }
}

function readingOfApp(read: Readonly<AppRead>, counted: Readonly<Counts> | null): Sent["reading"] {
  if (counted !== null) return { kind: "counted", counts: counted, postIds: [], problems: [] };

  return read.counts === null ? null : { kind: "uncountable" };
}

export async function appStep(
  run: Readonly<Run>,
  index: number,
  request: Readonly<PlannedRequest>,
): Promise<Sent> {
  const read = await readOrWhy(run, request);
  const counted = countsOfApp(read);
  const sent: Sent = {
    request,
    outcome: { kind: "app", published: read.published, why: read.why },
    reading: readingOfApp(read, counted),
    charged: counted ?? request.worst,
    balanceMicros: null,
  };
  const record = {
    request: { paste: request.path },
    sentAt: new Date().toISOString(),
    answer: {
      published: read.published,
      why: read.why,
      micros: read.micros,
      read: read.record,
      log: read.log,
    },
    counts: read.counts,
  };

  await writeRecord(run, recordNameOf(index, request), JSON.stringify(record, null, 2));
  printSent(run.config.input.probe, index, sent);
  return sent;
}
