import { useId } from "react";

import { AI_TEXT } from "./ai-text.ts";
import { FormField } from "./FormField.tsx";
import type { useAiForm } from "./use-ai-form.ts";

type Fields = ReturnType<typeof useAiForm>["fields"];

const URL_KIND = {
  name: "baseUrl",
  type: "url",
  autoComplete: "off",
  required: true,
  maxLength: 2048,
} as const;

const MODEL_KIND = {
  name: "model",
  type: "text",
  autoComplete: "off",
  required: true,
  maxLength: 240,
} as const;

const KEY_KIND = {
  name: "key",
  type: "password",
  autoComplete: "new-password",
  maxLength: 4096,
} as const;

export function AiFields({ fields, disabled }: Readonly<{ fields: Fields; disabled: boolean }>) {
  const id = useId();

  return (
    <>
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
          <option value="openai-compatible">{AI_TEXT.compatible}</option>
          <option value="openrouter">{AI_TEXT.openrouter}</option>
        </select>
      </div>
      {fields.provider === "openrouter" ? null : (
        <FormField field={fields.baseUrl} label={AI_TEXT.baseUrl} kind={URL_KIND} />
      )}
      <FormField field={fields.model} label={AI_TEXT.model} kind={MODEL_KIND} />
      <FormField field={fields.key} label={AI_TEXT.key} kind={KEY_KIND} help={AI_TEXT.keyHelp} />
    </>
  );
}
