import { PROJECTION_VERSION } from "../src/core/text-projection.ts";
import { NOW_MS, PLAIN_CHECK, quoted, valuesCte } from "./preview-sql.ts";

export type DemoHighlight = { readonly url: string; readonly exact: string };

const KIND = "highlight-lost";
const STATUS = "gone";

function demoCte(demos: readonly DemoHighlight[]): string {
  return valuesCte(
    "demo",
    ["url", "exact"],
    demos.map(({ url, exact }) => [quoted(url), quoted(exact)]),
  );
}

export function insertHighlights(demos: readonly DemoHighlight[]): string {
  return `${demoCte(demos)}
INSERT INTO highlights (item_id, comment_id, exact, prefix, suffix, hint, projection, created_at, status, start)
SELECT items.id, NULL, demo.exact, '', '', 0, ${String(PROJECTION_VERSION)}, ${NOW_MS}, ${quoted(STATUS)}, NULL
FROM demo
JOIN items ON items.normalized_url = demo.url
WHERE NOT EXISTS (
  SELECT 1 FROM highlights WHERE highlights.item_id = items.id AND highlights.exact = demo.exact
)`;
}

export function insertHighlightProposals(demos: readonly DemoHighlight[]): string {
  return `${demoCte(demos)}
INSERT INTO proposals (kind, highlight_id, reason, state, created_at)
SELECT ${quoted(KIND)}, highlights.id, ${quoted(PLAIN_CHECK)}, 'open', ${NOW_MS}
FROM demo
JOIN items ON items.normalized_url = demo.url
JOIN highlights ON highlights.item_id = items.id AND highlights.exact = demo.exact
WHERE true
ON CONFLICT DO NOTHING`;
}

export function missingHighlights(demos: readonly DemoHighlight[]): string {
  return `${demoCte(demos)}
SELECT 'Highlight "' || demo.exact || '" on ' || demo.url AS name
FROM demo
WHERE NOT EXISTS (SELECT 1 FROM items WHERE items.normalized_url = demo.url)
  OR EXISTS (
    SELECT 1
    FROM items
    JOIN highlights ON highlights.item_id = items.id AND highlights.exact = demo.exact
    WHERE items.normalized_url = demo.url
      AND NOT EXISTS (
        SELECT 1 FROM proposals WHERE proposals.highlight_id = highlights.id AND proposals.kind = ${quoted(KIND)}
      )
  )`;
}
