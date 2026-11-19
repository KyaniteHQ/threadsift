import { ModelDigestSchema } from "./ai-contract.ts";
import { DIGEST_INSTRUCTIONS, cutDigestInput } from "./digest-prompt.ts";

export const DIGEST_TASK = {
  kind: "digest",
  instructions: DIGEST_INSTRUCTIONS,
  schema: ModelDigestSchema,
  prepareInput: cutDigestInput,
} as const;
