import { type LinkRoute, takesPage } from "../../../core/contract/links.ts";
import { FETCH_DEADLINE_MS, X_FETCH_DEADLINE_MS } from "../../../core/contract/request-waits.ts";
import { SuppliedPageSchema } from "../../../core/contract/supplied-page.ts";
import { X_READER_BOT } from "../../../core/contract/x-settings-contract.ts";
import type { ClaimedJob, JobPorts } from "../../../core/kernel/job-outcome.ts";
import type { Concluded } from "../../media/core/details.ts";
import { fetchedWithThread } from "../../reddit/core/reddit-fetch.ts";
import { holdsNoThread } from "../../thread/core/thread-store.ts";
import {
  type XRead,
  type XRoute,
  fetchedByReader,
  noted,
  xRouteOf,
} from "../../x/core/x-reader.ts";
import { fetchedOfRoute, linkRouteOf, suppliedDetails } from "./fetch-link.ts";
import { pluginPage } from "./plugin-fetch.ts";

type JobRead =
  | { readonly kind: "bot" }
  | {
      readonly kind: "fetched";
      readonly fetched: XRead;
      readonly deadline: AbortSignal;
    };

const BOT_READ: JobRead = { kind: "bot" };

export function isRedditJob({ address }: Readonly<ClaimedJob>): boolean {
  return linkRouteOf(address).kind === "reddit";
}

async function fetchedByPlugin(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  route: Readonly<LinkRoute>,
  deadline: AbortSignal,
): Promise<Concluded | null> {
  const { db, fetchers } = ports;

  if (fetchers.length === 0 || !takesPage(job.address)) return null;

  if (route.kind === "reddit" && !(await holdsNoThread(db, job.itemId))) return null;

  const result = await pluginPage(fetchers, job.address, deadline);

  if (result.kind === "unclaimed") return null;

  return result.kind === "failed"
    ? { status: result.status }
    : suppliedDetails(ports.pages, result.page, job.address, deadline);
}

async function fetchedByRoute(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  route: Readonly<LinkRoute>,
  reader: Readonly<XRoute>,
  deadline: AbortSignal,
): Promise<XRead> {
  if (route.kind === "reddit") return fetchedWithThread(ports, job, route, deadline);

  if (route.kind === "x") {
    const read = await fetchedByReader(ports, reader, job, deadline);

    return (
      read ?? noted(await fetchedOfRoute(ports, route, job.address, job.attempts, deadline), reader)
    );
  }

  return fetchedOfRoute(ports, route, job.address, job.attempts, deadline);
}

async function fetchedByLink(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  reader: Readonly<XRoute>,
  deadline: AbortSignal,
): Promise<XRead> {
  const route = linkRouteOf(job.address);

  return (
    (await fetchedByPlugin(ports, job, route, deadline)) ??
    (await fetchedByRoute(ports, job, route, reader, deadline))
  );
}

export async function readJob(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobRead> {
  if (job.page !== null) {
    const deadline = AbortSignal.timeout(FETCH_DEADLINE_MS);
    const page = SuppliedPageSchema.parse(JSON.parse(job.page));

    return {
      kind: "fetched",
      fetched: await suppliedDetails(ports.pages, page, job.address, deadline),
      deadline,
    };
  }

  const reader = await xRouteOf(ports, job);

  if (reader.kind === X_READER_BOT) return BOT_READ;

  const deadline = AbortSignal.timeout(
    reader.kind === "grok-cli" ? X_FETCH_DEADLINE_MS : FETCH_DEADLINE_MS,
  );

  return { kind: "fetched", fetched: await fetchedByLink(ports, job, reader, deadline), deadline };
}
