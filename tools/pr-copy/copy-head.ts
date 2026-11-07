import { z } from "zod";

import { github } from "./github-request.ts";
import { ENVIRONMENT, byNewest, deployments, task } from "./github.ts";
import { Sha256 } from "./stage.ts";

export interface CopyHead {
  readonly url: string;
  readonly head: string;
  readonly gateRun: number | null;
  readonly artifact: string | null;
}

const Build = z.object({ gateRun: z.number().int(), artifact: Sha256.optional() });

const Statuses = z.array(z.object({ state: z.string(), environment_url: z.url().optional() }));

export async function currentCopy(pr: number): Promise<CopyHead | null> {
  const [newest] = (await deployments(ENVIRONMENT, task(pr))).toSorted(byNewest);

  if (newest === undefined) return null;

  const [status] = await github(`deployments/${String(newest.id)}/statuses?per_page=1`, Statuses);

  if (status?.state === "inactive") return null;

  if (status?.state !== "success" || status.environment_url === undefined) {
    throw new Error(
      `The newest deployment of pull request ${String(pr)} is ${status?.state ?? "without a status"}, not success`,
    );
  }

  const build = Build.safeParse(newest.payload).data;

  return {
    url: status.environment_url,
    head: newest.sha,
    gateRun: build?.gateRun ?? null,
    artifact: build?.artifact ?? null,
  };
}
