import { randomBytes } from "node:crypto";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, Output, generateText } from "ai";
import { z } from "zod";

import {
  DigestSchema,
  DIGEST_INSTRUCTIONS,
  DIGEST_INPUT_BYTES,
  cutDigestInput,
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
const FUTURE_LISTS = ` Reserved future Topic and Tag list budget: ${"topic-tag ".repeat(455)}`;
const instructions = DIGEST_INSTRUCTIONS + FUTURE_LISTS;
const bytes = (text: string): number => new TextEncoder().encode(text).length;
const schemaBytes = bytes(JSON.stringify(z.toJSONSchema(DigestSchema, { unrepresentable: "any" })));

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

async function measure(name: string, input: string): Promise<void> {
  const prompt = cutDigestInput(input);

  try {
    const result = await generateText({
      model: provider(PROOF_MODEL),
      output: Output.object({ schema: DigestSchema }),
      instructions,
      prompt,
      ...AI_CALL_OPTIONS,
      abortSignal: AbortSignal.timeout(60_000),
    });

    console.log(
      JSON.stringify({
        name,
        bytes: bytes(prompt),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalWithReservedOutput: (result.usage.inputTokens ?? 0) + RESERVED_OUTPUT,
        wholePromptBytes: bytes(prompt) + bytes(instructions) + schemaBytes,
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
    instructionsBytes: bytes(instructions),
    schemaBytes,
    futureListBytes: bytes(FUTURE_LISTS),
  }),
);

await Promise.all(cases.map(([name, input]) => measure(name, input)));
