import { type ChangeEvent, type ReactNode, type RefObject, useEffect, useId, useRef } from "react";

import { FIELD_TEXT } from "./text.ts";

export function joined(...parts: readonly (string | undefined)[]): string | undefined {
  const present = parts.filter((part) => part !== undefined);

  return present.length === 0 ? undefined : present.join(" ");
}

function SelectFrame({
  id,
  label,
  mark,
  help,
  error,
  children,
}: Readonly<{
  id: string;
  label: string;
  mark: boolean;
  help: string | undefined;
  error: string | null;
  children: ReactNode;
}>) {
  return (
    <div className="fld">
      <label className="label" htmlFor={id}>
        {label}
        {mark ? <span aria-hidden="true">{FIELD_TEXT.mark}</span> : null}
      </label>
      {help === undefined ? null : (
        <p className="fld-help" id={`${id}-help`}>
          {help}
        </p>
      )}
      {children}
      <p className="fld-err" id={`${id}-error`} role="alert">
        {error}
      </p>
    </div>
  );
}

function useFocusOnError(
  error: string | null,
  given: RefObject<HTMLSelectElement | null> | undefined,
) {
  const own = useRef<HTMLSelectElement>(null);
  const select = given ?? own;

  useEffect(() => {
    if (error !== null) select.current?.focus();
  }, [error, select]);

  return select;
}

export function AiSelect({
  name,
  label,
  value,
  children,
  help,
  disabled,
  change,
  error = null,
  required = false,
  marked = false,
  selectRef,
}: Readonly<{
  name: string;
  label: string;
  value: string;
  children: ReactNode;
  help?: string | undefined;
  disabled: boolean;
  change: (event: ChangeEvent<HTMLSelectElement>) => void;
  error?: string | null;
  required?: boolean;
  marked?: boolean;
  selectRef?: RefObject<HTMLSelectElement | null>;
}>) {
  const id = useId();
  const select = useFocusOnError(error, selectRef);

  return (
    <SelectFrame id={id} label={label} mark={marked && required} help={help} error={error}>
      <select
        ref={select}
        id={id}
        name={name}
        className="st-sel"
        value={value}
        required={required}
        aria-invalid={error !== null}
        aria-describedby={joined(
          help === undefined ? undefined : `${id}-help`,
          error === null ? undefined : `${id}-error`,
        )}
        aria-disabled={disabled || undefined}
        onChange={disabled ? undefined : change}
      >
        {children}
      </select>
    </SelectFrame>
  );
}
