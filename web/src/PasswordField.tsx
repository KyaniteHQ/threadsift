import { useCallback, useState } from "react";

import { FIELDS } from "./access-text.ts";
import { FormField } from "./FormField.tsx";
import { Icon } from "./Icon.tsx";
import type { FieldState } from "./use-form.ts";

function passwordInput(autoComplete: string, shown: boolean) {
  return {
    name: "password",
    type: shown ? "text" : "password",
    autoComplete,
    mono: undefined,
    placeholder: undefined,
  } as const;
}

function ShowToggle({ shown, toggle }: Readonly<{ shown: boolean; toggle: () => void }>) {
  return (
    <button
      type="button"
      className="btn btn-plain btn-icon"
      aria-label={FIELDS.showPassword}
      aria-pressed={shown}
      onClick={toggle}
    >
      <Icon name={shown ? "eye-off" : "eye"} className="ic" />
    </button>
  );
}

export function PasswordField({
  field,
  label,
  autoComplete,
  help,
  withToggle,
}: Readonly<{
  field: FieldState;
  label: string;
  autoComplete: "new-password" | "current-password";
  help?: string | undefined;
  withToggle: boolean;
}>) {
  const [shown, setShown] = useState(false);

  const toggle = useCallback(() => {
    setShown((current) => !current);
  }, []);

  return (
    <FormField field={field} label={label} kind={passwordInput(autoComplete, shown)} help={help}>
      {withToggle ? <ShowToggle shown={shown} toggle={toggle} /> : null}
    </FormField>
  );
}
