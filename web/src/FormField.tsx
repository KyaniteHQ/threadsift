import {
  type ChangeEvent,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useId,
  useState,
} from "react";

import type { FieldState } from "./use-form.ts";

interface InputKind {
  readonly name: string;
  readonly type: "text" | "password" | "url";
  readonly required?: boolean;
  readonly pattern?: string | undefined;
  readonly autoComplete: string;
  readonly mono?: true;
  readonly maxLength?: number | undefined;
  readonly inputMode?: "numeric" | undefined;
  readonly placeholder?: string | undefined;
}

function describedBy(help: string | null, error: string | null): string | undefined {
  const present = [help, error].filter((id) => id !== null);

  return present.length === 0 ? undefined : present.join(" ");
}

function checkedUnder(kind: InputKind, value: string) {
  return `${kind.type} ${kind.required === true} ${kind.pattern ?? ""} ${value}`;
}

function useBrowserCheck(kind: InputKind, value: string) {
  const [rejectedUnder, setRejectedUnder] = useState<string | null>(null);

  const reject = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      setRejectedUnder(checkedUnder(kind, event.currentTarget.value));
    },
    [kind],
  );

  const sync = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      const input = event.currentTarget;

      setRejectedUnder(input.matches(":user-invalid") ? checkedUnder(kind, input.value) : null);
    },
    [kind],
  );

  return { rejected: rejectedUnder === checkedUnder(kind, value), reject, sync } as const;
}

type BrowserCheck = ReturnType<typeof useBrowserCheck>;

function Input({
  field,
  id,
  kind,
  described,
  browser,
}: Readonly<{
  field: FieldState;
  id: string;
  kind: InputKind;
  described: string | undefined;
  browser: BrowserCheck;
}>) {
  const { ref, value, error, change } = field;
  const { sync } = browser;

  const edit = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      sync(event);
      change(event);
    },
    [sync, change],
  );

  return (
    <input
      ref={ref}
      id={id}
      name={kind.name}
      type={kind.type}
      autoComplete={kind.autoComplete}
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      className={kind.mono === true ? "mono" : undefined}
      maxLength={kind.maxLength}
      inputMode={kind.inputMode}
      placeholder={kind.placeholder}
      required={kind.required}
      pattern={kind.pattern}
      value={value}
      aria-invalid={error !== null || browser.rejected}
      aria-describedby={described}
      onInvalid={browser.reject}
      onBlur={browser.sync}
      onChange={edit}
    />
  );
}

export function FormField({
  field,
  label,
  help,
  kind,
  action,
  children,
}: Readonly<{
  field: FieldState;
  label: string;
  help?: string | undefined;
  kind: InputKind;
  action?: ReactNode;
  children?: ReactNode;
}>) {
  const id = useId();
  const browser = useBrowserCheck(kind, field.value);
  const errorId = `${id}-error`;
  const failed = field.error !== null;
  const helpId = help === undefined || failed ? null : `${id}-help`;

  return (
    <div className="fld">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="field">
        <Input
          field={field}
          browser={browser}
          id={id}
          kind={kind}
          described={describedBy(helpId, failed ? errorId : null)}
        />
        {children}
      </div>
      {action === undefined ? null : <div className="fld-action">{action}</div>}
      {helpId === null ? null : (
        <p className="fld-help" id={helpId}>
          {help}
        </p>
      )}
      <p className="fld-err" id={errorId} role="alert">
        {field.error}
      </p>
    </div>
  );
}
