import { useCallback } from "react";

import { DEFAULT_TOKEN_BUDGET } from "../../src/core/contract/agent-token-contract.ts";
import { SETTINGS } from "./access-text.ts";
import { FormField } from "./FormField.tsx";
import { parseBudget } from "./token-budget.ts";
import { type FieldState, useField } from "./use-form.ts";

const BUDGET_INPUT = {
  name: "token-budget",
  type: "text",
  autoComplete: "off",
  inputMode: "numeric",
} as const;

export const DEFAULT_BUDGET_TEXT = String(DEFAULT_TOKEN_BUDGET);

export function useBudgetField(initial: string) {
  const field = useField(null, initial);
  const { value, fail, set } = field;

  const read = useCallback(() => {
    const budget = parseBudget(value);

    fail(budget === undefined ? SETTINGS.budgetInvalid : null);

    return budget;
  }, [fail, value]);

  const reset = useCallback(() => {
    set(initial);
  }, [initial, set]);

  return { field, read, reset };
}

export function BudgetField({ field }: Readonly<{ field: FieldState }>) {
  return (
    <FormField
      field={field}
      label={SETTINGS.budgetLabel}
      help={SETTINGS.budgetHint}
      kind={BUDGET_INPUT}
    />
  );
}
