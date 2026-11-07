import { readFileSync } from "node:fs";

import { z } from "zod";

import { type CopyRecord, CopyRecordSchema, type DeployedCopy } from "./copy.ts";
import { requiredEnv } from "./env.ts";
import { github } from "./github-request.ts";

export const ENVIRONMENT = "pr-copy";
const LIVE_ENVIRONMENT = "live-copy";
const LIVE_TASK = "deploy:live";
const PER_PAGE = 100;

export const Sha = z.string().regex(/^[0-9a-f]{40}$/u);
export const PrNumber = z.number().int().positive();

export const CoercedPrNumber = z.coerce.number().pipe(PrNumber);

const PullSchema = z.object({
  state: z.enum(["open", "closed"]),
  draft: z.boolean(),
  base: z.object({ ref: z.string() }),
  head: z.object({ sha: Sha, repo: z.object({ full_name: z.string() }).nullable() }),
});

type Pull = z.infer<typeof PullSchema>;

const DeploymentSchema = z.object({
  id: z.number().int(),
  sha: Sha,
  created_at: z.iso.datetime(),
  payload: z.unknown(),
});

type Deployment = Readonly<z.infer<typeof DeploymentSchema>>;

export function byNewest(a: Deployment, b: Deployment): number {
  return Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id;
}

const WorkflowRunEventSchema = z.object({
  workflow_run: z.object({
    id: z.number().int(),
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

export function task(pr: number): string {
  return `deploy:pr-${String(pr)}`;
}

export interface DeployedHead extends PullHead {
  readonly gateRun: number;
}

export function deployedHead(): DeployedHead {
  const { workflow_run: run } = event(WorkflowRunEventSchema);
  const [pull] = run.pull_requests;

  if (pull === undefined) {
    throw new Error("The gate run names no pull request");
  }

  return { pr: pull.number, headSha: run.head_sha, gateRun: run.id };
}

export function closedPullRequest(): number {
  return event(ClosedEventSchema).pull_request.number;
}

export function pullRequest(pr: number): Promise<Pull> {
  return github(`pulls/${String(pr)}`, PullSchema);
}

export function isClosed(pull: Readonly<Pull>): boolean {
  return pull.state === "closed";
}

export function reopenedReason(pr: number, pull: Readonly<Pull>): string | null {
  return isClosed(pull) ? null : `pull request ${String(pr)} is open again`;
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

export async function deployments(
  environment: string,
  deploymentTask: string,
  page = 1,
  firstPageOnly = false,
): Promise<Deployment[]> {
  const query = `environment=${environment}&task=${encodeURIComponent(deploymentTask)}&per_page=${String(PER_PAGE)}&page=${String(page)}`;
  const rows = await github(`deployments?${query}`, z.array(DeploymentSchema));

  return firstPageOnly || rows.length < PER_PAGE
    ? rows
    : [...rows, ...(await deployments(environment, deploymentTask, page + 1))];
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
  const newestFirst = (await deployments(ENVIRONMENT, task(pr))).toSorted(byNewest);

  return recordIn(newestFirst);
}

export async function postDeployment(
  head: Readonly<DeployedHead>,
  copy: Readonly<DeployedCopy> | null,
): Promise<void> {
  const deployment = await createDeployment({
    ref: head.headSha,
    task: task(head.pr),
    environment: ENVIRONMENT,
    transient: true,
    payload: copy === null ? null : { ...copy.record, gateRun: head.gateRun },
    description: `Copy of pull request ${String(head.pr)}`,
  });

  await finishDeployment(deployment.id, copy?.url ?? null);
}

function createDeployment(
  options: Readonly<{
    ref: string;
    task: string;
    environment: string;
    transient: boolean;
    payload: Readonly<CopyRecord & { gateRun?: number }> | null;
    description: string;
  }>,
) {
  return github(
    "deployments",
    z.object({ id: z.number().int() }),
    JSON.stringify({
      ref: options.ref,
      task: options.task,
      environment: options.environment,
      auto_merge: false,
      required_contexts: [],
      transient_environment: options.transient,
      production_environment: false,
      payload: options.payload ?? {},
      description: options.description,
    }),
  );
}

export async function markInactive(pr: number): Promise<void> {
  const all = await deployments(ENVIRONMENT, task(pr));

  await Promise.all(all.map(({ id }) => postStatus(id, { state: "inactive" })));
}

export function liveHead(): string {
  const { workflow_run: run } = event(
    WorkflowRunEventSchema.extend({
      workflow_run: WorkflowRunEventSchema.shape.workflow_run.omit({ pull_requests: true }).extend({
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
  const current = await github("git/ref/heads/main", z.object({ object: z.object({ sha: Sha }) }));

  if (current.object.sha !== sha)
    throw new Error(`Live gate ${sha} is no longer main's head; no changes`);
}

export async function lastLiveRecord(): Promise<CopyRecord | null> {
  const [latest] = (await deployments(LIVE_ENVIRONMENT, LIVE_TASK, 1, true)).toSorted(byNewest);

  return latest === undefined ? null : CopyRecordSchema.parse(latest.payload);
}

export async function recordLive(sha: string, record: CopyRecord): Promise<number> {
  const deployment = await createDeployment({
    ref: sha,
    task: LIVE_TASK,
    environment: LIVE_ENVIRONMENT,
    transient: false,
    payload: record,
    description: "Live copy",
  });

  await postStatus(deployment.id, { state: "in_progress" });

  return deployment.id;
}

export async function finishDeployment(id: number, url: string | null): Promise<void> {
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
