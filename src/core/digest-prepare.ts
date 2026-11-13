import { readCatalog } from "./catalog.ts";
import { hoppedPage } from "./digest-hop.ts";
import type { DigestPrompt } from "./digest-prompt.ts";
import {
  type DigestInput,
  currency,
  generationCurrent,
  keptNotUpdated,
  modelInput,
  readDigestText,
  refusedInput,
} from "./digest-source.ts";
import { insertGuard } from "./guards.ts";
import { type ClaimedJob, type JobOutcome, type JobPorts, settled } from "./job-outcome.ts";
import type { Database } from "./ports.ts";

type ReadyPrompt = Extract<DigestPrompt, { kind: "ready" }>;

export type DigestPrepared =
  | { readonly kind: "settled"; readonly outcome: JobOutcome }
  | {
      readonly kind: "ask";
      readonly catalog: Awaited<ReturnType<typeof readCatalog>>;
      readonly prompt: ReadyPrompt;
    };

export function hasContent(item: Readonly<DigestInput>): boolean {
  return item.postText !== null || item.postTextKey !== null || item.hasComments;
}

export function emptyInput(db: Database, item: Readonly<DigestInput>): JobOutcome {
  const generation = generationCurrent(item);

  return {
    currency: currency(db, generation, null),
    writes: [insertGuard(db, generation), ...keptNotUpdated(db, item.id)],
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
