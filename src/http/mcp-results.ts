import type { CallToolResult } from "@modelcontextprotocol/server";
import type { z } from "zod";

import { logFailure } from "../core/failure-log.ts";
import type {
  ItemDetailResponseSchema,
  ItemReadResponseSchema,
  SavedItemResponseSchema,
} from "./schemas.ts";

type Structured =
  | z.infer<typeof ItemReadResponseSchema>
  | z.infer<typeof ItemDetailResponseSchema>
  | z.infer<typeof SavedItemResponseSchema>;

const INTERNAL_ERROR = "Internal error";

export function answered<Body extends Structured>(
  outputSchema: z.ZodType<Body>,
  structuredContent: Readonly<Body>,
): CallToolResult {
  outputSchema.parse(structuredContent);

  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

export function refused(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function guarded<Input>(
  tool: string,
  run: (input: Readonly<Input>) => Promise<CallToolResult>,
): (input: Readonly<Input>) => Promise<CallToolResult> {
  return async (input) => {
    try {
      return await run(input);
    } catch (error) {
      logFailure("mcp-tool-failed", { tool }, error);

      return refused(INTERNAL_ERROR);
    }
  };
}
