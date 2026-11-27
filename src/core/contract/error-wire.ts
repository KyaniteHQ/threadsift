import { z } from "zod";

import { REFUSAL_CODES } from "./access-contract.ts";
import { BUDGET_SPENT } from "./agent-token-contract.ts";
import { RESTORING_CODE } from "./restore-contract.ts";

export const NOT_FOUND = "Not found";

export const ErrorResponseSchema = z.object({
  error: z.string(),
  fetch: z.literal("refused").optional(),
  code: z.enum(REFUSAL_CODES).optional(),
});

export const UnavailableResponseSchema = z.object({
  error: z.string(),
  code: z.literal(RESTORING_CODE),
});

export const BudgetRefusalSchema = z.object({ error: z.string(), code: z.literal(BUDGET_SPENT) });
