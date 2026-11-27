import { statusIdOf } from "../../../core/contract/links.ts";
import { StatusIdSchema } from "../../../core/contract/x-wire.ts";
import { report } from "../../../core/kernel/failure-log.ts";
import type { Fetched } from "../../media/core/details.ts";
import { concludedOfRefusal } from "./x-api-answer.ts";
import { type XApiReads, factsOf } from "./x-api-map.ts";
import { nextRequest } from "./x-api-plan.ts";
import { type ReadPorts, type Run, type Tally, leftFor, sent, spentBy } from "./x-api-send.ts";
import { type Step, appliedStep, unaffordable } from "./x-api-steps.ts";
import { ANSWER_REFUSED, type ApiRead, storedOf } from "./x-api-stored.ts";
import { loadXApi } from "./x-api-token.ts";

export type { ApiRead } from "./x-api-stored.ts";

interface Source {
  readonly itemId: number;
  readonly address: string;
}

async function stepOf(
  run: Readonly<Run>,
  tally: Readonly<Tally>,
  reads: Readonly<XApiReads>,
): Promise<{ readonly step: Step; readonly tally: Tally }> {
  const next = nextRequest(factsOf(reads), await leftFor(run, tally));

  if (next.kind === "done") return { step: { kind: "finished", why: "done" }, tally };

  const answered = next.kind === "request" ? await sent(run, tally, next.request) : null;

  if (next.kind !== "request" || answered === null) return { step: unaffordable(reads), tally };

  return { step: appliedStep(reads, next.request, answered.sent), tally: answered.tally };
}

async function readAll(run: Readonly<Run>, statusId: string) {
  let tally: Tally = { requests: 0, counted: { posts: 0, users: 0 }, lastSearchAt: null };
  let reads: XApiReads = { statusId, root: null, quoteLookups: [], searches: [] };

  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each request depends on the answers before it.
    const next = await stepOf(run, tally, reads);

    ({ tally } = next);

    if (next.step.kind !== "read") return { step: next.step, reads, tally };

    ({ reads } = next.step);
  }
}

export async function fetchedByXApi(
  ports: Readonly<ReadPorts>,
  source: Readonly<Source>,
  signal: AbortSignal,
): Promise<ApiRead | Fetched> {
  const statusId = StatusIdSchema.safeParse(statusIdOf(source.address));
  const { auth, limits } = await loadXApi(ports);

  if (!statusId.success) return ANSWER_REFUSED;

  if (auth.kind !== "token") {
    return concludedOfRefusal(auth.kind === "none" ? "not-configured" : "secret-missing");
  }

  const { step, reads, tally } = await readAll(
    { ports, token: auth.token, ...limits, signal },
    statusId.data,
  );

  report("x-api-read", {
    requests: tally.requests,
    posts: tally.counted.posts,
    users: tally.counted.users,
    micros: spentBy(tally),
    ended: step.kind === "finished" ? step.why : step.fetched.status,
  });

  return step.kind === "ended" ? step.fetched : storedOf(ports.db, source.itemId, reads);
}
