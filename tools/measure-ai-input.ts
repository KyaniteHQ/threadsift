import { randomBytes } from "node:crypto";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, Output, generateText } from "ai";
import { z } from "zod";

import {
  ModelDigestSchema,
  DIGEST_INSTRUCTIONS,
  DIGEST_INPUT_BYTES,
  digestPrompt,
  DIGEST_CATALOG_BYTES,
  utf8Length,
} from "../src/core/ai-contract.ts";
import { AI_CALL_OPTIONS } from "../src/targets/shared/ai-call-options.ts";
import { PROOF_MODEL, workersAiUrl } from "./workers-ai-proof.ts";

const env = z
  .object({
    CLOUDFLARE_WORKERS_AI_TOKEN: z.string().min(1),
    CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  })
  .parse(process.env);

const RESERVED_OUTPUT = AI_CALL_OPTIONS.maxOutputTokens;

const catalog = {
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

const cases = [
  ["English", "Shared notebooks keep useful passages with their sources. ".repeat(500)],
  ["Turkish", "Okurlar kaynağı ve düzeltilmiş metni birlikte saklıyor. ".repeat(500)],
  ["CJK", "読書記録を保存し出典と修正内容を比較する。".repeat(700)],
  ["Emoji", "📖🧪🌍📝🔍".repeat(1000)],
  ["Hex", randomBytes(10000).toString("hex")],
] as const;

const selectedCases = cases.filter(
  ([name]) => process.argv[2] === undefined || process.argv[2] === name,
);

if (selectedCases.length === 0) throw new Error("No matching input case");

async function measure(name: string, input: string): Promise<void> {
  const prompt = digestPrompt(input, catalog);

  try {
    const result = await generateText({
      model: provider(PROOF_MODEL),
      output: Output.object({ schema: ModelDigestSchema }),
      instructions: DIGEST_INSTRUCTIONS,
      prompt,
      ...AI_CALL_OPTIONS,
      abortSignal: AbortSignal.timeout(60_000),
    });

    console.log(
      JSON.stringify({
        name,
        bytes: utf8Length(prompt),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalWithReservedOutput: (result.usage.inputTokens ?? 0) + RESERVED_OUTPUT,
        wholePromptBytes: utf8Length(prompt) + utf8Length(DIGEST_INSTRUCTIONS) + schemaBytes,
        valid: true,
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        name,
        failed: true,
        status: APICallError.isInstance(error) ? error.statusCode : null,
      }),
    );
    process.exitCode = 1;
  }
}

console.log(
  JSON.stringify({
    model: PROOF_MODEL,
    context: 24_000,
    limit: DIGEST_INPUT_BYTES,
    reservedOutput: RESERVED_OUTPUT,
    instructionsBytes: utf8Length(DIGEST_INSTRUCTIONS),
    schemaBytes,
    catalogBytes: DIGEST_CATALOG_BYTES,
    topics: catalog.topics.length,
    tags: catalog.tags.length,
  }),
);

await Promise.all(selectedCases.map(([name, input]) => measure(name, input)));
