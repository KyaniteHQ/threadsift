import { z } from "zod";

import { queryRun, withTag } from "./check-measure.ts";
import type { Run } from "./check-run.ts";
import { type Findings, Inconclusive } from "./check-types.ts";
import { type Call, type Copy, callCopy, decodeAnswer } from "./copy-calls.ts";
import { endState, expectOk, paste } from "./copy-client.ts";
import { versionBindings } from "./copy-control.ts";
import { clearProvider } from "./d1.ts";
import { pause } from "./timeout.ts";
import {
  Count,
  MISSING_MODEL,
  MODEL,
  REFUSALS,
  boundTo,
  counted,
  describeTask,
  JobRow,
  TaskRow,
  digestJobsSql,
  DigestRow,
  digestRowSql,
  digestTaskSql,
  firstRow,
  lastTaskId,
  oneOf,
  taskSql,
  tasksAfterSql,
} from "./workers-ai-rows.ts";

const BOOK = "https://www.gutenberg.org/files/1342/1342-h/1342-h.htm";
const SHORT_ARTICLE = "https://en.wikipedia.org/wiki/Bread";
const SETTINGS = "/api/settings/ai";
const IDLE_DEADLINE_MS = 600_000;
const IDLE_POLL_MS = 5000;
const ITEM_DEADLINE_MS = 300_000;
const CLEAR_ALLOWANCE_MS = 60_000;

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

interface Scope {
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

function chooseModel(scope: Readonly<Scope>, model: string) {
  return owner(
    scope,
    { path: SETTINGS, method: "PUT", body: { provider: "workers-ai", model } },
    SettingsView,
  );
}

function verifyNow(scope: Readonly<Scope>) {
  return owner(scope, { path: `${SETTINGS}/verify`, method: "POST" }, Verify);
}

function describeVerify(
  verify: Readonly<{ kind: "done" } | { kind: "refused"; reason: string }>,
): string {
  return verify.kind === "done" ? "done" : `refused ${oneOf(REFUSALS, verify.reason)}`;
}

function describeEnd(status: string, outcome: string): string {
  return `ready ${String(status === "ready")}, digest outcome ${oneOf(["none", "failed"], outcome)}`;
}

function until(scope: Readonly<Scope>, ms: number): number {
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

function untilIdle(scope: Readonly<Scope>): Promise<void> {
  return drain(scope, until(scope, IDLE_DEADLINE_MS));
}

async function verifies(scope: Readonly<Scope>) {
  const { run, findings } = scope;
  const saved = await chooseModel(scope, MODEL);
  findings.check(
    "the copy saves Workers AI with a model and no key",
    saved.settings?.provider === "workers-ai" && saved.settings.model === MODEL,
    `provider ${oneOf(["workers-ai"], saved.settings?.provider ?? null)}, model ${String(saved.settings?.model === MODEL)}`,
  );

  const verify = await verifyNow(scope);
  findings.check(
    "Verify returns a Digest through the binding",
    verify.kind === "done",
    describeVerify(verify),
  );

  if (verify.kind !== "done") return;

  const task = await firstRow(run, taskSql(verify.taskId), TaskRow, scope.end);
  findings.check(
    "the Verify task row stores the binding, Provider and model",
    boundTo(task, MODEL) && task?.state === "done",
    describeTask(task),
  );
}

async function digests(scope: Readonly<Scope>) {
  const { run, copy, findings } = scope;
  await run.pace.settle();
  await untilIdle(scope);
  const pasted = await paste(copy, withTag(BOOK, `${run.tag}-workers-ai-book`), scope.end);
  findings.item(pasted.id);
  const end = await endState(copy, pasted.id, until(scope, ITEM_DEADLINE_MS));
  findings.check(
    "the long Article ends ready with a Digest",
    pasted.created &&
      end.status === "ready" &&
      end.digestOutcome === "none" &&
      end.digestTitle !== null &&
      end.digestTopic !== null,
    `${describeEnd(end.status, end.digestOutcome)}, title ${String(end.digestTitle !== null)}, topic ${String(end.digestTopic !== null)}`,
  );

  const task = await firstRow(run, digestTaskSql(pasted.id), TaskRow, scope.end);
  findings.check(
    "the Digest task row stores the binding, Provider and model",
    boundTo(task, MODEL) && task?.state === "done",
    describeTask(task),
  );

  const stored = await firstRow(run, digestRowSql(pasted.id), DigestRow, scope.end);
  findings.check(
    "the Digest row stores the Provider and model",
    stored?.provider === "workers-ai" && stored.model === MODEL,
    `provider ${oneOf(["workers-ai"], stored?.provider ?? null)}, model ${String(stored?.model === MODEL)}`,
  );
}

async function refuses(scope: Readonly<Scope>) {
  const { run, copy, findings } = scope;
  await run.pace.settle();
  await untilIdle(scope);
  const baseline = await lastTaskId(run, scope.end);
  await chooseModel(scope, MISSING_MODEL);
  const verify = await verifyNow(scope);
  findings.check(
    "Verify for a model that does not exist is refused as model-not-found",
    verify.kind === "refused" && verify.reason === "model-not-found",
    describeVerify(verify),
  );

  const pasted = await paste(
    copy,
    withTag(SHORT_ARTICLE, `${run.tag}-workers-ai-missing`),
    scope.end,
  );

  findings.item(pasted.id);
  const end = await endState(copy, pasted.id, until(scope, ITEM_DEADLINE_MS));
  findings.check(
    "the Item ends ready with a failed Digest that Try again can retry",
    end.status === "ready" && end.digestOutcome === "failed" && end.retry === "digest",
    `${describeEnd(end.status, end.digestOutcome)}, retry ${oneOf(["digest", "fetch"], end.retry ?? null)}`,
  );

  await untilIdle(scope);
  const jobs = await queryRun(run, digestJobsSql(pasted.id), JobRow, scope.end);
  const tasks = await queryRun(run, tasksAfterSql(baseline), TaskRow, scope.end);

  findings.check(
    "the Digest job closed once with no retry",
    jobs.length === 1 && jobs[0]?.state === "done" && jobs[0].attempts === 0,
    `${String(counted(jobs))} jobs, state ${oneOf(["done"], jobs[0]?.state ?? null)}, attempts ${String(jobs[0]?.attempts === 0)}`,
  );

  findings.check(
    "only Verify and the one Digest attempt ran, both bound to the missing model and refused as model-not-found",
    tasks.length === 2 &&
      tasks.every(
        (task) =>
          boundTo(task, MISSING_MODEL) &&
          task.state === "failed" &&
          task.refusal === "model-not-found" &&
          task.attempts === 1,
      ),
    `${String(counted(tasks))} new tasks; first: ${describeTask(tasks[0])}; second: ${describeTask(tasks[1])}`,
  );
}

async function admit(scope: Readonly<Scope>) {
  const { run, findings } = scope;
  await run.pace.settle();
  const view = await owner(scope, { path: SETTINGS }, SettingsView);

  if (!(view.providers ?? []).includes("workers-ai")) {
    throw new Inconclusive("the copy does not offer Workers AI");
  }

  const bindings = await versionBindings(run.stage, run.stage.target.name, run.version, scope.end);

  if (!bindings.some((binding) => binding.name === "AI" && binding.type === "ai")) {
    throw new Inconclusive("the deployed version has no AI binding");
  }

  findings.check("the deployed version carries the AI binding", true, "AI binding true");
}

async function failureOf(work: () => Promise<void>): Promise<Error | null> {
  try {
    await work();

    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error("unexpected failure");
  }
}

async function phases(scope: Readonly<Scope>) {
  await verifies(scope);
  await digests(scope);
  await refuses(scope);
}

export async function workersAiCheck(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<void> {
  const scope = { run, copy, findings, end: run.deadline - CLEAR_ALLOWANCE_MS };
  await admit(scope);

  const worked = await failureOf(() => phases(scope));
  const drained = await failureOf(() => untilIdle(scope));

  const cleared = await failureOf(() =>
    clearProvider(run.stage, run.database, Date.now() + CLEAR_ALLOWANCE_MS),
  );

  findings.check(
    "the copy's Provider is cleared after the scenario",
    cleared === null,
    cleared === null ? "cleared" : "not cleared",
  );

  const failure = worked ?? drained;

  if (failure !== null) throw failure;
}
