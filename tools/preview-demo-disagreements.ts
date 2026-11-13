import { NOW_MS, quoted, valuesCte } from "./preview-sql.ts";

export type DemoDisagreement = {
  readonly firstUrl: string;
  readonly secondUrl: string;
  readonly reason: string;
};

const KIND = "items-disagree";

function demoCte(demos: readonly DemoDisagreement[]): string {
  const demo = valuesCte(
    "demo",
    ["first_url", "second_url", "reason"],
    demos.map(({ firstUrl, secondUrl, reason }) => [firstUrl, secondUrl, reason]),
  );

  return `${demo},
pair AS (
  SELECT demo.first_url, demo.second_url, demo.reason, min(first_item.id, second_item.id) AS low_id, max(first_item.id, second_item.id) AS high_id
  FROM demo
  JOIN items AS first_item ON first_item.normalized_url = demo.first_url
  JOIN items AS second_item ON second_item.normalized_url = demo.second_url
)`;
}

const PINNED = `AND NOT EXISTS (SELECT 1 FROM pins WHERE pins.kind = ${quoted(KIND)} AND pins.from_key = pair.low_id || ':' || pair.high_id)`;

export function insertDisagreements(demos: readonly DemoDisagreement[]): string {
  return `${demoCte(demos)}
INSERT INTO proposals (kind, from_item_id, into_item_id, from_digest, into_digest, reason, state, created_at)
SELECT ${quoted(KIND)}, pair.low_id, pair.high_id, low_digest.task_id, high_digest.task_id, pair.reason, 'open', ${NOW_MS}
FROM pair
JOIN digests AS low_digest ON low_digest.item_id = pair.low_id
JOIN digests AS high_digest ON high_digest.item_id = pair.high_id
WHERE true ${PINNED}
ON CONFLICT DO NOTHING`;
}

export function missingDisagreements(demos: readonly DemoDisagreement[]): string {
  return `${demoCte(demos)}
SELECT 'Items ' || pair.first_url || ' and ' || pair.second_url AS name
FROM pair
WHERE NOT EXISTS (
  SELECT 1
  FROM proposals
  WHERE proposals.kind = ${quoted(KIND)}
    AND min(proposals.from_item_id, proposals.into_item_id) = pair.low_id
    AND max(proposals.from_item_id, proposals.into_item_id) = pair.high_id
) ${PINNED}`;
}
