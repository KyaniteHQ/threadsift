import { catalogKey } from "../src/core/catalog-key.ts";
import { CommandFailure } from "./command-failure.ts";
import type { Wrangler } from "./preview-cloudflare.ts";
import {
  type DemoDisagreement,
  insertDisagreements,
  missingDisagreements,
} from "./preview-demo-disagreements.ts";
import {
  type DemoHighlight,
  insertHighlightProposals,
  insertHighlights,
  missingHighlights,
} from "./preview-demo-highlights.ts";
import { insertOverviewProposals, missingOverviewProposals } from "./preview-demo-overviews.ts";
import { type SchemaFacts, schemaFacts } from "./preview-demo-schema.ts";
import { rowNames } from "./preview-migrations.ts";
import { NOW_MS, quoted, valuesCte } from "./preview-sql.ts";

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

const DEMO_TOPIC = "Demo topic";

function demoUrl(number: number): string {
  return `https://example.com/demo/${String(number)}`;
}

const demoLostHighlights = [
  { url: demoUrl(1), exact: "The queue drops the oldest message when the buffer fills." },
  {
    url: demoUrl(2),
    exact: "Batch jobs run after midnight to leave daytime capacity for live traffic.",
  },
  { url: demoUrl(3), exact: "Old snapshots expire only after the new backup finishes." },
] as const satisfies readonly DemoHighlight[];

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
  demoDigestPaste(index + 1, { topic: DEMO_TOPIC, tags: [from, into] }),
);

const topicPastes = demoTopicMerges.flatMap(({ from, into }, index) => {
  const first = tagPastes.length + 2 * index + 1;

  return [
    demoDigestPaste(first, { topic: from, tags: [] }),
    demoDigestPaste(first + 1, { topic: into, tags: [] }),
  ];
});

export const demoDigestPastes: readonly DemoDigestPaste[] = [...tagPastes, ...topicPastes];

const demoDisagreements = [
  {
    firstUrl: demoUrl(1),
    secondUrl: demoUrl(2),
    reason:
      "One says the queue drops the oldest message when the buffer fills, and the other says it blocks new writes.",
  },
  {
    firstUrl: demoUrl(3),
    secondUrl: demoUrl(4),
    reason:
      "The two articles disagree on whether batch jobs should run once overnight or in small intervals all day.",
  },
  {
    firstUrl: demoUrl(5),
    secondUrl: demoUrl(6),
    reason:
      "Old backup snapshots expire after a week under one retention rule, while the other keeps them for a year.",
  },
] as const satisfies readonly DemoDisagreement[];

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
  return valuesCte(
    "demo",
    ["from_key", "into_key", "reason"],
    SUBJECTS[kind].pairs.map(({ from, into, reason }) => [
      quoted(catalogKey(from)),
      quoted(catalogKey(into)),
      quoted(reason),
    ]),
  );
}

function insertProposals(kind: Kind): string {
  const { table, fromColumn, intoColumn } = SUBJECTS[kind];

  return `${pairsCte(kind)}
INSERT INTO proposals (kind, ${fromColumn}, ${intoColumn}, reason, state, created_at)
SELECT '${kind}', from_subject.id, into_subject.id, demo.reason, 'open', ${NOW_MS}
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

const demoOverviewTopics = [DEMO_TOPIC, demoTopicMerges[0].into, demoTopicMerges[1].into] as const;

type DemoSeed = {
  readonly enabled: (facts: SchemaFacts) => boolean;
  readonly inserts: readonly string[];
  readonly check: (facts: SchemaFacts) => string;
};

const DEMO_SEEDS: readonly DemoSeed[] = [
  {
    enabled: () => true,
    inserts: [insertProposals("tag-merge")],
    check: (facts) => missingPairs("tag-merge", facts.includes("pins")),
  },
  {
    enabled: (facts) => facts.includes("topicProposals"),
    inserts: [insertProposals("topic-merge")],
    check: (facts) => missingPairs("topic-merge", facts.includes("topicPins")),
  },
  {
    enabled: (facts) => facts.includes("highlightProposals"),
    inserts: [insertHighlights(demoLostHighlights), insertHighlightProposals(demoLostHighlights)],
    check: () => missingHighlights(demoLostHighlights),
  },
  {
    enabled: (facts) => facts.includes("overviewProposals"),
    inserts: [insertOverviewProposals(demoOverviewTopics)],
    check: () => missingOverviewProposals(demoOverviewTopics),
  },
  {
    enabled: (facts) => facts.includes("disagreementProposals"),
    inserts: [insertDisagreements(demoDisagreements)],
    check: () => missingDisagreements(demoDisagreements),
  },
];

export function seedDemoProposals(run: Wrangler, scope: readonly string[]): void {
  const facts = schemaFacts(run, scope);

  if (!facts.includes("proposals")) return;

  const seeds = DEMO_SEEDS.filter(({ enabled }) => enabled(facts));

  const inserts = seeds.flatMap((seed) => seed.inserts);

  run(["d1", "execute", "DB", "--json", "--command", inserts.join(";\n"), ...scope]);

  const missing = rowNames(run, scope, seeds.map((seed) => seed.check(facts)).join(";\n"));

  if (missing.length > 0)
    throw new CommandFailure({
      kind: "check",
      reason: `Preview demo Proposals missing for ${missing.join(", ")}`,
      recovery:
        "Check that the preview's Tags, Topics and demo Items carry the demo names and that Digest publication finished, then rerun deploy.",
    });
}
