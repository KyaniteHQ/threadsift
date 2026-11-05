import { useCallback, useMemo } from "react";

import { TOKEN_NAME_MAX, type Token } from "../../src/http/schemas.ts";
import { createToken } from "./access-api.ts";
import { SETTINGS, SETUP } from "./access-text.ts";
import { FormField } from "./FormField.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { type FieldState, useSubmit } from "./use-form.ts";

const NAME_INPUT = {
  name: "token-name",
  type: "text",
  autoComplete: "off",
  mono: undefined,
  placeholder: undefined,
  maxLength: TOKEN_NAME_MAX,
} as const;

export function TokenForm({
  name,
  created,
}: Readonly<{ name: FieldState; created: (token: Token, value: string) => void }>) {
  const { value, fail, clear } = name;

  const run = useCallback(async () => {
    const trimmed = value.trim();

    if (trimmed === "") {
      fail(SETTINGS.tokenNameRequired);

      return;
    }

    fail(null);

    try {
      const result = await createToken(trimmed);
      clear();
      created(result.token, result.value);
    } catch {
      fail(SETTINGS.tokenCreateFailed);
    }
  }, [clear, created, fail, value]);

  const { busy, onSubmit } = useSubmit(run);

  const create = useMemo(
    () => <SwapButton label={SETTINGS.createToken} busyLabel={SETUP.creating} busy={busy} />,
    [busy],
  );

  return (
    <form noValidate onSubmit={onSubmit}>
      <FormField field={name} label={SETTINGS.tokenName} kind={NAME_INPUT} action={create} />
    </form>
  );
}
