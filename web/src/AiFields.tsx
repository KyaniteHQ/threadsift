import { useId } from "react";

import {
  AI_URL_MAX,
  AI_MODEL_MAX,
  AI_KEY_MAX,
  PROVIDERS,
  isCliProvider,
  type Provider,
} from "../../src/core/ai-contract.ts";
import { AI_TEXT, CLI_TEXT } from "./ai-text.ts";
import { FormField, isMixed, RequiredLegend } from "./FormField.tsx";
import type { SavedKey, useAiForm } from "./use-ai-form.ts";

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
  key: { name: "key", type: "password", autoComplete: "new-password", maxLength: AI_KEY_MAX },
} as const;

const OPTIONAL_MODEL_KIND = { ...FIELD_KINDS.model, required: false } as const;

const REQUIRED_KEY_KIND = { ...FIELD_KINDS.key, required: true } as const;

function AiProviderPicker({ fields, disabled }: Readonly<{ fields: Fields; disabled: boolean }>) {
  const id = useId();

  return (
    <div className="fld">
      <label className="label" htmlFor={id}>
        {AI_TEXT.provider}
      </label>
      <select
        id={id}
        name="provider"
        className="st-sel"
        value={fields.provider}
        aria-disabled={disabled || undefined}
        onChange={disabled ? undefined : fields.changeProvider}
      >
        {fields.providers.map((provider) => (
          <option key={provider} value={provider}>
            {AI_TEXT[PROVIDERS[provider].label]}
          </option>
        ))}
      </select>
    </div>
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
  if (name === "effort") {
    const { recommendation } = fields;
    return recommendation === undefined
      ? AI_TEXT.effortHelp
      : AI_TEXT.recommendedEffortHelp.replace("{effort}", recommendation.effort);
  }

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
  const kinds = PROVIDERS[fields.provider].names.map((name) => ({
    name,
    kind: kindFor(name, fields.provider, publicOnly, savedKey !== "applies"),
  }));

  const marked = isMixed(kinds.map(({ kind }) => kind));

  return (
    <>
      <AiProviderPicker fields={fields} disabled={disabled} />
      {marked ? <RequiredLegend /> : null}
      {kinds.map(({ name, kind }) => (
        <FormField
          key={name}
          field={fields[name]}
          label={AI_TEXT[name]}
          kind={kind}
          marked={marked}
          help={helpFor(name, fields, { publicOnly, savedKey })}
        />
      ))}
    </>
  );
}
