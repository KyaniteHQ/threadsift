import { useCallback, useState, type ChangeEvent } from "react";

import type { AiRefused } from "../../src/core/ai-contract.ts";
import { AiSettingsInputSchema } from "../../src/core/ai-settings-contract.ts";
import {
  GROK_BOT_PROVIDER,
  PROVIDERS,
  ProviderSchema,
  CliChoiceSchema,
  type CliChoice,
  type Provider,
  isCliProvider,
  withoutTrailingSlashes,
} from "../../src/core/provider-families.ts";
import { type AiView, saveAiSettings, verifyAi } from "./ai-api.ts";
import { AI_TEXT, CLI_TEXT, signedOutSentence } from "./ai-text.ts";
import { type AiPhase, type Outcome, useAiPhase } from "./use-ai-phase.ts";
import { useConnect } from "./use-connect.ts";
import { useField } from "./use-form.ts";

function useCliChoice(
  savedChoice: CliChoice | undefined,
  provider: Provider,
  recommendations: Readonly<AiView["recommendations"]>,
) {
  const [choice, setChoice] = useState(savedChoice);
  const recommendation = isCliProvider(provider) ? recommendations[provider] : undefined;
  const preference = choice ?? (recommendation === undefined ? "cli-defaults" : "recommended");
  const fallsBack = preference === "recommended" && recommendation === undefined;
  const cliChoice = fallsBack ? "cli-defaults" : preference;

  const changeCliChoice = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setChoice(CliChoiceSchema.parse(event.target.value));
  }, []);

  return { preference, cliChoice, fallsBack, recommendation, setChoice, changeCliChoice } as const;
}

function useAiFields(view: AiView) {
  const { settings, providers, recommendations } = view;
  const offered = settings !== null && providers.includes(settings.provider) ? settings : null;

  const [provider, setProvider] = useState<Provider>(
    offered?.provider ?? providers[0] ?? PROVIDERS["openai-compatible"].id,
  );

  const baseUrl = useField(null, offered?.provider === "openai-compatible" ? offered.baseUrl : "");
  const model = useField(null, offered?.model ?? "");
  const savedEffort = offered && "effort" in offered ? offered.effort : "";
  const savedChoice = offered && "choice" in offered ? offered.choice : undefined;
  const { setChoice, ...cli } = useCliChoice(savedChoice, provider, recommendations);
  const effort = useField(null, savedEffort);
  const { set: setEffort } = effort;
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
      setEffort(next === savedProvider ? savedEffort : "");
      setChoice(next === savedProvider ? savedChoice : undefined);
      clearKey();
    },
    [clearKey, setModel, savedProvider, savedModel, setEffort, savedEffort, savedChoice, setChoice],
  );

  return {
    provider,
    providers,
    ...cli,
    baseUrl,
    model,
    effort,
    key,
    changeProvider,
  } as const;
}

function refusalText(refusal: AiRefused, provider: Provider): string {
  if (refusal.reason === "invalid-effort")
    return refusal.levels !== undefined && refusal.levels.length > 0
      ? AI_TEXT.invalidEffort.replace("{levels}", refusal.levels.join(", "))
      : AI_TEXT.noEfforts;

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
  const { kind } = PROVIDERS[provider];

  return kind === "http" || kind === "bot";
}

function holdsUnreadableKey({ secretReady, settings }: Readonly<AiView>): boolean {
  return secretReady && settings !== null && "keyReadable" in settings && !settings.keyReadable;
}

export function isSignedOut(view: AiView, provider: Provider): boolean {
  return isCliProvider(provider) && !view.signedIn.includes(provider);
}

function signedOutText(view: Readonly<AiView>, provider: Provider): string | null {
  return isCliProvider(provider) && isSignedOut(view, provider)
    ? signedOutSentence(provider)
    : null;
}

function saveUnavailable(view: Readonly<AiView>, provider: Provider): string | null {
  if (needsSecret(provider) && !view.secretReady) return AI_TEXT["secret-missing"];

  return signedOutText(view, provider);
}

function verifyUnavailable(view: Readonly<AiView>): string | null {
  const { settings } = view;

  if (settings === null) return AI_TEXT["not-configured"];

  if (holdsUnreadableKey(view)) return AI_TEXT.keyUnreadable;

  return saveUnavailable(view, settings.provider);
}

function useVerify(view: AiView, { run, refuse }: Readonly<Pick<AiPhase, "run" | "refuse">>) {
  const unavailable = verifyUnavailable(view);
  const provider = view.settings?.provider;

  const verifyNow = useCallback(() => {
    if (unavailable !== null) {
      refuse(unavailable);

      return;
    }

    if (provider === undefined) return;

    run(provider === GROK_BOT_PROVIDER ? "waiting" : "verifying", async (): Promise<Outcome> => {
      const response = await verifyAi();

      return response.kind === "done"
        ? { kind: "ok", text: AI_TEXT.verified, digest: response.digest }
        : { kind: "error", text: refusalText(response, provider) };
    });
  }, [unavailable, provider, run, refuse]);

  return {
    verifyNow,
    verifyBlocked: unavailable !== null,
    verifyHint: view.settings === null ? (unavailable ?? undefined) : undefined,
  };
}

export type SavedKey = "applies" | "changed" | "unreadable" | "none";

function savedKeyOf(
  view: Readonly<AiView>,
  form: Readonly<{ provider: Provider; baseUrl: string; model: string }>,
): SavedKey {
  const { settings } = view;

  if (settings === null || !("keySet" in settings) || !settings.keySet) return "none";

  if (holdsUnreadableKey(view)) return "unreadable";

  const family = PROVIDERS[form.provider];
  const url = "baseUrl" in family.fields ? withoutTrailingSlashes(form.baseUrl) : family.url;

  const same =
    settings.provider === form.provider &&
    settings.baseUrl === url &&
    settings.model === form.model.trim();

  return same ? "applies" : "changed";
}

function settingsInput(fields: ReturnType<typeof useAiFields>) {
  const { provider, preference: choice } = fields;
  if (isCliProvider(provider)) {
    const values =
      choice === "custom" ? { model: fields.model.value, effort: fields.effort.value } : {};
    return AiSettingsInputSchema.parse({ provider, choice, ...values });
  }

  const entries = PROVIDERS[provider].names.map((name) => {
    const value = fields[name].value;
    return [name, name === "key" && value === "" ? undefined : value];
  });
  return AiSettingsInputSchema.parse({ provider, ...Object.fromEntries(entries) });
}

export function missingCustomOverrides(fields: Readonly<ReturnType<typeof useAiFields>>): boolean {
  return (
    isCliProvider(fields.provider) &&
    fields.preference === "custom" &&
    fields.model.value.trim() === "" &&
    fields.effort.value.trim() === ""
  );
}

function useSave(
  view: AiView,
  fields: ReturnType<typeof useAiFields>,
  { run, refuse }: Readonly<Pick<AiPhase, "run" | "refuse">>,
  saved: (view: AiView) => void,
) {
  const {
    provider,
    key: { clear: clearKey },
  } = fields;
  const unavailable = saveUnavailable(view, provider);

  const submit = useCallback(() => {
    if (unavailable !== null) {
      refuse(unavailable);

      return;
    }

    if (missingCustomOverrides(fields)) {
      fields.model.fail(AI_TEXT.customMissing);
      return;
    }

    run("saving", async (): Promise<Outcome> => {
      const response = await saveAiSettings(settingsInput(fields));

      if ("kind" in response) return { kind: "error", text: failureText(response, provider) };

      saved(response);
      clearKey();

      return { kind: "ok", text: AI_TEXT.saved };
    });
  }, [unavailable, refuse, run, fields, provider, clearKey, saved]);

  return { submit, saveBlocked: unavailable !== null };
}

export function useAiForm(view: AiView, saved: (value: AiView) => void) {
  const fields = useAiFields(view);
  const { provider, baseUrl, model } = fields;
  const flow = useAiPhase();

  const { verifyNow, verifyBlocked, verifyHint } = useVerify(view, flow);
  const { submit, saveBlocked } = useSave(view, fields, flow, saved);
  const connection = useConnect(view, fields, flow);
  const savedKey = savedKeyOf(view, { provider, baseUrl: baseUrl.value, model: model.value });

  return {
    fields,
    phase: flow.phase,
    outcome: flow.outcome,
    notice: flow.notice,
    savedKey,
    submit,
    verifyNow,
    saveBlocked,
    verifyBlocked,
    verifyHint,
    connection,
  };
}
