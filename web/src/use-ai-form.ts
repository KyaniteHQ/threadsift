import { useCallback, useState, type ChangeEvent } from "react";

import {
  ProviderSchema,
  AiSettingsInputSchema,
  type Digest,
  type AiRefused,
} from "../../src/core/ai-contract.ts";
import { type AiView, saveAiSettings, verifyAi } from "./ai-api.ts";
import { AI_TEXT } from "./ai-text.ts";
import { useField, useGuard } from "./use-form.ts";

function useAiFields(view: AiView) {
  const [provider, setProvider] = useState(view.settings?.provider ?? "openai-compatible");

  const baseUrl = useField(
    null,
    view.settings?.provider === "openai-compatible" ? view.settings.baseUrl : "",
  );

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

function refusalText(refusal: AiRefused): string {
  return refusal.reason === "provider-busy"
    ? `${AI_TEXT[refusal.reason]} (${String(refusal.status)})`
    : AI_TEXT[refusal.reason];
}

function useAiResult() {
  const [action, setAction] = useState<"save" | "verify" | null>(null);
  const [result, setResult] = useState<Result>(null);

  const run = useCallback(async (next: "save" | "verify", task: () => Promise<Result>) => {
    setAction(next);
    setResult(null);

    try {
      setResult(await task());
    } catch {
      setResult({ kind: "error", text: AI_TEXT.failed });
    }
  }, []);

  return { action, result, run };
}

export function useAiForm(view: AiView, saved: (value: AiView) => void) {
  const fields = useAiFields(view);
  const { provider, baseUrl, model, key } = fields;
  const { value: keyValue, clear: clearKey } = key;
  const { action, result, run } = useAiResult();
  const { busy, guard } = useGuard(!view.secretReady);

  const save = useCallback(
    () =>
      run("save", async () => {
        const input = AiSettingsInputSchema.parse({
          provider,
          baseUrl: baseUrl.value,
          model: model.value,
          key: keyValue === "" ? undefined : keyValue,
        });

        const response = await saveAiSettings(input);

        if ("kind" in response) return { kind: "error", text: refusalText(response) };
        saved(response);
        clearKey();

        return { kind: "ok", text: AI_TEXT.saved };
      }),
    [provider, baseUrl.value, model.value, keyValue, clearKey, saved, run],
  );

  const verify = useCallback(
    () =>
      run("verify", async () => {
        const response = await verifyAi();

        return response.kind === "done"
          ? { kind: "ok", text: AI_TEXT.verified, digest: response.digest }
          : { kind: "error", text: refusalText(response) };
      }),
    [run],
  );

  return { fields, result, busy, action, guard, save, verify };
}
