import {
  type ChangeEvent,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useId,
  useState,
} from "react";

import { useRequiredVoice } from "./FieldAnnouncer.tsx";
import { FIELD_TEXT } from "./text.ts";
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

export function joined(...parts: readonly (string | null | undefined)[]): string | undefined {
  const present = parts.filter((part) => part !== null && part !== undefined);

  return present.length === 0 ? undefined : present.join(" ");
}

function inputRule(kind: InputKind) {
  return `${kind.type} ${kind.required === true} ${kind.pattern ?? ""}`;
}

type Checked = HTMLInputElement | HTMLSelectElement;

const UNCHECKED = { under: null, missing: false } as const;

function useBrowserCheck(rule: string, value: string) {
  const [check, setCheck] = useState<{ under: string | null; missing: boolean }>(UNCHECKED);
  const rejected = check.under === `${rule} ${value}`;
  const missing = rejected && check.missing;

  const reject = useCallback(
    (event: SyntheticEvent<Checked>) => {
      const control = event.currentTarget;

      setCheck({ under: `${rule} ${control.value}`, missing: control.validity.valueMissing });
    },
    [rule],
  );

  const sync = useCallback(
    (event: SyntheticEvent<Checked>) => {
      const control = event.currentTarget;
      const invalid = control.matches(":user-invalid");
      const empty = invalid && control.validity.valueMissing;

      setCheck({ under: invalid ? `${rule} ${control.value}` : null, missing: empty });

      return empty;
    },
    [rule],
  );

  return { rejected, missing, reject, sync } as const;
}

export function useRequiredCheck(
  { label, error, rule }: Readonly<{ label: string; error: string | null; rule: string }>,
  value: string,
) {
  const id = useId();
  const browser = useBrowserCheck(rule, value);
  const voice = useRequiredVoice(browser.missing, error === null ? FIELD_TEXT.spoken(label) : null);
  const { sync } = browser;

  const check = useCallback(
    (event: SyntheticEvent<Checked>) => {
      voice(sync(event));
    },
    [sync, voice],
  );

  return {
    id,
    errorId: `${id}-error`,
    needId: error === null && browser.missing ? `${id}-need` : null,
    invalid: error !== null || browser.rejected,
    reject: browser.reject,
    check,
  } as const;
}

type RequiredCheck = ReturnType<typeof useRequiredCheck>;

function Input({
  field,
  kind,
  described,
  required,
  left,
}: Readonly<{
  field: FieldState;
  kind: InputKind;
  described: string | undefined;
  required: RequiredCheck;
  left: ((value: string) => void) | undefined;
}>) {
  const { ref, value, change } = field;
  const { edit, blur } = useFieldEvents(required.check, change, left);

  return (
    <input
      ref={ref}
      id={required.id}
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
      aria-invalid={required.invalid}
      aria-describedby={described}
      onInvalid={required.reject}
      onBlur={blur}
      onChange={edit}
    />
  );
}

export function FormField({
  field,
  label,
  help,
  kind,
  children,
  marked,
  left,
}: Readonly<{
  field: FieldState;
  label: string;
  help?: string | undefined;
  kind: InputKind;
  children?: ReactNode;
  marked?: boolean;
  left?: ((value: string) => void) | undefined;
}>) {
  const required = useRequiredCheck(
    { label, error: field.error, rule: inputRule(kind) },
    field.value,
  );
  const { id, errorId, needId } = required;
  const helpId = help === undefined ? null : `${id}-help`;

  return (
    <div className="fld">
      <FieldLabel id={id} label={label} marked={marked === true && kind.required === true} />
      {helpId === null ? null : (
        <p className="fld-help" id={helpId}>
          {help}
        </p>
      )}
      <div className="field">
        <Input
          field={field}
          required={required}
          kind={kind}
          described={joined(helpId, field.error === null ? null : errorId, needId)}
          left={left}
        />
        {children}
      </div>
      <FieldFeedback error={field.error} errorId={errorId} needId={needId} />
    </div>
  );
}

export function FieldFeedback({
  error,
  errorId,
  needId,
}: Readonly<{ error: string | null; errorId: string; needId: string | null }>) {
  return (
    <>
      <p className="fld-err" id={errorId} role="alert">
        {error}
      </p>
      {needId === null ? null : (
        <p className="fld-err" id={needId}>
          {FIELD_TEXT.required}
        </p>
      )}
    </>
  );
}

export function isMixed(kinds: readonly InputKind[]): boolean {
  const required = kinds.filter((kind) => kind.required === true).length;

  return required > 0 && required < kinds.length;
}

export function RequiredLegend() {
  return <p className="fld-help">{FIELD_TEXT.legend}</p>;
}

function FieldLabel({
  id,
  label,
  marked,
}: Readonly<{ id: string; label: string; marked: boolean }>) {
  return (
    <label className="label" htmlFor={id}>
      {label}
      {marked ? <span aria-hidden="true">{FIELD_TEXT.mark}</span> : null}
    </label>
  );
}

function useFieldEvents(
  check: RequiredCheck["check"],
  change: FieldState["change"],
  left: ((value: string) => void) | undefined,
) {
  const blur = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      check(event);
      left?.(event.currentTarget.value);
    },
    [check, left],
  );

  const edit = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      check(event);
      change(event);
    },
    [check, change],
  );

  return { edit, blur } as const;
}
