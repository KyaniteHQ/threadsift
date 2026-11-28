import {
  type ChangeEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { FieldFeedback, joined, useRequiredCheck } from "./FormField.tsx";
import { FIELD_TEXT } from "./text.ts";

type Check = ReturnType<typeof useRequiredCheck>;

function SelectFrame({
  label,
  mark,
  help,
  error,
  check,
  children,
}: Readonly<{
  label: string;
  mark: boolean;
  help: string | undefined;
  error: string | null | undefined;
  check: Check;
  children: ReactNode;
}>) {
  const { id, errorId, needId } = check;

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
      {error === undefined ? null : (
        <FieldFeedback error={error} errorId={errorId} needId={needId} />
      )}
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

function useChecked(
  check: Check["check"],
  change: (event: ChangeEvent<HTMLSelectElement>) => void,
  disabled: boolean,
) {
  return useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      check(event);
      if (!disabled) change(event);
    },
    [check, change, disabled],
  );
}

interface SelectProps {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly children: ReactNode;
  readonly help?: string | undefined;
  readonly disabled: boolean;
  readonly change: (event: ChangeEvent<HTMLSelectElement>) => void;
  readonly error?: string | null;
  readonly required?: boolean;
  readonly marked?: boolean;
  readonly selectRef?: RefObject<HTMLSelectElement | null>;
}

export function AiSelect({
  name,
  label,
  value,
  children,
  help,
  disabled,
  change,
  error,
  required = false,
  marked = false,
  selectRef,
}: SelectProps) {
  const shown = error ?? null;
  const select = useFocusOnError(shown, selectRef);
  const check = useRequiredCheck(
    { label, error: shown, rule: `select ${String(required)}` },
    value,
  );
  const changed = useChecked(check.check, change, disabled);
  const { id } = check;

  return (
    <SelectFrame label={label} mark={marked && required} help={help} error={error} check={check}>
      <select
        ref={select}
        id={id}
        name={name}
        className="st-sel"
        value={value}
        required={required}
        aria-invalid={check.invalid || undefined}
        aria-describedby={joined(
          help === undefined ? null : `${id}-help`,
          shown === null ? null : check.errorId,
          check.needId,
        )}
        aria-disabled={disabled || undefined}
        onInvalid={check.reject}
        onBlur={check.check}
        onChange={changed}
      >
        {children}
      </select>
    </SelectFrame>
  );
}
