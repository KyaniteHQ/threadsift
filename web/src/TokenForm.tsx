import { useCallback, useState } from "react";

import { DEFAULT_SCOPES, SCOPES, type Scope } from "../../src/core/kinds.ts";
import { TOKEN_NAME_MAX, type Token } from "../../src/http/schemas.ts";
import { createToken } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { BudgetField, DEFAULT_BUDGET_TEXT, useBudgetField } from "./BudgetField.tsx";
import { FormField } from "./FormField.tsx";
import { ScopePicker } from "./ScopePicker.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { type FieldState, useSubmit } from "./use-form.ts";

const NAME_INPUT = {
  name: "token-name",
  type: "text",
  autoComplete: "off",
  maxLength: TOKEN_NAME_MAX,
} as const;

function useScopes() {
  const [selected, setSelected] = useState<readonly Scope[]>(DEFAULT_SCOPES);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback((scope: Scope) => {
    setError(null);
    setSelected((current) =>
      SCOPES.filter((each) => (each === scope ? !current.includes(each) : current.includes(each))),
    );
  }, []);

  const reset = useCallback(() => {
    setSelected(DEFAULT_SCOPES);
  }, []);

  return { selected, error, toggle, reset, refuse: setError };
}

function useCreate(
  name: FieldState,
  scopes: Readonly<ReturnType<typeof useScopes>>,
  budget: Readonly<ReturnType<typeof useBudgetField>>,
  created: (token: Token, value: string) => void,
) {
  const { value, fail, clear } = name;
  const { selected, refuse, reset } = scopes;

  return useCallback(async () => {
    const trimmed = value.trim();

    if (trimmed === "") {
      fail(SETTINGS.tokenNameRequired);

      return;
    }

    fail(null);

    if (selected.length === 0) {
      refuse(SETTINGS.scopesRequired);

      return;
    }

    const limit = budget.read();

    if (limit === undefined) return;

    try {
      const result = await createToken(trimmed, selected, limit.dailyBudget);
      clear();
      reset();
      budget.reset();
      created(result.token, result.value);
    } catch {
      fail(SETTINGS.tokenCreateFailed);
    }
  }, [budget, clear, created, fail, refuse, reset, selected, value]);
}

export function TokenForm({
  name,
  created,
}: Readonly<{ name: FieldState; created: (token: Token, value: string) => void }>) {
  const scopes = useScopes();
  const budget = useBudgetField(DEFAULT_BUDGET_TEXT);
  const { busy, onSubmit } = useSubmit(useCreate(name, scopes, budget, created));

  return (
    <form noValidate className="tok-form" onSubmit={onSubmit}>
      <FormField field={name} label={SETTINGS.tokenName} kind={NAME_INPUT} />
      <ScopePicker selected={scopes.selected} toggle={scopes.toggle} error={scopes.error} />
      <BudgetField field={budget.field} />
      <div className="tok-create">
        <SwapButton label={SETTINGS.createToken} busyLabel={SETTINGS.creatingToken} busy={busy} />
      </div>
    </form>
  );
}
