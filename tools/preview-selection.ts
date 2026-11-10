import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { z } from "zod";

const repository = "KyaniteHQ/threadsift";
const number = z.number().int().positive().max(99_999_999);
const sha = z.string().regex(/^[a-f0-9]{40}$/u);

const pullRequest = z.object({
  number,
  state: z.enum(["open", "closed"]),
  head: z.object({ sha, repo: z.object({ full_name: z.string() }).nullable() }),
});

function github(path: string, query: string): readonly string[] {
  const result = spawnSync(
    "gh",
    ["api", `repos/${repository}/${path}`, "--paginate", "--jq", `${query} | @json`],
    {
      encoding: "utf8",
      timeout: 120_000,
    },
  );

  if (result.status !== 0) throw new Error("Preview selection could not read GitHub state");

  return result.stdout
    .trim()
    .split("\n")
    .filter((line) => line !== "");
}

const eventName = z
  .enum(["workflow_run", "workflow_dispatch", "schedule", "push"])
  .parse(process.env["GITHUB_EVENT_NAME"]);

const event = readFileSync(z.string().parse(process.env["GITHUB_EVENT_PATH"]), "utf8");

if (eventName === "workflow_run") {
  const { workflow_run: run } = z
    .object({
      workflow_run: z.object({
        id: z.number().int().positive(),
        event: z.string(),
        conclusion: z.string().nullable(),
        head_sha: sha,
        head_repository: z.object({ full_name: z.string() }),
        pull_requests: z.array(z.object({ number })),
      }),
    })
    .parse(JSON.parse(event));

  const pr = run.pull_requests[0];

  if (
    run.event !== "pull_request" ||
    run.conclusion !== "success" ||
    run.head_repository.full_name !== repository ||
    pr === undefined
  ) {
    console.log("[]");
  } else {
    const [current] = github(`pulls/${pr.number}`, ".").map((line) =>
      pullRequest.parse(JSON.parse(line)),
    );

    const eligible =
      current?.state === "open" &&
      current.head.sha === run.head_sha &&
      current.head.repo?.full_name === repository;

    console.log(
      JSON.stringify(
        eligible ? [{ pr: pr.number, operation: "deploy", run: run.id, sha: run.head_sha }] : [],
      ),
    );
  }
} else {
  const deploymentSchema = z.object({
    id: z.number().int().positive(),
    environment: z.string(),
    created_at: z.iso.datetime(),
  });

  const pages = github(
    "deployments?per_page=100",
    '.[] | select(.environment | test("^pr-[1-9][0-9]{0,7}$")) | {id, environment, created_at}',
  ).map((line) => deploymentSchema.parse(JSON.parse(line)));

  const requested =
    eventName === "workflow_dispatch"
      ? z
          .object({ inputs: z.object({ pr: z.string().optional() }).optional() })
          .parse(JSON.parse(event)).inputs?.pr
      : undefined;

  const latest = new Map(
    pages
      .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
      .map((deployment) => [deployment.environment, deployment]),
  );

  const candidates = new Map(
    [...latest.values()].flatMap(({ environment, id }) => {
      const match = /^pr-([1-9]\d{0,7})$/u.exec(environment)?.[1];

      return match === undefined ? [] : [[number.parse(Number(match)), id] as const];
    }),
  );

  if (requested !== undefined && requested !== "")
    candidates.set(number.parse(Number(requested)), 0);

  const closed = [];

  for (const [pr, deployment] of candidates) {
    if (deployment !== 0) {
      const statuses = github(
        `deployments/${deployment}/statuses?per_page=100`,
        ".[0] | select(. != null) | {state}",
      ).map((line) => z.object({ state: z.string() }).parse(JSON.parse(line)));

      if (statuses[0]?.state === "inactive") continue;
    }

    const [current] = github(`pulls/${pr}`, ".").map((line) => pullRequest.parse(JSON.parse(line)));

    if (current?.state === "closed" && current.head.repo?.full_name === repository)
      closed.push({ pr, operation: "close", run: 0, sha: current.head.sha });
  }

  console.log(JSON.stringify(closed));
}
