import { useCallback, useId } from "react";

import type { Token } from "../../src/http/schemas.ts";
import { SETTINGS } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { BudgetField, useBudgetField } from "./BudgetField.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { SAVING_LABEL, filled } from "./text.ts";
import { useEscape, useFocusOnMount, useSubmit } from "./use-form.ts";

function limitText(budget: Token["budget"]): string {
  return budget.kind === "unlimited" ? "" : String(budget.limit);
}

export function BudgetEdit({
  token,
  saving,
  failed,
  save,
  cancel,
}: Readonly<{
  token: Token;
  saving: boolean;
  failed: boolean;
  save: (dailyBudget: number | null) => void;
  cancel: () => void;
}>) {
  const { field, read } = useBudgetField(limitText(token.budget));
  const questionId = useId();
  useFocusOnMount(field.ref);
  useEscape(cancel);

  const run = useCallback(() => {
    const limit = read();

    if (limit !== undefined) save(limit.dailyBudget);

    return Promise.resolve();
  }, [read, save]);

  const { onSubmit } = useSubmit(run);

  return (
    <form noValidate onSubmit={onSubmit}>
      <fieldset className="tok-ask" aria-labelledby={questionId}>
        <p id={questionId}>{filled(SETTINGS.budgetChangeNamed, { name: token.name })}</p>
        <BudgetField field={field} />
        <SwapButton label={SETTINGS.budgetSave} busyLabel={SAVING_LABEL} busy={saving} />
        <button type="button" className="btn" onClick={cancel}>
          {SETTINGS.cancel}
        </button>
        <Alert text={failed ? SETTINGS.budgetSaveFailed : null} />
      </fieldset>
    </form>
  );
}
