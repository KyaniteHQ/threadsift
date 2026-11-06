import { useCallback, useState, type ChangeEvent } from "react";

import { ProviderSchema, AiSettingsInputSchema, type Digest } from "../../src/core/ai-contract.ts";
import { type AiView, saveAiSettings, verifyAi } from "./ai-api.ts";
import { AI_TEXT } from "./ai-text.ts";
import { useField, useGuard } from "./use-form.ts";

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

type Result =
  | null
  | { readonly kind: "ok"; readonly text: string; readonly digest?: Digest }
  | { readonly kind: "error"; readonly text: string };

export function useAiForm(view: AiView, saved: (value: AiView) => void) {
  const fields = useAiFields(view);
  const { provider, baseUrl, model, key } = fields;
  const { value: keyValue, clear: clearKey } = key;
  const [result, setResult] = useState<Result>(null);
  const { busy, guard } = useGuard(!view.secretReady);

  const save = useCallback(async () => {
    setResult(null);

    try {
      const input = AiSettingsInputSchema.parse({
        provider,
        baseUrl: baseUrl.value,
        model: model.value,
        key: keyValue === "" ? undefined : keyValue,
      });

      const response = await saveAiSettings(input);

      if ("kind" in response) {
        setResult({ kind: "error", text: AI_TEXT[response.reason] });
      } else {
        saved(response);
        clearKey();
        setResult({ kind: "ok", text: AI_TEXT.saved });
      }
    } catch {
      setResult({ kind: "error", text: AI_TEXT.failed });
    }
  }, [provider, baseUrl.value, model.value, keyValue, clearKey, saved]);

  const verify = useCallback(async () => {
    setResult(null);

    try {
      const response = await verifyAi();
      setResult(
        response.kind === "done"
          ? { kind: "ok", text: AI_TEXT.verified, digest: response.digest }
          : { kind: "error", text: AI_TEXT[response.reason] },
      );
    } catch {
      setResult({ kind: "error", text: AI_TEXT.failed });
    }
  }, []);

  return { fields, result, busy, guard, save, verify };
}
