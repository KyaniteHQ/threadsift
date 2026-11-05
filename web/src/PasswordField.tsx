import { useCallback, useState } from "react";

import { FIELDS } from "./access-text.ts";
import { FormField } from "./FormField.tsx";
import { Icon } from "./Icon.tsx";
import type { FieldState } from "./use-form.ts";

export function usePasswordVisibility() {
  const [shown, setShown] = useState(false);

  const toggle = useCallback(() => {
    setShown((current) => !current);
  }, []);

  const hide = useCallback(() => {
    setShown(false);
  }, []);

  return { shown, toggle, hide };
}

export function UsernameHint() {
  return (
    <input
      type="text"
      className="vh"
      name="username"
      autoComplete="username"
      tabIndex={-1}
      aria-hidden="true"
      value="owner"
      readOnly
    />
  );
}

function passwordInput(name: string, autoComplete: string, shown: boolean) {
  return {
    name,
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
  name,
  autoComplete,
  help,
  shown,
  toggle,
}: Readonly<{
  field: FieldState;
  label: string;
  name: string;
  autoComplete: "new-password" | "current-password";
  help?: string | undefined;
  shown: boolean;
  toggle?: (() => void) | undefined;
}>) {
  return (
    <FormField
      field={field}
      label={label}
      kind={passwordInput(name, autoComplete, shown)}
      help={help}
    >
      {toggle === undefined ? null : <ShowToggle shown={shown} toggle={toggle} />}
    </FormField>
  );
}
