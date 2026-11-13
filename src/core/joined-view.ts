import { sql } from "drizzle-orm";

import { COMMENT_COUNT_COLUMNS } from "./comment-counts.ts";
import { hasDigestSource } from "./digest-source.ts";
import { STATUS_VIEW_COLUMNS } from "./item-status.ts";
import { hasOpenJob } from "./job-rows.ts";
import type { DigestOutcome, WaitReason, XReadNote } from "./kinds.ts";
import { noThreadFor } from "./reddit-thread.ts";
import { digests, items, jobs, media, topics } from "./schema.ts";

const DIGEST_VIEW_COLUMNS = {
  digestTitle: sql<string | null>`${digests.title}`.as("digest_title"),
  digestTopic: sql<
    string | null
  >`coalesce((select ${topics.name} from ${topics} where ${topics.id} = ${items.topicId}), ${digests.topic})`.as(
    "digest_topic",
  ),
  digestOutcome:
    sql<DigestOutcome>`case when exists ${hasOpenJob("digest")} then 'pending' when ${items.digestFailed} then 'failed' else 'none' end`.as(
      "digest_outcome",
    ),
  digestSource: sql<boolean>`${hasDigestSource()}`.mapWith(Boolean).as("digest_source"),
};

const WAITING_JOB = sql`${jobs.itemId} = ${items.id} and ${jobs.kind} in ('fetch', 'x_verify') and ${jobs.state} = 'queued' and ${jobs.waitReason} is not null`;

const WAIT_VIEW_COLUMNS = {
  waitReason:
    sql<WaitReason | null>`(select ${jobs.waitReason} from ${jobs} where ${WAITING_JOB})`.as(
      "wait_reason",
    ),
  retryAt: sql<number | null>`(select ${jobs.nextAttemptAt} from ${jobs} where ${WAITING_JOB})`.as(
    "retry_at",
  ),
};

const FIRST_STORED = sql`from ${media} where ${media.itemId} = ${items.id} and ${media.outcome} = 'stored' order by ${media.position} limit 1`;

const IMAGE_VIEW_COLUMNS = {
  imageKey: sql<string | null>`(select ${media.fileKey} ${FIRST_STORED})`.as("image_key"),
  imageAlt: sql<string | null>`(select ${media.alt} ${FIRST_STORED})`.as("image_alt"),
};

const FILL_VIEW_COLUMNS = {
  fillable:
    sql<boolean>`(${items.kind} in ('reddit-post', 'reddit-comment') and ${noThreadFor(items.id)})`
      .mapWith(Boolean)
      .as("fillable"),
};

const NOTE_VIEW_COLUMNS = {
  xNote:
    sql<XReadNote | null>`case when ${items.fetch} = 'ok' then null else ${items.xNote} end`.as(
      "x_note",
    ),
};

export const JOINED_VIEW_COLUMNS = {
  ...STATUS_VIEW_COLUMNS,
  ...NOTE_VIEW_COLUMNS,
  ...DIGEST_VIEW_COLUMNS,
  ...WAIT_VIEW_COLUMNS,
  ...COMMENT_COUNT_COLUMNS,
  ...IMAGE_VIEW_COLUMNS,
  ...FILL_VIEW_COLUMNS,
};
