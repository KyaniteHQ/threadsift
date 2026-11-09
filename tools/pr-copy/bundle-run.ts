import { writeFileSync } from "node:fs";

import { z } from "zod";

import { Stop } from "./check-run.ts";
import { currentCopy } from "./copy-head.ts";
import { requiredEnv } from "./env.ts";
import { github } from "./github-request.ts";
import { Sha } from "./github.ts";
import { artifactDigest } from "./stage.ts";

const BUNDLE_PATH = ".github/workflows/bundle.yml";

const BundleRun = z.object({
  id: z.number().int(),
  head_sha: Sha,
  event: z.string(),
  conclusion: z.string().nullable(),
  path: z.string(),
  pull_requests: z.array(z.object({ number: z.number().int() })),
  head_repository: z.object({ full_name: z.string() }).nullable(),
});

interface BundleBuild {
  readonly run: number;
  readonly artifact: string | null;
}

async function bundleBuildOf(pr: number, head: string): Promise<BundleBuild> {
  const copy = await currentCopy(pr);
  const name = `pull request ${String(pr)}`;

  if (copy === null) throw new Stop(`${name} has no copy`);

  if (copy.head !== head) throw new Stop(`the copy of ${name} is at ${copy.head}, not ${head}`);

  if (copy.bundleRun === null) {
    throw new Stop(`the record of the copy of ${name} names no bundle run; deploy it again`);
  }

  const run = await github(`actions/runs/${String(copy.bundleRun)}`, BundleRun);

  if (
    run.head_sha !== head ||
    run.event !== "pull_request" ||
    run.conclusion !== "success" ||
    run.path !== BUNDLE_PATH ||
    !run.pull_requests.some((pull) => pull.number === pr) ||
    run.head_repository?.full_name !== requiredEnv("GITHUB_REPOSITORY")
  ) {
    throw new Stop(`bundle run ${String(run.id)} is not a successful bundle of ${name} at ${head}`);
  }

  return { run: run.id, artifact: copy.artifact };
}

export async function writeBundleRun(pr: number, head: string, out: string): Promise<void> {
  writeFileSync(out, `${String((await bundleBuildOf(pr, head)).run)}\n`);
}

export async function requireBundleBuild(
  options: Readonly<{ pr: number; head: string; artifact: string }>,
): Promise<void> {
  const { pr, head, artifact } = options;
  const name = `pull request ${String(pr)}`;
  const built = (await bundleBuildOf(pr, head)).artifact;

  if (built === null) {
    throw new Stop(`the record of the copy of ${name} holds no build digest; deploy it again`);
  }

  if (artifactDigest(artifact) !== built) {
    throw new Stop(
      `${artifact} is not the bundle of ${name} at ${head}: its files differ from the build the copy was deployed from`,
    );
  }
}
