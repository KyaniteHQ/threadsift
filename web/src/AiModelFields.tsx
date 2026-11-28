import { type ChangeEvent, type RefObject, useCallback, useRef, useState } from "react";

import type {
  ModelOption,
  ModelUnlistedReason,
} from "../../src/core/contract/ai-settings-contract.ts";
import { isCliProvider } from "../../src/core/contract/provider-families.ts";
import { AI_TEXT } from "./ai-text.ts";
import { AiSelect } from "./AiSelect.tsx";
import { FormField, joined } from "./FormField.tsx";
import { MODEL_FILTER_OVER, ModelFilter, modelsMatching } from "./ModelFilter.tsx";
import { ANOTHER_MODEL, type useAiFields } from "./use-ai-fields.ts";
import { EFFORT_CONTROLS, MODEL_CONTROLS, useFocusAcrossSwap } from "./use-focus-across-swap.ts";
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

function typedModel(value: string, typed: boolean, options: readonly ModelOption[]): boolean {
  return typed || !(value === "" || options.some(({ id }) => id === value));
}

function isTyped(fields: Fields, options: readonly ModelOption[]): boolean {
  return typedModel(fields.model.value, fields.modelTyped, options);
}

function modelOf(
  value: string,
  typed: boolean,
  {
    options,
    recommended,
  }: Readonly<{ options: readonly ModelOption[]; recommended: string | undefined }>,
): ModelOption | undefined {
  if (typedModel(value, typed, options)) return undefined;

  if (value !== "") return options.find(({ id }) => id === value);

  return options.find(({ id }) => id === recommended) ?? options[0];
}

interface PickerProps {
  readonly fields: Fields;
  readonly list: ModelListState;
  readonly kind: TextKind;
  readonly marked: boolean;
  readonly disabled: boolean;
  readonly help: string | undefined;
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

  useFocusAcrossSwap(modelModeOf(options, typed), MODEL_CONTROLS, controls);

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
        change={modelChange(fields, options)}
      />
      {typed ? (
        <FormField field={field} label={AI_TEXT.otherModelLabel} kind={kind} marked={marked} />
      ) : null}
    </>
  );
}

function modelChange(fields: Fields, options: readonly ModelOption[]) {
  return (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    const chosen = modelOf(value, value === ANOTHER_MODEL, {
      options,
      recommended: fields.recommendation?.model,
    });
    const levels = chosen?.efforts;

    fields.changeModel(event);
    if (levels !== undefined && !levels.includes(fields.effort.value)) fields.effort.set("");
  };
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
  change,
}: Readonly<{
  fields: Fields;
  options: readonly ModelOption[];
  typed: boolean;
  select: RefObject<HTMLSelectElement | null>;
  help: string | undefined;
  disabled: boolean;
  required: boolean;
  marked: boolean;
  change: (event: ChangeEvent<HTMLSelectElement>) => void;
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
      change={change}
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

export function EffortPicker({ fields, list, kind, marked, disabled, help }: PickerProps) {
  const options = listedOf(list);
  const levels =
    options === null
      ? undefined
      : modelOf(fields.model.value, fields.modelTyped, {
          options,
          recommended: fields.recommendation?.model,
        })?.efforts;
  const { value } = fields.effort;
  const select = useRef<HTMLSelectElement>(null);
  const { ref: input } = fields.effort;
  const controls = useCallback(() => [select.current, input.current], [input]);

  useFocusAcrossSwap(levels === undefined ? "text" : "list", EFFORT_CONTROLS, controls);

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
      selectRef={select}
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
