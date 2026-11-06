import { useCallback, useState, type ChangeEvent } from "react";

import {
  ProviderSchema,
  type AiRefusal,
  type AiSettingsInput,
  type Digest,
} from "../../src/core/ai-contract.ts";
import { type AiView, saveAiSettings, verifyAi } from "./ai-api.ts";
import { AI_TEXT } from "./ai-text.ts";
import { useField, useSubmit } from "./use-form.ts";

function refusalText(reason: AiRefusal): string {
  return reason === "secret-missing" ? AI_TEXT.secretMissing : AI_TEXT[reason];
}

function useAiResult() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<Digest | null>(null);

  const reset = useCallback(() => {
    setMessage(null);
    setError(null);
    setDigest(null);
  }, []);

  const refuse = useCallback((reason: AiRefusal) => {
    setError(refusalText(reason));
  }, []);

  const failed = useCallback(() => {
    setError(AI_TEXT.failed);
  }, []);

  return { message, error, digest, reset, refuse, failed, setMessage, setDigest } as const;
}

function useAiFields(view: AiView) {
  const [provider, setProvider] = useState(view.settings?.provider ?? "openai-compatible");
  const baseUrl = useField(null, view.settings?.baseUrl ?? "");
  const model = useField(null, view.settings?.model ?? "");
  const key = useField();

  const changeProvider = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setProvider(ProviderSchema.parse(event.target.value));
  }, []);

  return { provider, baseUrl, model, key, changeProvider } as const;
}

function useAiSave(
  fields: ReturnType<typeof useAiFields>,
  result: ReturnType<typeof useAiResult>,
  saved: (value: AiView) => void,
  blocked: boolean,
) {
  return useSubmit(async () => {
    result.reset();

    const input: AiSettingsInput = {
      provider: fields.provider,
      baseUrl:
        fields.provider === "openrouter" ? "https://openrouter.ai/api/v1" : fields.baseUrl.value,
      model: fields.model.value,
    };

    if (fields.key.value !== "") input.key = fields.key.value;

    try {
      const response = await saveAiSettings(input);

      if ("kind" in response) {
        if (response.kind === "refused") result.refuse(response.reason);
      } else {
        saved(response);
        fields.key.clear();
        result.setMessage(AI_TEXT.saved);
      }
    } catch {
      result.failed();
    }
  }, blocked);
}

export function useAiForm(view: AiView, saved: (value: AiView) => void) {
  const fields = useAiFields(view);
  const result = useAiResult();
  const [verifying, setVerifying] = useState(false);

  const { busy, onSubmit } = useAiSave(fields, result, saved, verifying || !view.secretReady);

  const verify = useCallback(async () => {
    setVerifying(true);
    result.reset();

    try {
      const response = await verifyAi();

      if (response.kind === "done") {
        result.setDigest(response.digest);
        result.setMessage(AI_TEXT.verified);
      } else result.refuse(response.reason);
    } catch {
      result.failed();
    } finally {
      setVerifying(false);
    }
  }, [result]);

  const onVerify = useCallback(() => {
    void verify();
  }, [verify]);

  return { fields, result, busy, verifying, onSubmit, onVerify };
}
