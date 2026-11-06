import { useId } from "react";

import {
  AI_URL_MAX,
  AI_MODEL_MAX,
  AI_KEY_MAX,
  AiFieldSchema,
  PROVIDERS,
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
        disabled={disabled}
        onChange={fields.changeProvider}
      >
        {Object.values(PROVIDERS).map((provider) => (
          <option key={provider.id} value={provider.id}>
            {AI_TEXT[provider.label]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AiFields({
  fields,
  disabled,
  publicOnly,
}: Readonly<{ fields: Fields; disabled: boolean; publicOnly: boolean }>) {
  const names = Object.keys(PROVIDERS[fields.provider].fields).map((name) =>
    AiFieldSchema.parse(name),
  );

  return (
    <>
      <AiProviderPicker fields={fields} disabled={disabled} />
      {names.map((name) => (
        <FormField
          key={name}
          field={fields[name]}
          label={AI_TEXT[name]}
          kind={name === "baseUrl" && publicOnly ? PUBLIC_URL_KIND : FIELD_KINDS[name]}
          help={
            name === "key"
              ? AI_TEXT.keyHelp
              : name === "baseUrl" && publicOnly
                ? AI_TEXT.publicUrlHelp
                : undefined
          }
        />
      ))}
    </>
  );
}
