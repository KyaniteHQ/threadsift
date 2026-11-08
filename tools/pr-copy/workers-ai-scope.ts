import { z } from "zod";

import { queryRun } from "./check-measure.ts";
import type { Run } from "./check-run.ts";
import { type Findings, Inconclusive } from "./check-types.ts";
import { type Call, type Copy, callCopy, decodeAnswer } from "./copy-calls.ts";
import { expectOk } from "./copy-client.ts";
import { pause } from "./timeout.ts";
import { Count, REFUSALS, oneOf } from "./workers-ai-rows.ts";

const SETTINGS = "/api/settings/ai";
const IDLE_DEADLINE_MS = 600_000;
const IDLE_POLL_MS = 5000;
export const ITEM_DEADLINE_MS = 300_000;

const SettingsView = z.looseObject({
  providers: z.array(z.string()).optional(),
  settings: z.looseObject({ provider: z.string(), model: z.string() }).nullable(),
});

const Verify = z.discriminatedUnion("kind", [
  z.looseObject({
    kind: z.literal("done"),
    taskId: z.number().int(),
    digest: z.looseObject({ title: z.string().min(1) }),
  }),
  z.looseObject({ kind: z.literal("refused"), reason: z.string(), status: z.number().nullable() }),
]);

export interface Scope {
  readonly run: Readonly<Run>;
  readonly copy: Readonly<Copy>;
  readonly findings: Readonly<Findings>;
  readonly end: number;
}

async function owner<Body>(
  scope: Readonly<Scope>,
  call: Readonly<Call>,
  schema: z.ZodType<Body>,
): Promise<Body> {
  const response = await callCopy(scope.copy, {
    ...call,
    cookie: scope.copy.cookie,
    deadline: scope.end,
  });

  await expectOk(response, call.path);

  return decodeAnswer(response, call.path, schema);
}

export function currentSettings(scope: Readonly<Scope>) {
  return owner(scope, { path: SETTINGS }, SettingsView);
}

export function chooseModel(scope: Readonly<Scope>, model: string) {
  return owner(
    scope,
    { path: SETTINGS, method: "PUT", body: { provider: "workers-ai", model } },
    SettingsView,
  );
}

export function verifyNow(scope: Readonly<Scope>) {
  return owner(scope, { path: `${SETTINGS}/verify`, method: "POST" }, Verify);
}

export function describeVerify(
  verify: Readonly<{ kind: "done" } | { kind: "refused"; reason: string }>,
): string {
  return verify.kind === "done" ? "done" : `refused ${oneOf(REFUSALS, verify.reason)}`;
}

export function describeEnd(status: string, outcome: string): string {
  return `ready ${String(status === "ready")}, digest outcome ${oneOf(["none", "failed"], outcome)}`;
}

export function until(scope: Readonly<Scope>, ms: number): number {
  return Math.min(Date.now() + ms, scope.end);
}

async function drain(scope: Readonly<Scope>, deadline: number): Promise<void> {
  if (Date.now() >= deadline) {
    throw new Inconclusive("the copy still had unfinished jobs at the deadline");
  }

  const [open] = await queryRun(
    scope.run,
    "SELECT count(*) AS n FROM jobs WHERE state <> 'done'",
    Count,
    deadline,
  );

  if (open?.n === 0) return;

  await pause(IDLE_POLL_MS, deadline);
  await drain(scope, deadline);
}

export function untilIdle(scope: Readonly<Scope>): Promise<void> {
  return drain(scope, until(scope, IDLE_DEADLINE_MS));
}
