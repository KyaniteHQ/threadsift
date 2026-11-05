import { type ReactNode, useId } from "react";

import type { FieldState } from "./use-form.ts";

interface InputKind {
  readonly name: string;
  readonly type: "text" | "password";
  readonly autoComplete: string;
  readonly mono: boolean | undefined;
  readonly placeholder: string | undefined;
  readonly maxLength?: number | undefined;
}

function describedBy(help: string | null, error: string | null): string | undefined {
  const present = [help, error].filter((id) => id !== null);

  return present.length === 0 ? undefined : present.join(" ");
}

function Input({
  field,
  id,
  kind,
  described,
}: Readonly<{
  field: FieldState;
  id: string;
  kind: InputKind;
  described: string | undefined;
}>) {
  const { ref, value, error, change } = field;

  return (
    <input
      ref={ref}
      id={id}
      name={kind.name}
      type={kind.type}
      autoComplete={kind.autoComplete}
      spellCheck={false}
      autoCapitalize="off"
      className={kind.mono === true ? "mono" : undefined}
      placeholder={kind.placeholder}
      maxLength={kind.maxLength}
      value={value}
      aria-invalid={error === null ? undefined : true}
      aria-describedby={described}
      onChange={change}
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
  const errorId = field.error === null ? null : `${id}-error`;
  const helpId = help === undefined || errorId !== null ? null : `${id}-help`;

  return (
    <div className="fld">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="field">
        <Input field={field} id={id} kind={kind} described={describedBy(helpId, errorId)} />
        {children}
      </div>
      {action === undefined ? null : <div className="fld-action">{action}</div>}
      {helpId === null ? null : (
        <p className="fld-help" id={helpId}>
          {help}
        </p>
      )}
      {errorId === null ? null : (
        <p className="fld-err" id={errorId} role="alert">
          {field.error}
        </p>
      )}
    </div>
  );
}
