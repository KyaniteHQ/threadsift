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

function describedBy(...ids: readonly (string | null)[]): string | undefined {
  const present = ids.filter((id) => id !== null);

  return present.length === 0 ? undefined : present.join(" ");
}

function checkedUnder(kind: InputKind, value: string) {
  return `${kind.type} ${kind.required === true} ${kind.pattern ?? ""} ${value}`;
}

const UNCHECKED = { under: null, missing: false } as const;

function useBrowserCheck(kind: InputKind, value: string) {
  const [check, setCheck] = useState<{ under: string | null; missing: boolean }>(UNCHECKED);
  const rejected = check.under === checkedUnder(kind, value);
  const missing = rejected && check.missing;

  const reject = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      const input = event.currentTarget;

      setCheck({ under: checkedUnder(kind, input.value), missing: input.validity.valueMissing });
    },
    [kind],
  );

  const sync = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const invalid = input.matches(":user-invalid");
      const empty = invalid && input.validity.valueMissing;

      setCheck({ under: invalid ? checkedUnder(kind, input.value) : null, missing: empty });

      return empty;
    },
    [kind],
  );

  return { rejected, missing, reject, sync } as const;
}

type BrowserCheck = ReturnType<typeof useBrowserCheck>;

function Input({
  field,
  id,
  kind,
  described,
  browser,
  voice,
}: Readonly<{
  field: FieldState;
  id: string;
  kind: InputKind;
  described: string | undefined;
  browser: BrowserCheck;
  voice: ReturnType<typeof useRequiredVoice>;
}>) {
  const { ref, value, error, change } = field;
  const { edit, blur } = useFieldEvents(browser, voice, change);

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
}: Readonly<{
  field: FieldState;
  label: string;
  help?: string | undefined;
  kind: InputKind;
  children?: ReactNode;
  marked?: boolean;
}>) {
  const id = useId();
  const spoken = field.error === null ? FIELD_TEXT.spoken(label) : null;
  const browser = useBrowserCheck(kind, field.value);
  const voice = useRequiredVoice(browser.missing, spoken);
  const errorId = `${id}-error`;
  const failed = field.error !== null;
  const helpId = help === undefined ? null : `${id}-help`;
  const needId = !failed && browser.missing ? `${id}-need` : null;

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
          browser={browser}
          voice={voice}
          id={id}
          kind={kind}
          described={describedBy(helpId, failed ? errorId : null, needId)}
        />
        {children}
      </div>
      <FieldFeedback error={field.error} errorId={errorId} needId={needId} />
    </div>
  );
}

function FieldFeedback({
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
  browser: BrowserCheck,
  voice: ReturnType<typeof useRequiredVoice>,
  change: FieldState["change"],
) {
  const { sync } = browser;

  const blur = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      voice(sync(event));
    },
    [sync, voice],
  );

  const edit = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      blur(event);
      change(event);
    },
    [blur, change],
  );

  return { edit, blur } as const;
}
