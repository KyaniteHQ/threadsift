import { useId } from "react";

import {
  AI_URL_MAX,
  AI_MODEL_MAX,
  AI_KEY_MAX,
  PROVIDERS,
  type Provider,
} from "../../src/core/ai-contract.ts";
import { AI_TEXT } from "./ai-text.ts";
import { FormField } from "./FormField.tsx";
import type { useAiForm } from "./use-ai-form.ts";

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

const REQUIRED_KEY_KIND = { ...FIELD_KINDS.key, required: true } as const;

function AiProviderPicker({
  fields,
  providers,
  disabled,
}: Readonly<{ fields: Fields; providers: readonly Provider[]; disabled: boolean }>) {
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
        {providers.map((provider) => (
          <option key={provider} value={provider}>
            {AI_TEXT[PROVIDERS[provider].label]}
          </option>
        ))}
      </select>
    </div>
  );
}

function helpFor(name: "baseUrl" | "model" | "key", provider: Provider, publicOnly: boolean) {
  if (name === "key") return AI_TEXT.keyHelp;

  if (name === "baseUrl" && publicOnly) return AI_TEXT.publicUrlHelp;

  return name === "model" && provider === "workers-ai" ? AI_TEXT.workersAiHelp : undefined;
}

export function AiFields({
  fields,
  providers,
  disabled,
  publicOnly,
  keyRequired,
}: Readonly<{
  fields: Fields;
  providers: readonly Provider[];
  disabled: boolean;
  publicOnly: boolean;
  keyRequired: boolean;
}>) {
  const names = PROVIDERS[fields.provider].names;

  return (
    <>
      <AiProviderPicker fields={fields} providers={providers} disabled={disabled} />
      {names.map((name) => (
        <FormField
          key={name}
          field={fields[name]}
          label={AI_TEXT[name]}
          kind={
            name === "key"
              ? keyRequired
                ? REQUIRED_KEY_KIND
                : FIELD_KINDS.key
              : name === "baseUrl" && publicOnly
                ? PUBLIC_URL_KIND
                : FIELD_KINDS[name]
          }
          help={helpFor(name, fields.provider, publicOnly)}
        />
      ))}
    </>
  );
}
