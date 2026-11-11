import { catalogKey } from "../src/core/catalog.ts";
import { hasTable } from "./preview-migrations.ts";

export const demoProposals = [
  {
    from: "machine-learning",
    into: "Machine Learning",
    reason: "Same concept, machine-learning is just the hyphenated spelling of Machine Learning.",
  },
  {
    from: "LLMs",
    into: "LLM",
    reason: "LLMs is the plural of LLM, both name large language models.",
  },
  {
    from: "deep-learning",
    into: "deep learning",
    reason: "deep-learning and deep learning are the same term with a hyphen versus a space.",
  },
  {
    from: "nodejs",
    into: "node.js",
    reason: "nodejs and node.js are two spellings of the Node.js runtime.",
  },
  {
    from: "data-science",
    into: "data science",
    reason: "data-science and data science are the same term with a hyphen versus a space.",
  },
  {
    from: "web-assembly",
    into: "WebAssembly",
    reason: "web-assembly and WebAssembly are two spellings of the same technology.",
  },
] as const;

export const demoDigestPastes = demoProposals.map(({ from, into }, index) => {
  const label = `Demo item ${String(index + 1)}`;

  return {
    url: `https://example.com/demo/${String(index + 1)}`,
    page: {
      markdown: Array.from({ length: 30 }, () => `${label} text.`).join("\n\n"),
      title: label,
    },
    digest: {
      title: label,
      topic: "Demo topic",
      tags: [from, into],
      summary: `${label} summary.`,
      keyPoints: [`${label} key point.`],
    },
  };
});

function quoted(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

export const demoProposalsInsert = `WITH demo (from_key, into_key, reason) AS (VALUES ${demoProposals
  .map(
    ({ from, into, reason }) =>
      `(${quoted(catalogKey(from))}, ${quoted(catalogKey(into))}, ${quoted(reason)})`,
  )
  .join(", ")})
INSERT INTO proposals (kind, from_tag_id, into_tag_id, reason, state, created_at)
SELECT 'tag-merge', from_tag.id, into_tag.id, demo.reason, 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM demo
JOIN tags AS from_tag ON from_tag.key = demo.from_key
JOIN tags AS into_tag ON into_tag.key = demo.into_key
WHERE true
ON CONFLICT DO NOTHING`;

export function seedDemoProposals(
  run: (args: readonly string[]) => string,
  scope: readonly string[],
): void {
  if (!hasTable(run, scope, "proposals")) return;

  run(["d1", "execute", "DB", "--json", "--command", demoProposalsInsert, ...scope]);
}
