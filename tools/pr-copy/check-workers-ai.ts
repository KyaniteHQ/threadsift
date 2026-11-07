import { z } from "zod";

import { queryRun, withTag } from "./check-measure.ts";
import type { Run } from "./check-run.ts";
import { type Findings, Inconclusive } from "./check-types.ts";
import { type Call, type Copy, callCopy } from "./copy-calls.ts";
import { endState, expectOk, paste } from "./copy-client.ts";
import { versionBindings } from "./copy-control.ts";
import { pause } from "./timeout.ts";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MISSING_MODEL = "@cf/threadsift/nonexistent-proof-model";
const BOOK = "https://www.gutenberg.org/files/1342/1342-h/1342-h.htm";
const SHORT_ARTICLE = "https://en.wikipedia.org/wiki/Bread";
const SETTINGS = "/api/settings/ai";
const IDLE_DEADLINE_MS = 600_000;
const IDLE_POLL_MS = 5000;

const SettingsView = z.looseObject({
  providers: z.array(z.string()),
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

const TaskRow = z.object({
  executor: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  state: z.string(),
  refusal: z.string().nullable(),
});

const Count = z.object({ n: z.number().int() });

const JobRow = z.object({ state: z.string() });

async function owner<Body>(
  copy: Readonly<Copy>,
  call: Readonly<Call>,
  schema: z.ZodType<Body>,
): Promise<Body> {
  const response = await callCopy(copy, { ...call, cookie: copy.cookie });
  await expectOk(response, call.path);

  return schema.parse(await response.json());
}

function chooseModel(copy: Readonly<Copy>, model: string) {
  return owner(
    copy,
    { path: SETTINGS, method: "PUT", body: { provider: "workers-ai", model } },
    SettingsView,
  );
}

async function untilIdle(run: Readonly<Run>, deadline = Date.now() + IDLE_DEADLINE_MS) {
  const [open] = await queryRun(run, "SELECT count(*) AS n FROM jobs WHERE state <> 'done'", Count);

  if (open?.n === 0) return;

  if (Date.now() >= deadline) {
    throw new Inconclusive("the copy still had unfinished jobs at the deadline");
  }

  await pause(IDLE_POLL_MS, deadline);
  await untilIdle(run, deadline);
}

const TASKS = "SELECT executor, provider, model, state, refusal FROM ai_tasks";

async function verifies(run: Readonly<Run>, copy: Readonly<Copy>, findings: Readonly<Findings>) {
  const saved = await chooseModel(copy, MODEL);
  findings.check(
    "the copy saves Workers AI with a model and no key",
    saved.settings?.provider === "workers-ai" && saved.settings.model === MODEL,
    JSON.stringify(saved.settings),
  );

  const verify = await owner(copy, { path: `${SETTINGS}/verify`, method: "POST" }, Verify);
  findings.check(
    "Verify returns a Digest through the binding",
    verify.kind === "done",
    verify.kind === "done" ? verify.digest.title : verify.reason,
  );

  if (verify.kind !== "done") return;

  const [task] = await queryRun(run, `${TASKS} WHERE id = ${String(verify.taskId)}`, TaskRow);
  findings.check(
    "the Verify task row stores the binding, Provider and model",
    task?.executor === "binding" &&
      task.provider === "workers-ai" &&
      task.model === MODEL &&
      task.state === "done",
    JSON.stringify(task),
  );
}

async function digests(run: Readonly<Run>, copy: Readonly<Copy>, findings: Readonly<Findings>) {
  await untilIdle(run);
  const pasted = await paste(copy, withTag(BOOK, `${run.tag}-workers-ai-book`));
  findings.item(pasted.id);
  const end = await endState(copy, pasted.id);
  findings.check(
    "the long Article ends ready with a Digest",
    pasted.created &&
      end.status === "ready" &&
      end.digestOutcome === "none" &&
      end.digestTitle !== null &&
      end.digestTopic !== null,
    `${end.status} ${end.digestOutcome} ${end.digestTitle ?? "no title"}`,
  );

  const [stored] = await queryRun(
    run,
    `SELECT t.executor, d.provider, d.model, t.state, t.refusal FROM digests d JOIN ai_tasks t ON t.id = d.task_id WHERE d.item_id = ${String(pasted.id)}`,
    TaskRow,
  );

  findings.check(
    "the Item's task row stores the binding, Provider and model",
    stored?.executor === "binding" &&
      stored.provider === "workers-ai" &&
      stored.model === MODEL &&
      stored.state === "done",
    JSON.stringify(stored),
  );
}

async function refuses(run: Readonly<Run>, copy: Readonly<Copy>, findings: Readonly<Findings>) {
  await chooseModel(copy, MISSING_MODEL);
  const verify = await owner(copy, { path: `${SETTINGS}/verify`, method: "POST" }, Verify);
  findings.check(
    "Verify for a model that does not exist is refused as model-not-found",
    verify.kind === "refused" && verify.reason === "model-not-found",
    JSON.stringify(verify),
  );

  const pasted = await paste(copy, withTag(SHORT_ARTICLE, `${run.tag}-workers-ai-missing`));
  findings.item(pasted.id);
  const end = await endState(copy, pasted.id);
  findings.check(
    "the Item ends ready with a failed Digest that Try again can retry",
    end.status === "ready" && end.digestOutcome === "failed" && end.retry === "digest",
    `${end.status} ${end.digestOutcome}`,
  );

  const jobs = await queryRun(
    run,
    `SELECT state FROM jobs WHERE item_id = ${String(pasted.id)} AND kind = 'digest'`,
    JobRow,
  );

  findings.check(
    "the Digest job closed once with no retry",
    jobs.length === 1 && jobs[0]?.state === "done",
    JSON.stringify(jobs),
  );

  const tasks = await queryRun(
    run,
    `${TASKS} WHERE model = '${MISSING_MODEL}' ORDER BY id`,
    TaskRow,
  );

  findings.check(
    "only Verify and the one Digest attempt ran, both refused as model-not-found",
    tasks.length === 2 &&
      tasks.every((task) => task.state === "failed" && task.refusal === "model-not-found"),
    JSON.stringify(tasks),
  );
}

export async function workersAiCheck(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<void> {
  const view = await owner(copy, { path: SETTINGS }, SettingsView);

  if (!view.providers.includes("workers-ai")) {
    throw new Inconclusive("the copy does not offer Workers AI");
  }

  const bindings = await versionBindings(run.stage, run.stage.target.name, run.version);
  findings.check(
    "the deployed version carries the AI binding",
    bindings.some((binding) => binding.name === "AI" && binding.type === "ai"),
    bindings.map((binding) => `${binding.name}:${binding.type}`).join(","),
  );

  try {
    await verifies(run, copy, findings);
    await digests(run, copy, findings);
    await refuses(run, copy, findings);
  } finally {
    await untilIdle(run);
    await queryRun(run, "DELETE FROM settings", z.object({}));
  }
}
