import type { Database } from "../../../core/kernel/database.ts";
import { markDigest } from "../../../core/kernel/digest-marker.ts";
import { logFailure } from "../../../core/kernel/failure-log.ts";
import { guardedOutcome } from "../../../core/kernel/guarded-outcome.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "../../../core/kernel/job-outcome.ts";
import { isLastAttempt } from "../../../core/kernel/job-retry.ts";
import { readPostText } from "../../thread/core/post-text.ts";
import { type DigestInput, generationCurrent, staleOutcome } from "./digest-input.ts";
import { cutDigestInput } from "./digest-prompt.ts";

class PostTextUnreadable extends Error {}

async function unreadableText(
  db: Database,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<JobOutcome> {
  const stale = await staleOutcome(db, item);

  if (stale !== null) return stale;

  if (!isLastAttempt(job.attempts))
    throw new PostTextUnreadable(`The post text file of Item ${item.id} cannot be read`);

  return {
    ...guardedOutcome(db, generationCurrent(item), {
      writes: [markDigest(db, item.id, "attempt-failed")],
    }),
    failedAttempt: true,
  };
}

type DigestText = { readonly text: string | null } | { readonly outcome: JobOutcome };

export async function readDigestText(
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
