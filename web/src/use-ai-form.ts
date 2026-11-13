import { useCallback, useState, type ChangeEvent } from "react";

import {
  GROK_BOT_PROVIDER,
  PROVIDERS,
  ProviderSchema,
  AiSettingsInputSchema,
  type AiRefused,
  type Provider,
  isCliProvider,
  withoutTrailingSlashes,
} from "../../src/core/ai-contract.ts";
import { type AiView, saveAiSettings, verifyAi } from "./ai-api.ts";
import { AI_TEXT, CLI_TEXT } from "./ai-text.ts";
import { type AiPhase, type Outcome, useAiPhase } from "./use-ai-phase.ts";
import { useConnect } from "./use-connect.ts";
import { useField } from "./use-form.ts";

const FALLBACK_PROVIDERS: readonly Provider[] = [PROVIDERS["openai-compatible"].id];

function useAiFields(view: AiView) {
  const { settings } = view;
  const providers = view.providers.length === 0 ? FALLBACK_PROVIDERS : view.providers;
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

  return { provider, providers, baseUrl, model, key, changeProvider } as const;
}

function refusalText(refusal: AiRefused, provider: Provider): string {
  if (isCliProvider(provider) && refusal.reason === "wrong-key") return CLI_TEXT[provider].rejected;

  if (provider === GROK_BOT_PROVIDER && refusal.reason === "timeout") return AI_TEXT.botTimeout;

  if (provider === GROK_BOT_PROVIDER && refusal.reason === "provider-busy") return AI_TEXT.botBusy;

  return refusal.reason === "provider-busy" && refusal.status !== null
    ? `${AI_TEXT[refusal.reason]} (${String(refusal.status)})`
    : AI_TEXT[refusal.reason];
}

function failureText(
  response: Extract<Awaited<ReturnType<typeof saveAiSettings>>, { readonly kind: string }>,
  provider: Provider,
): string {
  if (response.kind === "refused") return refusalText(response, provider);

  return response.code === "secret-missing" ? AI_TEXT["secret-missing"] : AI_TEXT.grokBotFirst;
}

function needsSecret(provider: Provider): boolean {
  return provider !== "workers-ai" && !isCliProvider(provider);
}

function holdsUnreadableKey({ secretReady, settings }: Readonly<AiView>): boolean {
  return secretReady && settings !== null && "keyReadable" in settings && !settings.keyReadable;
}

export function isSignedOut(view: AiView, provider: Provider): boolean {
  return isCliProvider(provider) && !view.signedIn.includes(provider);
}

function useVerify(view: AiView, { run }: Readonly<Pick<AiPhase, "run">>) {
  const verifyBlocked =
    view.settings === null ||
    (needsSecret(view.settings.provider) && !view.secretReady) ||
    holdsUnreadableKey(view) ||
    isSignedOut(view, view.settings.provider);

  const provider = view.settings?.provider;

  const verifyNow = useCallback(() => {
    if (verifyBlocked || provider === undefined) return;

    run(provider === GROK_BOT_PROVIDER ? "waiting" : "verifying", async (): Promise<Outcome> => {
      const response = await verifyAi();

      return response.kind === "done"
        ? { kind: "ok", text: AI_TEXT.verified, digest: response.digest }
        : { kind: "error", text: refusalText(response, provider) };
    });
  }, [verifyBlocked, provider, run]);

  return { verifyNow, verifyBlocked };
}

export type SavedKey = "applies" | "changed" | "unreadable" | "none";

function savedKeyOf(
  view: Readonly<AiView>,
  form: Readonly<{ provider: Provider; baseUrl: string; model: string }>,
): SavedKey {
  const { settings } = view;

  if (settings === null || !("keySet" in settings) || !settings.keySet) return "none";

  if (holdsUnreadableKey(view)) return "unreadable";

  const url =
    form.provider === "openai-compatible"
      ? withoutTrailingSlashes(form.baseUrl)
      : PROVIDERS[form.provider].url;

  const same =
    settings.provider === form.provider &&
    settings.baseUrl === url &&
    settings.model === form.model.trim();

  return same ? "applies" : "changed";
}

export function useAiForm(view: AiView, saved: (value: AiView) => void) {
  const fields = useAiFields(view);
  const { provider, baseUrl, model, key } = fields;
  const { value: keyValue, clear: clearKey } = key;
  const flow = useAiPhase();
  const { phase, run } = flow;
  const saveBlocked = (needsSecret(provider) && !view.secretReady) || isSignedOut(view, provider);

  const { verifyNow, verifyBlocked } = useVerify(view, flow);
  const connection = useConnect(view, fields, flow, saved);
  const savedKey = savedKeyOf(view, { provider, baseUrl: baseUrl.value, model: model.value });

  const submit = useCallback(() => {
    if (saveBlocked) return;

    run("saving", async (): Promise<Outcome> => {
      const input = AiSettingsInputSchema.parse({
        provider,
        baseUrl: baseUrl.value,
        model: model.value,
        key: keyValue === "" ? undefined : keyValue,
      });

      const response = await saveAiSettings(input);

      if ("kind" in response) return { kind: "error", text: failureText(response, provider) };

      saved(response);
      clearKey();

      return { kind: "ok", text: AI_TEXT.saved };
    });
  }, [saveBlocked, run, provider, baseUrl.value, model.value, keyValue, clearKey, saved]);

  return {
    fields,
    phase,
    outcome: flow.outcome,
    notice: flow.notice,
    savedKey,
    submit,
    verifyNow,
    saveBlocked,
    verifyBlocked,
    connection,
  };
}
