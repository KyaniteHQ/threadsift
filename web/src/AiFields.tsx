import { type ChangeEvent, type ReactNode, useId } from "react";

import {
  AI_URL_MAX,
  AI_MODEL_MAX,
  PROVIDERS,
  CliChoiceSchema,
  isCliProvider,
  type Provider,
} from "../../src/core/contract/provider-families.ts";
import { SECRET_INPUT_MAX } from "../../src/core/contract/secret-input.ts";
import { AI_TEXT, CLI_TEXT } from "./ai-text.ts";
import { FormField, isMixed, RequiredLegend } from "./FormField.tsx";
import { missingCustomOverrides, type SavedKey, type useAiForm } from "./use-ai-form.ts";

type Fields = ReturnType<typeof useAiForm>["fields"];

const URL_KIND = {
  name: "baseUrl",
  type: "url",
  autoComplete: "off",
  required: true,
  maxLength: AI_URL_MAX,
} as const;

const PUBLIC_URL_KIND = { ...URL_KIND, pattern: "https://.+" } as const;

const FIELD_KINDS = {
  baseUrl: URL_KIND,
  model: {
    name: "model",
    type: "text",
    autoComplete: "off",
    required: true,
    maxLength: AI_MODEL_MAX,
  },
  effort: { name: "effort", type: "text", autoComplete: "off" },
  key: { name: "key", type: "password", autoComplete: "new-password", maxLength: SECRET_INPUT_MAX },
} as const;

const OPTIONAL_MODEL_KIND = { ...FIELD_KINDS.model, required: false } as const;

const REQUIRED_KEY_KIND = { ...FIELD_KINDS.key, required: true } as const;

function AiSelect({
  name,
  label,
  value,
  children,
  help,
  disabled,
  change,
}: Readonly<{
  name: string;
  label: string;
  value: string;
  children: ReactNode;
  help?: string | undefined;
  disabled: boolean;
  change: (event: ChangeEvent<HTMLSelectElement>) => void;
}>) {
  const id = useId();
  const helpId = help === undefined ? undefined : `${id}-help`;

  return (
    <div className="fld">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {help === undefined ? null : (
        <p className="fld-help" id={helpId}>
          {help}
        </p>
      )}
      <select
        id={id}
        name={name}
        className="st-sel"
        value={value}
        aria-describedby={helpId}
        aria-disabled={disabled || undefined}
        onChange={disabled ? undefined : change}
      >
        {children}
      </select>
    </div>
  );
}

function CliChoicePicker({ fields, disabled }: Readonly<{ fields: Fields; disabled: boolean }>) {
  const { cliChoice, fallsBack, recommendation } = fields;
  const options = CliChoiceSchema.options.filter(
    (choice) => choice !== "recommended" || recommendation !== undefined,
  );
  const help = fallsBack ? AI_TEXT.recommendationFallback : AI_TEXT.cliChoices[cliChoice].help;
  return (
    <AiSelect
      name="cliChoice"
      label={AI_TEXT.cliChoice}
      value={cliChoice}
      help={
        recommendation === undefined
          ? help
          : help.replace("{model}", recommendation.model).replace("{effort}", recommendation.effort)
      }
      disabled={disabled}
      change={fields.changeCliChoice}
    >
      {options.map((choice) => (
        <option key={choice} value={choice}>
          {AI_TEXT.cliChoices[choice].label}
        </option>
      ))}
    </AiSelect>
  );
}

function modelHelp({ provider, recommendation }: Fields): string | undefined {
  if (isCliProvider(provider)) {
    const { modelHelp: fallback, catalogHelp } = CLI_TEXT[provider];
    const model =
      recommendation === undefined
        ? fallback
        : AI_TEXT.recommendedModelHelp.replace("{model}", recommendation.model);
    return catalogHelp === undefined ? model : `${model} ${catalogHelp}`;
  }

  return provider === "workers-ai" ? AI_TEXT.workersAiHelp : undefined;
}

function helpFor(
  name: keyof typeof FIELD_KINDS,
  fields: Fields,
  { publicOnly, savedKey }: Readonly<{ publicOnly: boolean; savedKey: SavedKey }>,
) {
  if (name === "effort") return AI_TEXT.effortHelp;

  if (name === "key") return savedKey === "unreadable" ? undefined : AI_TEXT.keyHelp;

  if (name === "model") return modelHelp(fields);

  return publicOnly ? AI_TEXT.publicUrlHelp : undefined;
}

function kindFor(
  name: keyof typeof FIELD_KINDS,
  provider: Provider,
  publicOnly: boolean,
  keyRequired: boolean,
) {
  if (name === "effort") return FIELD_KINDS.effort;

  if (name === "key") return keyRequired ? REQUIRED_KEY_KIND : FIELD_KINDS.key;

  if (name === "model") return isCliProvider(provider) ? OPTIONAL_MODEL_KIND : FIELD_KINDS.model;

  return publicOnly ? PUBLIC_URL_KIND : FIELD_KINDS.baseUrl;
}

function AiProviderPicker({ fields, disabled }: Readonly<{ fields: Fields; disabled: boolean }>) {
  return (
    <AiSelect
      name="provider"
      label={AI_TEXT.provider}
      value={fields.provider}
      disabled={disabled}
      change={fields.changeProvider}
    >
      {fields.providers.map((provider) => (
        <option key={provider} value={provider}>
          {AI_TEXT[PROVIDERS[provider].label]}
        </option>
      ))}
    </AiSelect>
  );
}

function fieldFor(fields: Fields, name: keyof typeof FIELD_KINDS) {
  const field = fields[name];
  return name === "model" && field.error !== null && !missingCustomOverrides(fields)
    ? { ...field, error: null }
    : field;
}

export function AiFields({
  fields,
  disabled,
  publicOnly,
  savedKey,
}: Readonly<{
  fields: Fields;
  disabled: boolean;
  publicOnly: boolean;
  savedKey: SavedKey;
}>) {
  const cli = isCliProvider(fields.provider);
  const names = cli && fields.cliChoice !== "custom" ? [] : PROVIDERS[fields.provider].names;
  const kinds = names.map((name) => ({
    name,
    kind: kindFor(name, fields.provider, publicOnly, savedKey !== "applies"),
  }));

  const marked = isMixed(kinds.map(({ kind }) => kind));

  return (
    <>
      <AiProviderPicker fields={fields} disabled={disabled} />
      {cli ? <CliChoicePicker fields={fields} disabled={disabled} /> : null}
      {marked ? <RequiredLegend /> : null}
      {kinds.map(({ name, kind }) => (
        <FormField
          key={name}
          field={fieldFor(fields, name)}
          label={AI_TEXT[name]}
          kind={kind}
          marked={marked}
          help={helpFor(name, fields, { publicOnly, savedKey })}
        />
      ))}
    </>
  );
}
