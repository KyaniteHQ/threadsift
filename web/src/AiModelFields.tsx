import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type {
  ModelOption,
  ModelUnlistedReason,
} from "../../src/core/contract/ai-settings-contract.ts";
import { isCliProvider } from "../../src/core/contract/provider-families.ts";
import { AI_TEXT } from "./ai-text.ts";
import { AiSelect, joined } from "./AiSelect.tsx";
import { FormField } from "./FormField.tsx";
import { MODEL_FILTER_OVER, ModelFilter, modelsMatching } from "./ModelFilter.tsx";
import { ANOTHER_MODEL, type useAiFields } from "./use-ai-fields.ts";
import type { ModelListState } from "./use-model-list.ts";

type Fields = ReturnType<typeof useAiFields>;

type TextKind = Parameters<typeof FormField>[0]["kind"];

const UNLISTED_TEXT = {
  "key-needed": AI_TEXT.modelsKeyNeeded,
  "wrong-key": AI_TEXT.modelsWrongKey,
  unreachable: AI_TEXT.modelsUnreachable,
  "no-list": AI_TEXT.modelsNoList,
  refused: AI_TEXT.modelsRefused,
} as const satisfies Record<ModelUnlistedReason, string>;

function listedOf(list: ModelListState): readonly ModelOption[] | null {
  return list.answer?.kind === "listed" ? list.answer.models : null;
}

function statusOf(list: ModelListState): string | undefined {
  const { answer } = list;

  if (list.loading) return AI_TEXT.modelsLoading;

  if (answer === undefined || answer.kind === "listed") return undefined;

  return answer.kind === "failed" ? AI_TEXT.modelsFailed : UNLISTED_TEXT[answer.reason];
}

function isTyped(fields: Fields, options: readonly ModelOption[]): boolean {
  const { value } = fields.model;

  return fields.modelTyped || !(value === "" || options.some(({ id }) => id === value));
}

interface PickerProps {
  readonly fields: Fields;
  readonly list: ModelListState;
  readonly kind: TextKind;
  readonly marked: boolean;
  readonly disabled: boolean;
  readonly help: string | undefined;
}

const MODEL_CONTROLS: ReadonlySet<string | null> = new Set(["model", "modelChoice"]);

function useFocusAcrossSwap(mode: string, controls: () => readonly (HTMLElement | null)[]) {
  const lastFocused = useRef<string | null>(null);
  const shownMode = useRef(mode);

  useEffect(() => {
    const focused = () => {
      lastFocused.current = document.activeElement?.getAttribute("name") ?? null;
    };
    const leaving = ({ relatedTarget }: Readonly<{ relatedTarget: unknown }>) => {
      if (relatedTarget instanceof Element)
        lastFocused.current = relatedTarget.getAttribute("name");
    };

    document.addEventListener("focusin", focused, true);
    document.addEventListener("focusout", leaving, true);

    return () => {
      document.removeEventListener("focusin", focused, true);
      document.removeEventListener("focusout", leaving, true);
    };
  }, []);

  useLayoutEffect(() => {
    const swapped = shownMode.current !== mode;

    shownMode.current = mode;

    if (!swapped || document.activeElement !== document.body) return;

    if (!MODEL_CONTROLS.has(lastFocused.current)) return;

    const shown = controls().filter((control) => control !== null);
    const same = shown.find((control) => control.getAttribute("name") === lastFocused.current);

    (same ?? shown[0])?.focus();
  }, [mode, controls]);
}

function modelModeOf(options: readonly ModelOption[] | null, typed: boolean) {
  if (options === null) return "text";

  return typed ? "other" : "list";
}

function useModelQuery(provider: Fields["provider"]) {
  const [filter, setFilter] = useState({ provider, query: "" });

  const change = useCallback(
    (query: string) => {
      setFilter({ provider, query });
    },
    [provider],
  );

  return [filter.provider === provider ? filter.query : "", change] as const;
}

export function ModelPicker({ fields, list, kind, marked, disabled, help }: PickerProps) {
  const options = listedOf(list);
  const shownHelp = joined(help, statusOf(list));
  const field = fields.model;
  const select = useRef<HTMLSelectElement>(null);
  const typed = options !== null && isTyped(fields, options);
  const { ref: input } = field;
  const controls = useCallback(() => [select.current, input.current], [input]);

  const [query, changeQuery] = useModelQuery(fields.provider);

  useFocusAcrossSwap(modelModeOf(options, typed), controls);

  if (options === null)
    return (
      <FormField field={field} label={AI_TEXT.model} kind={kind} marked={marked} help={shownHelp} />
    );

  const filtered = options.length > MODEL_FILTER_OVER;
  const matching = filtered ? modelsMatching(options, query) : options;

  return (
    <>
      {filtered ? (
        <ModelFilter query={query} matches={matching.length} change={changeQuery} />
      ) : null}
      <ModelSelect
        fields={fields}
        options={withChosen(matching, options, field.value)}
        typed={typed}
        select={select}
        help={shownHelp}
        disabled={disabled}
        required={kind.required === true}
        marked={marked}
      />
      {typed ? (
        <FormField field={field} label={AI_TEXT.otherModelLabel} kind={kind} marked={marked} />
      ) : null}
    </>
  );
}

function withChosen(
  matching: readonly ModelOption[],
  options: readonly ModelOption[],
  chosen: string,
): readonly ModelOption[] {
  if (matching.some(({ id }) => id === chosen)) return matching;

  const kept = options.find(({ id }) => id === chosen);

  return kept === undefined ? matching : [kept, ...matching];
}

function ModelSelect({
  fields,
  options,
  typed,
  select,
  help,
  disabled,
  required,
  marked,
}: Readonly<{
  fields: Fields;
  options: readonly ModelOption[];
  typed: boolean;
  select: RefObject<HTMLSelectElement | null>;
  help: string | undefined;
  disabled: boolean;
  required: boolean;
  marked: boolean;
}>) {
  return (
    <AiSelect
      selectRef={select}
      name={typed ? "modelChoice" : "model"}
      label={AI_TEXT.model}
      value={typed ? ANOTHER_MODEL : fields.model.value}
      help={help}
      disabled={disabled}
      error={typed ? null : fields.model.error}
      required={required}
      marked={marked}
      change={fields.changeModel}
    >
      {isCliProvider(fields.provider) ? (
        <option value="">{AI_TEXT.defaultModel}</option>
      ) : (
        <option value="" disabled>
          {AI_TEXT.chooseModel}
        </option>
      )}
      {options.map(({ id, label }) => (
        <option key={id} value={id}>
          {label ?? id}
        </option>
      ))}
      <option value={ANOTHER_MODEL}>{AI_TEXT.otherModel}</option>
    </AiSelect>
  );
}

function chosenModel(fields: Fields, options: readonly ModelOption[]): ModelOption | undefined {
  if (isTyped(fields, options)) return undefined;

  const { value } = fields.model;

  if (value !== "") return options.find(({ id }) => id === value);

  return options.find(({ id }) => id === fields.recommendation?.model) ?? options[0];
}

export function EffortPicker({ fields, list, kind, marked, disabled, help }: PickerProps) {
  const options = listedOf(list);
  const levels = options === null ? undefined : chosenModel(fields, options)?.efforts;
  const { value } = fields.effort;

  if (levels === undefined)
    return (
      <FormField
        field={fields.effort}
        label={AI_TEXT.effort}
        kind={kind}
        marked={marked}
        help={help}
      />
    );

  const shown = value === "" || levels.includes(value) ? levels : [...levels, value];

  return (
    <AiSelect
      name="effort"
      label={AI_TEXT.effort}
      value={value}
      help={help}
      disabled={disabled}
      change={fields.changeEffort}
    >
      <option value="">{AI_TEXT.defaultEffort}</option>
      {shown.map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </AiSelect>
  );
}
