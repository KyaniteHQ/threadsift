import { catalogKey } from "../src/core/catalog-key.ts";
import { CommandFailure } from "./command-failure.ts";
import {
  demoUrl,
  insertHighlightProposals,
  insertHighlights,
  missingHighlights,
} from "./preview-demo-highlights.ts";
import { quoted, rowNames } from "./preview-migrations.ts";

type Pair = { readonly from: string; readonly into: string; readonly reason: string };

const demoTagMerges = [
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
] as const satisfies readonly Pair[];

const demoTopicMerges = [
  {
    from: "ML",
    into: "Machine learning",
    reason: "ML is the usual short form of Machine learning, both name the same subject.",
  },
  {
    from: "Game",
    into: "Games",
    reason: "Game is the singular of Games, both hold writing about video games.",
  },
  {
    from: "Home lab",
    into: "Homelab",
    reason: "Home lab and Homelab are two spellings of the hobby of running servers at home.",
  },
] as const satisfies readonly Pair[];

type DemoDigestPaste = {
  readonly url: string;
  readonly page: { readonly markdown: string; readonly title: string };
  readonly digest: {
    readonly title: string;
    readonly topic: string;
    readonly tags: readonly string[];
    readonly summary: string;
    readonly keyPoints: readonly string[];
  };
};

function demoDigestPaste(
  number: number,
  digest: { readonly topic: string; readonly tags: readonly string[] },
): DemoDigestPaste {
  const label = `Demo item ${String(number)}`;

  return {
    url: demoUrl(number),
    page: {
      markdown: Array.from({ length: 30 }, () => `${label} text.`).join("\n\n"),
      title: label,
    },
    digest: {
      title: label,
      ...digest,
      summary: `${label} summary.`,
      keyPoints: [`${label} key point.`],
    },
  };
}

const tagPastes = demoTagMerges.map(({ from, into }, index) =>
  demoDigestPaste(index + 1, { topic: "Demo topic", tags: [from, into] }),
);

const topicPastes = demoTopicMerges.flatMap(({ from, into }, index) => {
  const first = tagPastes.length + 2 * index + 1;

  return [
    demoDigestPaste(first, { topic: from, tags: [] }),
    demoDigestPaste(first + 1, { topic: into, tags: [] }),
  ];
});

export const demoDigestPastes: readonly DemoDigestPaste[] = [...tagPastes, ...topicPastes];

const SUBJECTS = {
  "tag-merge": {
    label: "Tags",
    table: "tags",
    fromColumn: "from_tag_id",
    intoColumn: "into_tag_id",
    pairs: demoTagMerges,
  },
  "topic-merge": {
    label: "Topics",
    table: "topics",
    fromColumn: "from_topic_id",
    intoColumn: "into_topic_id",
    pairs: demoTopicMerges,
  },
} as const;

type Kind = keyof typeof SUBJECTS;

function pairsCte(kind: Kind): string {
  const rows = SUBJECTS[kind].pairs
    .map(
      ({ from, into, reason }) =>
        `(${quoted(catalogKey(from))}, ${quoted(catalogKey(into))}, ${quoted(reason)})`,
    )
    .join(", ");

  return `WITH demo (from_key, into_key, reason) AS (VALUES ${rows})`;
}

function insertProposals(kind: Kind): string {
  const { table, fromColumn, intoColumn } = SUBJECTS[kind];

  return `${pairsCte(kind)}
INSERT INTO proposals (kind, ${fromColumn}, ${intoColumn}, reason, state, created_at)
SELECT '${kind}', from_subject.id, into_subject.id, demo.reason, 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM demo
JOIN ${table} AS from_subject ON from_subject.key = demo.from_key
JOIN ${table} AS into_subject ON into_subject.key = demo.into_key
WHERE true
ON CONFLICT DO NOTHING`;
}

function missingPairs(kind: Kind, pinsReadable: boolean): string {
  const { label, table, fromColumn, intoColumn } = SUBJECTS[kind];

  const accepted = pinsReadable
    ? `AND NOT EXISTS (SELECT 1 FROM pins WHERE pins.kind = '${kind}' AND pins.from_key IN (demo.from_key, demo.into_key))`
    : "";

  return `${pairsCte(kind)}
SELECT '${label} ' || demo.from_key || ' and ' || demo.into_key AS name
FROM demo
WHERE NOT EXISTS (
  SELECT 1
  FROM proposals
  JOIN ${table} AS from_subject ON from_subject.id = proposals.${fromColumn}
  JOIN ${table} AS into_subject ON into_subject.id = proposals.${intoColumn}
  WHERE (from_subject.key = demo.from_key AND into_subject.key = demo.into_key)
    OR (from_subject.key = demo.into_key AND into_subject.key = demo.from_key)
) ${accepted}`;
}

const SCHEMA_PROBES = {
  proposals: { table: "proposals", column: "id" },
  topicProposals: { table: "proposals", column: "from_topic_id" },
  highlightProposals: { table: "proposals", column: "highlight_id" },
  pins: { table: "pins", column: "id" },
  topicPins: { table: "pins", column: "into_topic_id" },
} as const;

type SchemaFacts = Readonly<Record<keyof typeof SCHEMA_PROBES, boolean>>;

function schemaFacts(
  run: (args: readonly string[]) => string,
  scope: readonly string[],
): SchemaFacts {
  const query = Object.entries(SCHEMA_PROBES)
    .map(
      ([fact, { table, column }]) =>
        `SELECT '${fact}' AS name FROM pragma_table_info('${table}') WHERE name = '${column}'`,
    )
    .join(" UNION ALL ");

  const present = new Set(rowNames(run, scope, query));

  return {
    proposals: present.has("proposals"),
    topicProposals: present.has("topicProposals"),
    highlightProposals: present.has("highlightProposals"),
    pins: present.has("pins"),
    topicPins: present.has("topicPins"),
  };
}

export function seedDemoProposals(
  run: (args: readonly string[]) => string,
  scope: readonly string[],
): void {
  const facts = schemaFacts(run, scope);

  if (!facts.proposals) return;

  const seeded: readonly { readonly kind: Kind; readonly pinsReadable: boolean }[] =
    facts.topicProposals
      ? [
          { kind: "tag-merge", pinsReadable: facts.pins },
          { kind: "topic-merge", pinsReadable: facts.topicPins },
        ]
      : [{ kind: "tag-merge", pinsReadable: facts.pins }];

  const inserts = [
    ...seeded.map(({ kind }) => insertProposals(kind)),
    ...(facts.highlightProposals ? [insertHighlights(), insertHighlightProposals()] : []),
  ];

  run(["d1", "execute", "DB", "--json", "--command", inserts.join(";\n"), ...scope]);

  const checks = [
    ...seeded.map(({ kind, pinsReadable }) => missingPairs(kind, pinsReadable)),
    ...(facts.highlightProposals ? [missingHighlights()] : []),
  ];

  const missing = rowNames(run, scope, checks.join(";\n"));

  if (missing.length > 0)
    throw new CommandFailure({
      kind: "check",
      reason: `Preview demo Proposals missing for ${missing.join(", ")}`,
      recovery:
        "Check that the preview's Tags, Topics and demo Items carry the demo names and that Digest publication finished, then rerun deploy.",
    });
}
