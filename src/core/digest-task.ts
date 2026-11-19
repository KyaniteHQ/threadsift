import { DIGEST_INSTRUCTIONS, cutDigestInput } from "./digest-prompt.ts";
import { ModelDigestSchema } from "./digest-schema.ts";

export const DIGEST_TASK = {
  kind: "digest",
  instructions: DIGEST_INSTRUCTIONS,
  schema: ModelDigestSchema,
  prepareInput: cutDigestInput,
} as const;
