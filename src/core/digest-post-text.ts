import type { Database } from "./database.ts";
import { type DigestInput, generationCurrent, staleOutcome } from "./digest-input.ts";
import { markDigest } from "./digest-marker.ts";
import { cutDigestInput } from "./digest-prompt.ts";
import { logFailure } from "./failure-log.ts";
import { guardedOutcome } from "./guarded-outcome.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";
import { isLastAttempt } from "./job-retry.ts";
import { readPostText } from "./post-text.ts";

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
