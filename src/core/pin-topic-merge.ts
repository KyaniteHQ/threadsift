import { and, asc, eq, ne, notExists, sql } from "drizzle-orm";

import { TOPIC_KIND, topicMoves } from "./catalog-key-links.ts";
import type { Advance } from "./data-step-contract.ts";
import { repointedTopicPins } from "./pins.ts";
import type { Database } from "./ports.ts";
import { proposalRelinks } from "./proposal-relink.ts";
import { pins, proposals, topics } from "./schema.ts";
import { topicClosingWrites } from "./topic-rewrite.ts";

function acceptingTopicFrom(db: Database) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(proposals)
      .where(and(eq(proposals.fromTopicId, topics.id), eq(proposals.state, "accepting"))),
  );
}

export function misfiledTopics(db: Database) {
  return db
    .select({ id: topics.id })
    .from(topics)
    .innerJoin(pins, and(eq(pins.kind, "topic-merge"), eq(pins.fromKey, topics.key)))
    .where(and(ne(pins.intoTopicId, topics.id), acceptingTopicFrom(db)));
}

export async function mergedTopic(db: Database): Promise<Advance> {
  const [next] = await db
    .select({ id: topics.id, intoId: pins.intoTopicId })
    .from(topics)
    .innerJoin(pins, and(eq(pins.kind, "topic-merge"), eq(pins.fromKey, topics.key)))
    .where(and(ne(pins.intoTopicId, topics.id), acceptingTopicFrom(db)))
    .orderBy(asc(topics.id))
    .limit(1);

  if (next === undefined || next.intoId === null) return { writes: [], cursor: "finish" };

  const moves = await TOPIC_KIND.linked(db, next.id);

  return {
    writes: [
      ...proposalRelinks(db, "topic-merge", next.id, next.intoId),
      repointedTopicPins(db, next.id, next.intoId),
      ...topicMoves(db, next.id, next.intoId, moves),
      ...topicClosingWrites(db, next.id, next.intoId),
    ],
    cursor: "topics",
  };
}
