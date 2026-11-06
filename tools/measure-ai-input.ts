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

const env = z
  .object({
    CLOUDFLARE_WORKERS_AI_TOKEN: z.string().min(1),
    CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  })
  .parse(process.env);

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const RESERVED_OUTPUT = 2048;
const FUTURE_LISTS = ` Reserved future Topic and Tag list budget: ${"topic-tag ".repeat(455)}`;
const instructions = DIGEST_INSTRUCTIONS + FUTURE_LISTS;
const bytes = (text: string): number => new TextEncoder().encode(text).length;
const schemaBytes = bytes(JSON.stringify(z.toJSONSchema(DigestSchema, { unrepresentable: "any" })));

const provider = createOpenAICompatible({
  name: "input-budget",
  baseURL: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
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
      model: provider(MODEL),
      output: Output.object({ schema: DigestSchema }),
      instructions,
      prompt,
      maxOutputTokens: RESERVED_OUTPUT,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(60_000),
      telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
    });

    console.log(
      JSON.stringify({
        name,
        bytes: bytes(prompt),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalWithReservedOutput: (result.usage.inputTokens ?? 0) + RESERVED_OUTPUT,
        wholePromptBytes: bytes(prompt) + bytes(instructions) + schemaBytes,
        valid: DigestSchema.safeParse(result.output).success,
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
    model: MODEL,
    context: 24_000,
    limit: DIGEST_INPUT_BYTES,
    reservedOutput: RESERVED_OUTPUT,
    instructionsBytes: bytes(instructions),
    schemaBytes,
    futureListBytes: bytes(FUTURE_LISTS),
  }),
);

await Promise.all(cases.map(([name, input]) => measure(name, input)));
