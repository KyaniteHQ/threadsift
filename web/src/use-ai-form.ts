import { useCallback, useState, type ChangeEvent } from "react";

import {
  PROVIDERS,
  ProviderSchema,
  AiSettingsInputSchema,
  type Digest,
  type AiRefused,
  type Provider,
  isCliProvider,
} from "../../src/core/ai-contract.ts";
import { type AiView, saveAiSettings, verifyAi } from "./ai-api.ts";
import { AI_TEXT, CLI_TEXT } from "./ai-text.ts";
import { useConnect } from "./use-connect.ts";
import { useField, useGuard } from "./use-form.ts";

function useAiFields(view: AiView) {
  const { settings, providers } = view;
  const offered = settings !== null && providers.includes(settings.provider) ? settings : null;

  const [provider, setProvider] = useState<Provider>(
    offered?.provider ?? providers[0] ?? PROVIDERS["openai-compatible"].id,
  );

  const baseUrl = useField(null, offered?.provider === "openai-compatible" ? offered.baseUrl : "");
  const model = useField(null, offered?.model ?? "");
  const key = useField();
  const { clear: clearKey } = key;

  const { set: setModel } = model;
  const savedProvider = offered?.provider;
  const savedModel = offered?.model ?? "";

  const changeProvider = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const next = ProviderSchema.parse(event.target.value);
      setProvider(next);
      setModel(next === savedProvider ? savedModel : "");
      clearKey();
    },
    [clearKey, setModel, savedProvider, savedModel],
  );

  return { provider, baseUrl, model, key, changeProvider } as const;
}

type Result =
  | null
  | { readonly kind: "ok"; readonly text: string; readonly digest?: Digest }
  | { readonly kind: "error"; readonly text: string };

function refusalText(refusal: AiRefused, provider: Provider): string {
  if (isCliProvider(provider) && refusal.reason === "wrong-key") return CLI_TEXT[provider].rejected;

  return refusal.reason === "provider-busy" && refusal.status !== null
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

function needsSecret(provider: Provider): boolean {
  return provider !== "workers-ai" && !isCliProvider(provider);
}

export function isSignedOut(view: AiView, provider: Provider): boolean {
  return isCliProvider(provider) && !view.signedIn.includes(provider);
}

function useVerify(
  view: AiView,
  run: ReturnType<typeof useAiResult>["run"],
  guard: ReturnType<typeof useGuard>["guard"],
) {
  const verifyBlocked =
    view.settings === null ||
    (needsSecret(view.settings.provider) && !view.secretReady) ||
    isSignedOut(view, view.settings.provider);

  const provider = view.settings?.provider;

  const verifyNow = useCallback(() => {
    if (verifyBlocked || provider === undefined) return;

    guard(() =>
      run("verify", async () => {
        const response = await verifyAi();

        return response.kind === "done"
          ? { kind: "ok", text: AI_TEXT.verified, digest: response.digest }
          : { kind: "error", text: refusalText(response, provider) };
      }),
    );
  }, [verifyBlocked, provider, guard, run]);

  return { verifyNow, verifyBlocked };
}

export function useAiForm(view: AiView, saved: (value: AiView) => void) {
  const fields = useAiFields(view);
  const { provider, baseUrl, model, key } = fields;
  const { value: keyValue, clear: clearKey } = key;
  const { action, result, run } = useAiResult();
  const { busy, guard } = useGuard();
  const saveBlocked = (needsSecret(provider) && !view.secretReady) || isSignedOut(view, provider);

  const { verifyNow, verifyBlocked } = useVerify(view, run, guard);
  const connection = useConnect(view, fields, busy, saved);

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

        if ("kind" in response) return { kind: "error", text: refusalText(response, provider) };
        saved(response);
        clearKey();

        return { kind: "ok", text: AI_TEXT.saved };
      }),
    [provider, baseUrl.value, model.value, keyValue, clearKey, saved, run],
  );

  const submit = useCallback(() => {
    if (!saveBlocked) guard(save);
  }, [guard, save, saveBlocked]);

  return {
    fields,
    result,
    busy,
    action,
    submit,
    verifyNow,
    saveBlocked,
    verifyBlocked,
    connection,
  };
}
