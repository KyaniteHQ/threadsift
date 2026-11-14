import { readCatalog } from "./catalog.ts";
import { hoppedPage } from "./digest-hop.ts";
import { type DigestPrompt, cutDigestInput } from "./digest-prompt.ts";
import {
  type DigestInput,
  currency,
  generationCurrent,
  markDigest,
  modelInput,
  staleOutcome,
  unusableInput,
} from "./digest-source.ts";
import { logFailure, report } from "./failure-log.ts";
import { insertGuard } from "./guards.ts";
import {
  type ClaimedJob,
  type JobOutcome,
  type JobPorts,
  isLastAttempt,
  settled,
} from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { readPostText } from "./post-text.ts";

type ReadyPrompt = Extract<DigestPrompt, { kind: "ready" }>;

type DigestPrepared =
  | { readonly kind: "settled"; readonly outcome: JobOutcome }
  | {
      readonly kind: "ask";
      readonly catalog: Awaited<ReturnType<typeof readCatalog>>;
      readonly prompt: ReadyPrompt;
    };

class PostTextUnreadable extends Error {}

async function unreadableText(
  db: Database,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<JobOutcome> {
  const stale = await staleOutcome(db, item);

  if (stale !== null) return stale;

  const generation = generationCurrent(item);
  const read = currency(db, generation, null);

  if (!isLastAttempt(job.attempts))
    throw new PostTextUnreadable(`The post text file of Item ${item.id} cannot be read`);

  return {
    currency: read,
    failedAttempt: true,
    writes: [insertGuard(db, generation), markDigest(db, item.id, "attempt-failed")],
  };
}

function refusedInput(db: Database, item: Readonly<DigestInput>, fixedBytes: number): JobOutcome {
  const generation = generationCurrent(item);

  report("digest-input-refused", {
    itemId: item.id,
    reason: "fixed-metadata-over-cap",
    fixedBytes,
  });

  return {
    currency: currency(db, generation, null),
    writes: [insertGuard(db, generation), markDigest(db, item.id, "attempt-failed")],
  };
}

type DigestText = { readonly text: string | null } | { readonly outcome: JobOutcome };

async function readDigestText(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<DigestText> {
  if (item.postTextKey === null) return { text: item.postText };

  let text: string | null;

  try {
    text = await readPostText(ports.files, item.id, item.postTextKey);
  } catch (error) {
    logFailure("post-text-not-read", { itemId: item.id }, error);
    text = null;
  }

  return text === null
    ? { outcome: await unreadableText(ports.db, job, item) }
    : { text: cutDigestInput(text) };
}

export function hasContent(item: Readonly<DigestInput>): boolean {
  return item.postText !== null || item.postTextKey !== null || item.hasComments;
}

export function emptyInput(db: Database, item: Readonly<DigestInput>): JobOutcome {
  const generation = generationCurrent(item);

  return {
    currency: currency(db, generation, null),
    writes: [insertGuard(db, generation), ...unusableInput(db, item.id)],
  };
}

export async function preparedDigest(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<DigestPrepared> {
  const filed = await readDigestText(ports, job, item);

  if ("outcome" in filed) return settled(filed.outcome);

  const hop = await hoppedPage(ports, job, item);

  if ("outcome" in hop) return settled(hop.outcome);

  if (hop.page === null && !hasContent(item)) return settled(emptyInput(ports.db, item));

  const catalog = await readCatalog(ports.db);
  const prompt = await modelInput(ports.db, item, filed.text, catalog, hop.page);

  if (prompt.kind === "too-large") {
    return settled(refusedInput(ports.db, item, prompt.fixedBytes));
  }

  return { kind: "ask", catalog, prompt };
}
