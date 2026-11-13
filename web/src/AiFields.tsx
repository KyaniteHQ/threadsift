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
import { FormField } from "./FormField.tsx";
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

function modelHelp(provider: Provider) {
  if (isCliProvider(provider)) return CLI_TEXT[provider].modelHelp;

  return provider === "workers-ai" ? AI_TEXT.workersAiHelp : undefined;
}

function helpFor(
  name: "baseUrl" | "model" | "key",
  provider: Provider,
  { publicOnly, savedKey }: Readonly<{ publicOnly: boolean; savedKey: SavedKey }>,
) {
  if (name === "key") return savedKey === "unreadable" ? undefined : AI_TEXT.keyHelp;

  if (name === "model") return modelHelp(provider);

  return publicOnly ? AI_TEXT.publicUrlHelp : undefined;
}

function kindFor(
  name: "baseUrl" | "model" | "key",
  provider: Provider,
  publicOnly: boolean,
  keyRequired: boolean,
) {
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
  const names = PROVIDERS[fields.provider].names;

  return (
    <>
      <AiProviderPicker fields={fields} disabled={disabled} />
      {names.map((name) => (
        <FormField
          key={name}
          field={fields[name]}
          label={AI_TEXT[name]}
          kind={kindFor(name, fields.provider, publicOnly, savedKey !== "applies")}
          help={helpFor(name, fields.provider, { publicOnly, savedKey })}
        />
      ))}
    </>
  );
}
