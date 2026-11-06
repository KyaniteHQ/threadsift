import { readFileSync } from "node:fs";

import { z } from "zod";

import { type CopyRecord, CopyRecordSchema, type DeployedCopy } from "./copy.ts";
import { requiredEnv } from "./env.ts";
import { callTimeout } from "./timeout.ts";

const ENVIRONMENT = "pr-copy";
const PER_PAGE = 100;

const Sha = z.string().regex(/^[0-9a-f]{40}$/u);
const PrNumber = z.number().int().positive();

const PullSchema = z.object({
  state: z.enum(["open", "closed"]),
  base: z.object({ ref: z.string() }),
  head: z.object({ sha: Sha, repo: z.object({ full_name: z.string() }).nullable() }),
});

type Pull = z.infer<typeof PullSchema>;

const DeploymentSchema = z.object({
  id: z.number().int(),
  created_at: z.iso.datetime(),
  payload: z.unknown(),
});

type Deployment = Readonly<z.infer<typeof DeploymentSchema>>;

const WorkflowRunEventSchema = z.object({
  workflow_run: z.object({
    head_sha: Sha,
    pull_requests: z.array(z.object({ number: PrNumber })),
  }),
});

const ClosedEventSchema = z.object({
  action: z.literal("closed"),
  pull_request: z.object({ number: PrNumber }),
});

export interface PullHead {
  readonly pr: number;
  readonly headSha: string;
}

function repository(): string {
  return requiredEnv("GITHUB_REPOSITORY");
}

function event<Body>(schema: z.ZodType<Body>): Body {
  return schema.parse(JSON.parse(readFileSync(requiredEnv("GITHUB_EVENT_PATH"), "utf8")));
}

async function github<Body>(path: string, schema: z.ZodType<Body>, body?: string): Promise<Body> {
  const method = body === undefined ? "GET" : "POST";

  const response = await fetch(`${requiredEnv("GITHUB_API_URL")}/repos/${repository()}/${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${requiredEnv("GITHUB_TOKEN")}`,
      "x-github-api-version": "2022-11-28",
    },
    body: body ?? null,
    signal: callTimeout(),
  });

  if (!response.ok) {
    throw new Error(`GitHub ${method} ${path} answered ${String(response.status)}`);
  }

  return schema.parse(response.status === 204 ? null : await response.json());
}

function logUrl(): string {
  return `${requiredEnv("GITHUB_SERVER_URL")}/${repository()}/actions/runs/${requiredEnv("GITHUB_RUN_ID")}`;
}

async function postStatus(
  id: number,
  status: Readonly<{ state: string; environment_url?: string }>,
): Promise<void> {
  const body = JSON.stringify({ ...status, log_url: logUrl(), auto_inactive: false });

  await github(`deployments/${String(id)}/statuses`, z.object({ id: z.number().int() }), body);
}

function task(pr: number): string {
  return `deploy:pr-${String(pr)}`;
}

export function deployedHead(): PullHead {
  const { workflow_run: run } = event(WorkflowRunEventSchema);
  const [pull] = run.pull_requests;

  if (pull === undefined) {
    throw new Error("The gate run names no pull request");
  }

  return { pr: pull.number, headSha: run.head_sha };
}

export function closedPullRequest(): number {
  if (process.env["GITHUB_EVENT_NAME"] === "workflow_dispatch")
    return event(z.object({ inputs: z.object({ pr: z.coerce.number().int().positive() }) })).inputs
      .pr;

  return event(ClosedEventSchema).pull_request.number;
}

export function pullRequest(pr: number): Promise<Pull> {
  return github(`pulls/${String(pr)}`, PullSchema);
}

export function reopenedReason(pr: number, pull: Readonly<Pull>): string | null {
  return pull.state === "closed" ? null : `pull request ${String(pr)} is open again`;
}

export function staleReason(head: Readonly<PullHead>, pull: Readonly<Pull>): string | null {
  const name = `pull request ${String(head.pr)}`;

  if (pull.state !== "open") {
    return `${name} is closed`;
  }

  if (pull.base.ref !== "main") {
    return `${name} targets ${pull.base.ref}, not main`;
  }

  if (pull.head.sha !== head.headSha || pull.head.repo?.full_name !== repository()) {
    return `${name} is at ${pull.head.sha} now`;
  }

  return null;
}

async function deployments(pr: number, page = 1): Promise<Deployment[]> {
  const query = `environment=${ENVIRONMENT}&task=${encodeURIComponent(task(pr))}&per_page=${String(PER_PAGE)}&page=${String(page)}`;
  const rows = await github(`deployments?${query}`, z.array(DeploymentSchema));

  return rows.length < PER_PAGE ? rows : [...rows, ...(await deployments(pr, page + 1))];
}

async function latestState(id: number): Promise<string | undefined> {
  const statuses = await github(
    `deployments/${String(id)}/statuses?per_page=1`,
    z.array(z.object({ state: z.string() })),
  );

  return statuses[0]?.state;
}

async function recordIn(newestFirst: readonly Deployment[]): Promise<CopyRecord | null> {
  const [newest, ...older] = newestFirst;

  if (newest === undefined) {
    return null;
  }

  const record = CopyRecordSchema.safeParse(newest.payload);

  if (!record.success) {
    return recordIn(older);
  }

  const state = await latestState(newest.id);

  if (state === "success") {
    return record.data;
  }

  return state === "inactive" ? null : recordIn(older);
}

export async function lastRecord(pr: number): Promise<CopyRecord | null> {
  const newestFirst = (await deployments(pr)).toSorted(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );

  return recordIn(newestFirst);
}

export async function postDeployment(
  head: Readonly<PullHead>,
  copy: Readonly<DeployedCopy> | null,
): Promise<void> {
  const deployment = await github(
    "deployments",
    z.object({ id: z.number().int() }),
    JSON.stringify({
      ref: head.headSha,
      task: task(head.pr),
      environment: ENVIRONMENT,
      auto_merge: false,
      required_contexts: [],
      transient_environment: true,
      production_environment: false,
      payload: copy?.record ?? {},
      description: `Copy of pull request ${String(head.pr)}`,
    }),
  );

  await postStatus(
    deployment.id,
    copy === null ? { state: "failure" } : { state: "success", environment_url: copy.url },
  );
}

export async function markInactive(pr: number): Promise<void> {
  const all = await deployments(pr);

  await Promise.all(all.map(({ id }) => postStatus(id, { state: "inactive" })));
}

export async function mainHead(): Promise<string> {
  return (await github("git/ref/heads/main", z.object({ object: z.object({ sha: Sha }) }))).object
    .sha;
}

export function liveHead(): string {
  const { workflow_run: run } = event(
    z.object({
      workflow_run: z.object({
        head_sha: Sha,
        head_branch: z.literal("main"),
        event: z.literal("push"),
        conclusion: z.literal("success"),
        repository: z.object({ full_name: z.string() }),
        head_repository: z.object({ full_name: z.string() }),
      }),
    }),
  );

  if (run.repository.full_name !== repository() || run.head_repository.full_name !== repository())
    throw new Error("Live gate belongs to another repository");

  return run.head_sha;
}

export async function requireMainHead(sha: string): Promise<void> {
  if ((await mainHead()) !== sha)
    throw new Error(`Live gate ${sha} is no longer main's head; no changes`);
}

export async function lastLiveRecord(): Promise<CopyRecord | null> {
  const rows = await github(
    "deployments?environment=live-copy&task=deploy:live&per_page=1",
    z.array(DeploymentSchema),
  );

  const [latest] = rows;

  return latest === undefined ? null : CopyRecordSchema.parse(latest.payload);
}

export async function recordLive(sha: string, record: CopyRecord): Promise<number> {
  const deployment = await github(
    "deployments",
    z.object({ id: z.number().int() }),
    JSON.stringify({
      ref: sha,
      task: "deploy:live",
      environment: "live-copy",
      auto_merge: false,
      required_contexts: [],
      transient_environment: false,
      production_environment: false,
      payload: record,
    }),
  );

  await postStatus(deployment.id, { state: "in_progress" });

  return deployment.id;
}

export async function finishLive(id: number, url: string | null): Promise<void> {
  await postStatus(
    id,
    url === null ? { state: "failure" } : { state: "success", environment_url: url },
  );
}

export async function dispatchDelete(pr: number): Promise<void> {
  await github(
    "actions/workflows/pr-copy.yml/dispatches",
    z.null(),
    JSON.stringify({ ref: "main", inputs: { pr: String(pr) } }),
  );
}
