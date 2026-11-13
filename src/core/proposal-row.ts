import { type SQLWrapper, sql } from "drizzle-orm";

import type { ProposalKind, ProposalState } from "./kinds.ts";

type Subject = Readonly<SQLWrapper>;

interface Subjects {
  readonly fromTagId: Subject;
  readonly intoTagId: Subject;
  readonly fromTopicId: Subject;
  readonly intoTopicId: Subject;
  readonly highlightId: Subject;
  readonly topicId: Subject;
  readonly fromItemId: Subject;
  readonly intoItemId: Subject;
  readonly fromDigest: Subject;
  readonly intoDigest: Subject;
}

interface Row {
  readonly kind: ProposalKind;
  readonly state: Subject;
  readonly reason: Subject;
  readonly createdAt: number;
}

const NONE = sql`null`;

export function proposalRow(
  { kind, state, reason, createdAt }: Readonly<Row>,
  subjects: Readonly<Partial<Subjects>>,
) {
  return {
    id: sql<null>`null`.as("id"),
    kind: sql<ProposalKind>`${kind}`.as("kind"),
    fromTagId: sql<number | null>`${subjects.fromTagId ?? NONE}`.as("from_tag_id"),
    intoTagId: sql<number | null>`${subjects.intoTagId ?? NONE}`.as("into_tag_id"),
    fromTopicId: sql<number | null>`${subjects.fromTopicId ?? NONE}`.as("from_topic_id"),
    intoTopicId: sql<number | null>`${subjects.intoTopicId ?? NONE}`.as("into_topic_id"),
    reason: sql<string | null>`${reason}`.as("reason"),
    state: sql<ProposalState>`${state}`.as("state"),
    createdAt: sql<number>`${createdAt}`.as("created_at"),
    cursor: sql<null>`null`.as("cursor"),
    moved: sql<null>`null`.as("moved"),
    unitRevision: sql<null>`null`.as("unit_revision"),
    highlightId: sql<number | null>`${subjects.highlightId ?? NONE}`.as("highlight_id"),
    topicId: sql<number | null>`${subjects.topicId ?? NONE}`.as("topic_id"),
    fromItemId: sql<number | null>`${subjects.fromItemId ?? NONE}`.as("from_item_id"),
    intoItemId: sql<number | null>`${subjects.intoItemId ?? NONE}`.as("into_item_id"),
    fromDigest: sql<number | null>`${subjects.fromDigest ?? NONE}`.as("from_digest"),
    intoDigest: sql<number | null>`${subjects.intoDigest ?? NONE}`.as("into_digest"),
  };
}
