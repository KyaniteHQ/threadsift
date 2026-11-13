import { catalogKey } from "../src/core/catalog-key.ts";
import { NOW_MS, PLAIN_CHECK, quoted, valuesCte } from "./preview-sql.ts";

const KIND = "overview-gap";

function demoCte(topics: readonly string[]): string {
  return valuesCte(
    "demo",
    ["key", "name"],
    topics.map((topic) => [quoted(catalogKey(topic)), quoted(topic)]),
  );
}

export function insertOverviewProposals(topics: readonly string[]): string {
  return `${demoCte(topics)}
INSERT INTO proposals (kind, topic_id, reason, state, created_at)
SELECT ${quoted(KIND)}, topics.id, ${quoted(PLAIN_CHECK)}, 'open', ${NOW_MS}
FROM demo
JOIN topics ON topics.key = demo.key
WHERE true
ON CONFLICT DO NOTHING`;
}

export function missingOverviewProposals(topics: readonly string[]): string {
  return `${demoCte(topics)}
SELECT 'Overview of Topic ' || demo.name AS name
FROM demo
JOIN topics ON topics.key = demo.key
WHERE NOT EXISTS (
  SELECT 1 FROM proposals WHERE proposals.topic_id = topics.id AND proposals.kind = ${quoted(KIND)}
)`;
}
