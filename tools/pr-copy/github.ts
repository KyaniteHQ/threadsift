import { readFileSync } from "node:fs";

import { z } from "zod";

import { type CopyRecord, CopyRecordSchema, type DeployedCopy } from "./copy.ts";
import { requiredEnv } from "./env.ts";

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

const DeploymentSchema = z.object({ id: z.number().int(), payload: z.unknown() });

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
  });

  if (!response.ok) {
    throw new Error(`GitHub ${method} ${path} answered ${String(response.status)}`);
  }

  return schema.parse(await response.json());
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

function deploymentsPage(pr: number, page: number): Promise<Deployment[]> {
  const query = `environment=${ENVIRONMENT}&task=${encodeURIComponent(task(pr))}&per_page=${String(PER_PAGE)}&page=${String(page)}`;

  return github(`deployments?${query}`, z.array(DeploymentSchema));
}

async function latestState(id: number): Promise<string | undefined> {
  const statuses = await github(
    `deployments/${String(id)}/statuses?per_page=1`,
    z.array(z.object({ state: z.string() })),
  );

  return statuses[0]?.state;
}

async function recordIn(
  deployments: readonly Deployment[],
): Promise<CopyRecord | null | undefined> {
  const [newest, ...older] = deployments;

  if (newest === undefined) {
    return undefined;
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

export async function lastRecord(pr: number, page = 1): Promise<CopyRecord | null> {
  const deployments = await deploymentsPage(pr, page);
  const record = await recordIn(deployments);

  if (record !== undefined) {
    return record;
  }

  return deployments.length < PER_PAGE ? null : lastRecord(pr, page + 1);
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

export async function markInactive(pr: number, page = 1): Promise<void> {
  const deployments = await deploymentsPage(pr, page);

  await Promise.all(deployments.map(({ id }) => postStatus(id, { state: "inactive" })));

  if (deployments.length === PER_PAGE) {
    await markInactive(pr, page + 1);
  }
}
