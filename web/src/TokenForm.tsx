import { useCallback, useState } from "react";

import { DEFAULT_SCOPES, SCOPES, type Scope } from "../../src/core/kinds.ts";
import { TOKEN_NAME_MAX, type Token } from "../../src/http/schemas.ts";
import { createToken } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
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

export function TokenForm({
  name,
  created,
}: Readonly<{ name: FieldState; created: (token: Token, value: string) => void }>) {
  const { value, fail, clear } = name;
  const scopes = useScopes();
  const { selected, refuse, reset } = scopes;

  const run = useCallback(async () => {
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

    try {
      const result = await createToken(trimmed, selected);
      clear();
      reset();
      created(result.token, result.value);
    } catch {
      fail(SETTINGS.tokenCreateFailed);
    }
  }, [clear, created, fail, refuse, reset, selected, value]);

  const { busy, onSubmit } = useSubmit(run);

  return (
    <form noValidate className="tok-form" onSubmit={onSubmit}>
      <FormField field={name} label={SETTINGS.tokenName} kind={NAME_INPUT} />
      <ScopePicker selected={selected} toggle={scopes.toggle} error={scopes.error} />
      <div className="tok-create">
        <SwapButton label={SETTINGS.createToken} busyLabel={SETTINGS.creatingToken} busy={busy} />
      </div>
    </form>
  );
}
