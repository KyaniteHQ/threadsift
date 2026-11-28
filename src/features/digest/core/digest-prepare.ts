import type { Database } from "../../../core/kernel/database.ts";
import { keptNotUpdated, markDigest, unusableInput } from "../../../core/kernel/digest-marker.ts";
import { report } from "../../../core/kernel/failure-log.ts";
import { guardedOutcome } from "../../../core/kernel/guarded-outcome.ts";
import {
  type ClaimedJob,
  type JobOutcome,
  type JobPorts,
  settled,
} from "../../../core/kernel/job-outcome.ts";
import { readCatalog } from "../../wiki/core/catalog.ts";
import { hoppedPage } from "./digest-hop.ts";
import { type DigestInput, generationCurrent } from "./digest-input.ts";
import { modelInput } from "./digest-model-input.ts";
import { readDigestText } from "./digest-post-text.ts";
import type { DigestPrompt } from "./digest-prompt.ts";

type ReadyPrompt = Extract<DigestPrompt, { kind: "ready" }>;

type DigestPrepared =
  | { readonly kind: "settled"; readonly outcome: JobOutcome }
  | {
      readonly kind: "ask";
      readonly catalog: Awaited<ReturnType<typeof readCatalog>>;
      readonly prompt: ReadyPrompt;
    };

function refusedInput(db: Database, item: Readonly<DigestInput>, fixedBytes: number): JobOutcome {
  report("digest-input-refused", {
    itemId: item.id,
    reason: "fixed-metadata-over-cap",
    fixedBytes,
  });

  return guardedOutcome(db, generationCurrent(item), {
    writes: [markDigest(db, item.id, "attempt-failed")],
  });
}

export function emptyInput(db: Database, item: Readonly<DigestInput>): JobOutcome {
  return guardedOutcome(db, generationCurrent(item), { writes: unusableInput(db, item.id) });
}

export async function preparedDigest(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<DigestPrepared> {
  if (!item.providerMayRead) {
    return settled(
      guardedOutcome(ports.db, generationCurrent(item), {
        writes: keptNotUpdated(ports.db, item.id),
      }),
    );
  }

  const filed = await readDigestText(ports, job, item);

  if ("outcome" in filed) return settled(filed.outcome);

  const hop = await hoppedPage(ports, job, item);

  if ("outcome" in hop) return settled(hop.outcome);

  if (hop.page === null && !item.hasContent) return settled(emptyInput(ports.db, item));

  const catalog = await readCatalog(ports.db);
  const prompt = await modelInput(ports.db, item, filed.text, catalog, hop.page);

  if (prompt.kind === "too-large") {
    return settled(refusedInput(ports.db, item, prompt.fixedBytes));
  }

  return { kind: "ask", catalog, prompt };
}
