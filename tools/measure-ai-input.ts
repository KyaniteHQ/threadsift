import { createHash, randomBytes } from "node:crypto";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, Output, generateText } from "ai";
import { z } from "zod";

import { BASE_OUTPUT_TOKENS, ModelDigestSchema } from "../src/core/ai-contract.ts";
import {
  type CatalogNames,
  type CommentCandidate,
  type DigestPrompt,
  type PromptItem,
  DIGEST_INSTRUCTIONS,
  DIGEST_INPUT_BYTES,
  digestPrompt,
  DIGEST_CATALOG_BYTES,
  utf8Length,
} from "../src/core/digest-prompt.ts";
import { AI_CALL_OPTIONS } from "../src/targets/shared/ai-call.ts";
import { PROOF_MODEL, workersAiUrl } from "./workers-ai-proof.ts";

const env = z
  .object({
    CLOUDFLARE_WORKERS_AI_TOKEN: z.string().min(1),
    CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  })
  .parse(process.env);

const fullCatalog: CatalogNames = {
  topics: Array.from({ length: 200 }, (_, index) => `Topic ${index}: reading and research`),
  tags: Array.from({ length: 500 }, (_, index) => `Tag ${index}: notes and sources`),
};

const schemaBytes = utf8Length(
  JSON.stringify(z.toJSONSchema(ModelDigestSchema, { unrepresentable: "any" })),
);

const provider = createOpenAICompatible({
  name: "input-budget",
  baseURL: workersAiUrl(env.CLOUDFLARE_ACCOUNT_ID),
  apiKey: env.CLOUDFLARE_WORKERS_AI_TOKEN,
  supportsStructuredOutputs: true,
});

const CONTEXT_TOKENS = 24_000;

const CALL_DEADLINE_MS = 240_000;

const SPARSE_CATALOG = { topics: ["Reading"], tags: ["notes"] };

interface Case {
  readonly name: string;
  readonly item: PromptItem;
  readonly comments: readonly CommentCandidate[];
  readonly catalog: CatalogNames;
  readonly instructions: string;
}

function textCase(name: string, postText: string): Case {
  return {
    name,
    item: { title: "Measured Item", source: "article", postText },
    comments: [],
    catalog: fullCatalog,
    instructions: DIGEST_INSTRUCTIONS,
  };
}

function threadCase(
  name: string,
  postText: string | null,
  bodies: readonly string[],
  options: Readonly<{
    catalog?: CatalogNames;
    wireId?: (index: number) => string;
    instructions?: string;
  }> = {},
): Case {
  const idOf = options.wireId ?? ((index: number) => `m${index}`);

  return {
    name,
    item: { title: "Measured thread", source: "reddit", postText },
    comments: bodies.map((body, index) => ({
      id: `t1_${idOf(index)}`,
      parentId: index % 3 === 0 ? null : `t1_${idOf(index - 1)}`,
      body,
    })),
    catalog: options.catalog ?? fullCatalog,
    instructions: options.instructions ?? DIGEST_INSTRUCTIONS,
  };
}

const LONGEST_WIRE_ID = 29;

function longId(index: number): string {
  return createHash("sha256").update(String(index)).digest("hex").slice(0, LONGEST_WIRE_ID);
}

const ESCAPING = 'He said "stop" \\ then C:\\temp\\x\nline two\ttabbed \u0001 </script>';

const cases: readonly Case[] = [
  textCase("English", "Shared notebooks keep useful passages with their sources. ".repeat(500)),
  textCase("Turkish", "Okurlar kaynağı ve düzeltilmiş metni birlikte saklıyor. ".repeat(500)),
  textCase("CJK", "読書記録を保存し出典と修正内容を比較する。".repeat(700)),
  textCase("Emoji", "📖🧪🌍📝🔍".repeat(1000)),
  textCase("Hex", randomBytes(10000).toString("hex")),
  threadCase(
    "Escaping",
    ESCAPING.repeat(40),
    Array.from({ length: 60 }, (_, index) => `${ESCAPING} number ${index}`.repeat(3)),
  ),
  threadCase(
    "Multilingual comments",
    "Okurlar kaynağı ve düzeltilmiş metni birlikte saklıyor. ".repeat(60),
    Array.from(
      { length: 90 },
      (_, index) =>
        ["Kaynağı önce kontrol edin", "出典を先に確認する", "📖🧪 check the source first"][
          index % 3
        ]?.repeat(6) ?? "",
    ),
  ),
  threadCase(
    "Many short comments",
    "A question about caching.",
    Array.from({ length: 600 }, (_, index) => `Run step ${index} first.`),
  ),
  threadCase(
    "Large selection",
    null,
    Array.from(
      { length: 400 },
      (_, index) => `Setting cache_${index}=on fixed the stall for me on version ${index}.`,
    ),
  ),
  threadCase(
    "Sparse catalog, short ids",
    null,
    Array.from(
      { length: 600 },
      (_, index) => `Setting cache_${index}=on fixed the stall for me on version ${index}.`,
    ),
    { catalog: SPARSE_CATALOG },
  ),
  threadCase(
    "Capacity selection, every id requested",
    null,
    Array.from(
      { length: 600 },
      (_, index) => `Setting cache_${index}=on fixed the stall for me on version ${index}.`,
    ),
    {
      catalog: { topics: [], tags: [] },
      wireId: longId,
      instructions: `${DIGEST_INSTRUCTIONS} For this measurement, keep every comment.`,
    },
  ),
  threadCase(
    "Capacity, smallest records",
    null,
    Array.from({ length: 600 }, (_, index) => `k${index}`),
    { catalog: { topics: [], tags: [] }, wireId: longId },
  ),
];

const selectedCases = cases.filter(
  ({ name }) => process.argv[2] === undefined || process.argv[2] === name,
);

if (selectedCases.length === 0) throw new Error("No matching input case");

function fail(name: string, reason: string, status: number | null = null): void {
  console.log(JSON.stringify({ name, failed: true, reason, status }));
  process.exitCode = 1;
}

async function measure({
  name,
  item,
  comments,
  catalog,
  instructions,
}: Readonly<Case>): Promise<void> {
  const prompt = digestPrompt(item, comments, catalog);

  if (prompt.kind !== "ready") {
    fail(name, "fixed-metadata-over-cap");

    return;
  }

  try {
    const result = await generateText({
      model: provider(PROOF_MODEL),
      output: Output.object({ schema: ModelDigestSchema }),
      instructions,
      prompt: prompt.input,
      maxOutputTokens: prompt.maxOutputTokens,
      ...AI_CALL_OPTIONS,
      abortSignal: AbortSignal.timeout(CALL_DEADLINE_MS),
    });

    report(name, prompt, result);
  } catch (error) {
    fail(
      name,
      error instanceof Error ? error.name : "call-failed",
      APICallError.isInstance(error) ? (error.statusCode ?? null) : null,
    );
  }
}

function report(
  name: string,
  prompt: Readonly<Extract<DigestPrompt, { readonly kind: "ready" }>>,
  result: Readonly<{
    usage: Readonly<{ inputTokens: number | undefined; outputTokens: number | undefined }>;
    output: Readonly<{ keptComments: readonly string[] }>;
    finishReason: string;
  }>,
): void {
  const { inputTokens, outputTokens } = result.usage;

  if (inputTokens === undefined) {
    fail(name, "no-input-token-usage");

    return;
  }

  const total = inputTokens + prompt.maxOutputTokens;
  const wholePromptBytes = utf8Length(prompt.input) + utf8Length(DIGEST_INSTRUCTIONS) + schemaBytes;

  console.log(
    JSON.stringify({
      name,
      bytes: utf8Length(prompt.input),
      inputTokens,
      outputTokens,
      maxOutputTokens: prompt.maxOutputTokens,
      totalWithAllowance: total,
      wholePromptBytes,
      onePerByteBound: wholePromptBytes + prompt.maxOutputTokens,
      counts: prompt.counts,
      returnedIds: result.output.keptComments.length,
      finishReason: result.finishReason,
      valid: true,
    }),
  );

  if (total > CONTEXT_TOKENS) fail(name, "over-context");

  if (result.finishReason !== "stop") fail(name, "finish-not-stop");
}

console.log(
  JSON.stringify({
    model: PROOF_MODEL,
    context: CONTEXT_TOKENS,
    limit: DIGEST_INPUT_BYTES,
    baseOutputTokens: BASE_OUTPUT_TOKENS,
    instructionsBytes: utf8Length(DIGEST_INSTRUCTIONS),
    schemaBytes,
    catalogBytes: DIGEST_CATALOG_BYTES,
    topics: fullCatalog.topics.length,
    tags: fullCatalog.tags.length,
  }),
);

await Promise.all(selectedCases.map((measured) => measure(measured)));
