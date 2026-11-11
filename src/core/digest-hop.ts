import { AI_DEADLINE_MS } from "./ai-contract.ts";
import type { Fetched } from "./details.ts";
import { type LinkedPage, cutDigestInput } from "./digest-prompt.ts";
import { type DigestInput, staleOutcome } from "./digest-source.ts";
import { FETCH_DEADLINE_MS, fetchLink } from "./fetch-link.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";

export type HopPage = LinkedPage | null;

export const DIGEST_DEADLINE_MS = AI_DEADLINE_MS + FETCH_DEADLINE_MS;

const GITHUB_HOP_ATTEMPTS = 1;

type HopResult = Fetched["status"] | "text" | "no-text" | "error";

type HopItem = Pick<DigestInput, "id" | "generation" | "linkedUrl">;

type PageText = Pick<LinkedPage, "title" | "text">;

function pageTextOf(fetched: Readonly<Fetched>): PageText | null {
  if (fetched.status !== "ok") return null;

  const { title, content } = fetched.found;

  switch (content?.kind) {
    case "article":
      return { title, text: content.postText };
    case "github-repo":
      return content.readme === null ? null : { title, text: content.readme };
    case "page":
    case "empty-page":
    case "thread":
    case "link":
    case undefined:
      return null;
    default: {
      const exhaustive: never = content;

      return exhaustive;
    }
  }
}

async function fetchedHop(ports: JobPorts, url: string): Promise<Fetched | null> {
  try {
    return await fetchLink(ports, url, GITHUB_HOP_ATTEMPTS, AbortSignal.timeout(FETCH_DEADLINE_MS));
  } catch {
    return null;
  }
}

function resultOf(fetched: Readonly<Fetched> | null, found: PageText | null): HopResult {
  if (fetched === null) return "error";

  if (fetched.status !== "ok") return fetched.status;

  return found === null ? "no-text" : "text";
}

function logHop(
  job: Readonly<Pick<ClaimedJob, "id">>,
  item: Readonly<HopItem>,
  result: HopResult,
  startedAt: number,
): void {
  console.warn(
    JSON.stringify({
      event: "digest-hop",
      jobId: job.id,
      itemId: item.id,
      generation: item.generation,
      result,
      elapsedMs: Date.now() - startedAt,
    }),
  );
}

async function linkedPageOf(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<HopItem>,
): Promise<LinkedPage | null> {
  const { linkedUrl } = item;

  if (linkedUrl === null) return null;

  const startedAt = Date.now();
  const fetched = await fetchedHop(ports, linkedUrl);
  const read = fetched === null ? null : pageTextOf(fetched);
  const found = read === null || read.text.trim() === "" ? null : read;

  logHop(job, item, resultOf(fetched, found), startedAt);

  return found === null
    ? null
    : { url: linkedUrl, title: found.title, text: cutDigestInput(found.text) };
}

export async function hoppedPage(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<{ readonly page: HopPage } | { readonly outcome: JobOutcome }> {
  if (item.linkedUrl === null) return { page: null };

  const page = await linkedPageOf(ports, job, item);
  const stale = await staleOutcome(ports.db, item);

  return stale === null ? { page } : { outcome: stale };
}
