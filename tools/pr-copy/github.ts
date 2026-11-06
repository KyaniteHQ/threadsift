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

const DeploymentSchema = z.object({ id: z.number().int(), payload: z.unknown() });

const StatusSchema = z.object({
  state: z.enum(["error", "failure", "inactive", "in_progress", "queued", "pending", "success"]),
});

const WorkflowRunEventSchema = z.object({
  workflow_run: z.object({
    head_sha: Sha,
    event: z.string(),
    conclusion: z.string().nullable(),
    head_repository: z.object({ full_name: z.string() }),
    pull_requests: z.array(z.object({ number: PrNumber })),
  }),
});

const ClosedEventSchema = z.object({
  action: z.literal("closed"),
  pull_request: z.object({ number: PrNumber }),
});

export const ArtifactMetaSchema = z.object({ pr: PrNumber, headSha: Sha });

export type ArtifactMeta = z.infer<typeof ArtifactMetaSchema>;

type Outcome =
  | { readonly kind: "success"; readonly copy: DeployedCopy }
  | { readonly kind: "failure" };

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

const Created = z.object({ id: z.number().int() });

function postStatus(id: number, status: Readonly<{ state: string; environment_url?: string }>) {
  const body = JSON.stringify({ ...status, log_url: logUrl(), auto_inactive: false });

  return github(`deployments/${String(id)}/statuses`, Created, body);
}

function task(pr: number): string {
  return `deploy:pr-${String(pr)}`;
}

export function eventReason(meta: Readonly<ArtifactMeta>): string | null {
  const { workflow_run: run } = event(WorkflowRunEventSchema);

  if (run.event !== "pull_request" || run.conclusion !== "success") {
    return `the gate run is a ${run.event} run that ended ${String(run.conclusion)}`;
  }

  if (run.head_repository.full_name !== repository()) {
    return `the gate ran for ${run.head_repository.full_name}, a fork`;
  }

  if (run.head_sha !== meta.headSha || !run.pull_requests.some((pull) => pull.number === meta.pr)) {
    return `the artifact names pull request ${String(meta.pr)} at ${meta.headSha}, which the gate run does not`;
  }

  return null;
}

export function closedPullRequest(): number {
  return event(ClosedEventSchema).pull_request.number;
}

export async function reopenedReason(pr: number): Promise<string | null> {
  const pull = await github(`pulls/${String(pr)}`, PullSchema);

  return pull.state === "closed" ? null : `pull request ${String(pr)} is open again`;
}

export async function staleReason(meta: Readonly<ArtifactMeta>): Promise<string | null> {
  const pull = await github(`pulls/${String(meta.pr)}`, PullSchema);
  const name = `pull request ${String(meta.pr)}`;

  if (pull.state !== "open") {
    return `${name} is closed`;
  }

  if (pull.base.ref !== "main") {
    return `${name} targets ${pull.base.ref}, not main`;
  }

  if (pull.head.sha !== meta.headSha || pull.head.repo?.full_name !== repository()) {
    return `${name} is at ${pull.head.sha} now`;
  }

  return null;
}

type Deployment = Readonly<z.infer<typeof DeploymentSchema>>;

async function deploymentsFrom(pr: number, page: number): Promise<Deployment[]> {
  const query = `environment=${ENVIRONMENT}&task=${encodeURIComponent(task(pr))}&per_page=${String(PER_PAGE)}&page=${String(page)}`;
  const deployments = await github(`deployments?${query}`, z.array(DeploymentSchema));

  return deployments.length < PER_PAGE
    ? deployments
    : [...deployments, ...(await deploymentsFrom(pr, page + 1))];
}

async function deploymentsOf(pr: number): Promise<Deployment[]> {
  const deployments = await deploymentsFrom(pr, 1);

  return deployments.toSorted((left, right) => right.id - left.id);
}

async function latestState(id: number) {
  const statuses = await github(
    `deployments/${String(id)}/statuses?per_page=1`,
    z.array(StatusSchema),
  );

  return statuses[0]?.state;
}

async function recordFrom(deployments: readonly Deployment[]): Promise<CopyRecord | null> {
  const [newest, ...older] = deployments;

  if (newest === undefined) {
    return null;
  }

  const state = await latestState(newest.id);

  if (state === "success") {
    return CopyRecordSchema.parse(newest.payload);
  }

  return state === "inactive" ? null : recordFrom(older);
}

export async function lastRecord(pr: number): Promise<CopyRecord | null> {
  return recordFrom(await deploymentsOf(pr));
}

function logUrl(): string {
  return `${requiredEnv("GITHUB_SERVER_URL")}/${repository()}/actions/runs/${requiredEnv("GITHUB_RUN_ID")}`;
}

export async function postDeployment(
  meta: Readonly<ArtifactMeta>,
  outcome: Outcome,
): Promise<void> {
  const deployment = await github(
    "deployments",
    Created,
    JSON.stringify({
      ref: meta.headSha,
      task: task(meta.pr),
      environment: ENVIRONMENT,
      auto_merge: false,
      required_contexts: [],
      transient_environment: true,
      production_environment: false,
      payload: outcome.kind === "success" ? outcome.copy.record : {},
      description: `Copy of pull request ${String(meta.pr)}`,
    }),
  );

  await postStatus(
    deployment.id,
    outcome.kind === "success"
      ? { state: "success", environment_url: outcome.copy.url }
      : { state: "failure" },
  );
}

export async function markInactive(pr: number): Promise<void> {
  const deployments = await deploymentsOf(pr);

  await Promise.all(
    deployments.map(async ({ id }) => {
      if ((await latestState(id)) !== "inactive") {
        await postStatus(id, { state: "inactive" });
      }
    }),
  );
}
