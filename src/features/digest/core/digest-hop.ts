import { AI_DEADLINE_MS } from "../../../core/contract/ai-contract.ts";
import { GROK_BOT_PROVIDER } from "../../../core/contract/provider-families.ts";
import { FETCH_DEADLINE_MS } from "../../../core/contract/request-waits.ts";
import { report } from "../../../core/kernel/failure-log.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "../../../core/kernel/job-outcome.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { loadAiConfig } from "../../ai/core/ai-load.ts";
import { fetchLink } from "../../fetch/core/fetch-link.ts";
import type { Fetched } from "../../media/core/details.ts";
import { type DigestInput, staleOutcome } from "./digest-input.ts";
import { type LinkedPage, cutDigestInput } from "./digest-prompt.ts";

type HopPage = LinkedPage | null;

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

type HopPorts = Readonly<Pick<Ports, "db" | "secrets" | "network" | "pages">>;

async function fetchedHop(ports: HopPorts, url: string): Promise<Fetched | null> {
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
  report("digest-hop", {
    jobId: job.id,
    itemId: item.id,
    generation: item.generation,
    result,
    elapsedMs: Date.now() - startedAt,
  });
}

async function linkedPageOf(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<HopItem>,
): Promise<LinkedPage | null> {
  const { linkedUrl } = item;

  if (linkedUrl === null) return null;

  const startedAt = Date.now();
  const { page, result } = await readLinkedPage(ports, linkedUrl);

  logHop(job, item, result, startedAt);

  return page;
}

export async function readLinkedPage(ports: HopPorts, url: string) {
  const fetched = await fetchedHop(ports, url);
  const read = fetched === null ? null : pageTextOf(fetched);
  const found = read === null || read.text.trim() === "" ? null : read;

  return {
    result: resultOf(fetched, found),
    page: found === null ? null : { url, title: found.title, text: cutDigestInput(found.text) },
  };
}

async function aiCanRun(ports: JobPorts): Promise<boolean> {
  const { state } = await loadAiConfig(ports);

  return state === "ready" || state === GROK_BOT_PROVIDER;
}

export async function hoppedPage(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<{ readonly page: HopPage } | { readonly outcome: JobOutcome }> {
  if (item.linkedUrl === null || !(await aiCanRun(ports))) return { page: null };

  const page = await linkedPageOf(ports, job, item);
  const stale = await staleOutcome(ports.db, item);

  return stale === null ? { page } : { outcome: stale };
}
