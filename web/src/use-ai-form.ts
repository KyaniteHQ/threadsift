import { useCallback } from "react";

import type { AiRefused } from "../../src/core/contract/ai-contract.ts";
import { AiSettingsInputSchema } from "../../src/core/contract/ai-settings-contract.ts";
import {
  GROK_BOT_PROVIDER,
  PROVIDERS,
  type Provider,
  isCliProvider,
  isKeyless,
  keyApplies,
} from "../../src/core/contract/provider-families.ts";
import { type AiView, saveAiSettings, verifyAi } from "./ai-api.ts";
import { AI_TEXT, CLI_TEXT, rejectedSentence, signedOutSentence } from "./ai-text.ts";
import { filled } from "./filled.ts";
import { FIELD_TEXT } from "./text.ts";
import { useAiFields } from "./use-ai-fields.ts";
import { type AiPhase, type Outcome, useAiPhase } from "./use-ai-phase.ts";
import { useConnect } from "./use-connect.ts";

function refusalText(refusal: AiRefused, provider: Provider, publicOnly: boolean): string {
  if (refusal.reason === "invalid-effort")
    return refusal.levels !== undefined && refusal.levels.length > 0
      ? filled(AI_TEXT.invalidEffort, { levels: refusal.levels.join(", ") })
      : AI_TEXT.noEfforts;

  if (isCliProvider(provider) && refusal.reason === "wrong-key") return rejectedSentence(provider);

  if (provider === GROK_BOT_PROVIDER && refusal.reason === "timeout") return AI_TEXT.botTimeout;

  if (provider === GROK_BOT_PROVIDER && refusal.reason === "provider-busy") return AI_TEXT.botBusy;

  if (provider === GROK_BOT_PROVIDER && refusal.reason === "wrong-key") return AI_TEXT.botWrongKey;

  if (provider === GROK_BOT_PROVIDER && refusal.reason === "unreachable")
    return AI_TEXT.botUnreachable;

  if (provider === GROK_BOT_PROVIDER && refusal.reason === "refused") return AI_TEXT.botRefused;

  if (refusal.reason === "cli-not-started")
    return isCliProvider(provider)
      ? CLI_TEXT[provider].notStarted
      : AI_TEXT["provider-unavailable"];

  if (isCliProvider(provider) && refusal.reason === "not-configured")
    return signedOutSentence(provider);

  if (provider === GROK_BOT_PROVIDER && refusal.reason === "not-configured")
    return AI_TEXT.grokBotFirst;

  if (publicOnly && refusal.reason === "refused") return AI_TEXT.refusedPublic;

  return AI_TEXT[refusal.reason];
}

function failureText(
  response: Extract<Awaited<ReturnType<typeof saveAiSettings>>, { readonly kind: string }>,
  provider: Provider,
  publicOnly: boolean,
): string {
  switch (response.kind) {
    case "refused":
      return refusalText(response, provider, publicOnly);
    case "restoring":
      return AI_TEXT.saveRestoring;
    case "grok-bot-unready":
      return response.code === "secret-missing" ? AI_TEXT["secret-missing"] : AI_TEXT.grokBotFirst;
    default: {
      const exhaustive: never = response;

      return exhaustive;
    }
  }
}

function verifyOutcome(
  response: Awaited<ReturnType<typeof verifyAi>>,
  provider: Provider,
  publicOnly: boolean,
): Outcome {
  switch (response.kind) {
    case "done":
      return { kind: "ok", text: AI_TEXT.verified, digest: response.digest };
    case "refused":
      return { kind: "error", text: refusalText(response, provider, publicOnly) };
    case "restoring":
      return { kind: "error", text: AI_TEXT.verifyRestoring };
    default: {
      const exhaustive: never = response;

      return exhaustive;
    }
  }
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
  if (!isKeyless(provider) && !view.secretReady) return AI_TEXT["secret-missing"];

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

    run(provider === GROK_BOT_PROVIDER ? "waiting" : "verifying", async () =>
      verifyOutcome(await verifyAi(), provider, view.publicOnly),
    );
  }, [unavailable, provider, view.publicOnly, run, refuse]);

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
  const baseUrl = "baseUrl" in family.fields ? form.baseUrl : family.url;

  return keyApplies(settings, { provider: form.provider, baseUrl, model: form.model })
    ? "applies"
    : "changed";
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

function missingCustomOverrides(fields: Readonly<ReturnType<typeof useAiFields>>): boolean {
  return (
    isCliProvider(fields.provider) &&
    fields.preference === "custom" &&
    fields.model.value.trim() === "" &&
    fields.effort.value.trim() === ""
  );
}

function blankModel(fields: Readonly<ReturnType<typeof useAiFields>>): boolean {
  return (
    !isCliProvider(fields.provider) &&
    "model" in PROVIDERS[fields.provider].fields &&
    fields.model.value.trim() === ""
  );
}

function modelRefusal(fields: Readonly<ReturnType<typeof useAiFields>>): string | null {
  if (missingCustomOverrides(fields)) return AI_TEXT.customMissing;

  return blankModel(fields) ? FIELD_TEXT.required : null;
}

function useSave(
  view: AiView,
  fields: ReturnType<typeof useAiFields>,
  { run, refuse, clear }: Readonly<Pick<AiPhase, "run" | "refuse" | "clear">>,
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

    const refusal = modelRefusal(fields);

    if (refusal !== null) {
      clear();
      fields.model.fail(refusal);

      return;
    }

    run("saving", async (): Promise<Outcome> => {
      const response = await saveAiSettings(settingsInput(fields));

      if ("kind" in response)
        return { kind: "error", text: failureText(response, provider, view.publicOnly) };

      saved(response);
      clearKey();

      return { kind: "ok", text: AI_TEXT.saved };
    });
  }, [unavailable, refuse, clear, run, fields, provider, view.publicOnly, clearKey, saved]);

  return { submit, saveBlocked: unavailable !== null };
}

export function useAiForm(view: AiView, saved: (value: AiView) => void) {
  const flow = useAiPhase();
  const fields = useAiFields(view, flow.stayOnPage);
  const { provider, baseUrl, model } = fields;

  const { verifyNow, verifyBlocked, verifyHint } = useVerify(view, flow);
  const { submit, saveBlocked } = useSave(view, fields, flow, saved);
  const connect = useConnect(view, fields, flow);
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
    connect,
  };
}
