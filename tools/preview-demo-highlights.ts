import { PROJECTION_VERSION } from "../src/core/text-projection.ts";
import { quoted } from "./preview-migrations.ts";

const demoLostHighlights = [
  {
    item: 1,
    exact: "The queue drops the oldest message when the buffer fills.",
  },
  {
    item: 2,
    exact: "Batch jobs run after midnight to leave daytime capacity for live traffic.",
  },
  {
    item: 3,
    exact: "Old snapshots expire only after the new backup finishes.",
  },
] as const;

const LOST_HIGHLIGHT_REASON = "plain-check";

export function demoUrl(number: number): string {
  return `https://example.com/demo/${String(number)}`;
}

function highlightsCte(): string {
  const rows = demoLostHighlights
    .map(({ item, exact }) => `(${quoted(demoUrl(item))}, ${quoted(exact)})`)
    .join(", ");

  return `WITH demo (url, exact) AS (VALUES ${rows})`;
}

export function insertHighlights(): string {
  return `${highlightsCte()}
INSERT INTO highlights (item_id, comment_id, exact, prefix, suffix, hint, projection, created_at, status, start)
SELECT items.id, NULL, demo.exact, '', '', 0, ${String(PROJECTION_VERSION)}, CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'gone', NULL
FROM demo
JOIN items ON items.normalized_url = demo.url
WHERE NOT EXISTS (
  SELECT 1 FROM highlights WHERE highlights.item_id = items.id AND highlights.exact = demo.exact
)`;
}

export function insertHighlightProposals(): string {
  return `${highlightsCte()}
INSERT INTO proposals (kind, highlight_id, reason, state, created_at)
SELECT 'highlight-lost', highlights.id, '${LOST_HIGHLIGHT_REASON}', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM demo
JOIN items ON items.normalized_url = demo.url
JOIN highlights ON highlights.item_id = items.id AND highlights.exact = demo.exact
WHERE true
ON CONFLICT DO NOTHING`;
}

export function missingHighlights(): string {
  return `${highlightsCte()}
SELECT 'Highlight "' || demo.exact || '" on ' || demo.url AS name
FROM demo
WHERE NOT EXISTS (
  SELECT 1
  FROM items
  JOIN highlights ON highlights.item_id = items.id
  JOIN proposals ON proposals.highlight_id = highlights.id
  WHERE items.normalized_url = demo.url
    AND highlights.exact = demo.exact
    AND proposals.kind = 'highlight-lost'
)`;
}
