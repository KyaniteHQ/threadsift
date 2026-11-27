import { useId } from "react";

import type { Digest } from "../../src/core/contract/digest-schema.ts";
import {
  type Provider,
  GROK_BOT_PROVIDER,
  PROVIDERS,
  isCliProvider,
} from "../../src/core/contract/provider-families.ts";
import type { AiView } from "./ai-api.ts";
import { AI_TEXT, CLI_TEXT, signedOutParts } from "./ai-text.ts";
import { AiFields } from "./AiFields.tsx";
import { ConnectNotes, ConnectNotice } from "./ConnectControls.tsx";
import { keyed } from "./keyed.ts";
import type { SectionSpec } from "./LoadedSection.tsx";
import { SettingsActions, SettingsForm, SettingsResult } from "./SettingsForm.tsx";
import { type SavedKey, isSignedOut, useAiForm } from "./use-ai-form.ts";
import type { ActionButton } from "./use-settings-action.ts";

type Form = Readonly<ReturnType<typeof useAiForm>>;

function DigestResult({ digest }: Readonly<{ digest: Readonly<Digest> }>) {
  return (
    <div className="ai-digest">
      <h3>{digest.title}</h3>
      <p className="ai-meta">{[digest.topic, ...digest.tags].join(" · ")}</p>
      <p>{digest.summary}</p>
      <ul>
        {keyed(digest.keyPoints).map(({ key, text }) => (
          <li key={key}>{text}</li>
        ))}
      </ul>
    </div>
  );
}

type AiAction = "save" | "verify" | "connect";

const RUNNING = {
  idle: null,
  saving: "save",
  verifying: "verify",
  waiting: "verify",
  connecting: "connect",
  leaving: "connect",
} as const satisfies Record<Form["phase"], AiAction | null>;

function aiButtons(
  view: AiView,
  form: Form,
  saveReasonId: string,
): readonly ActionButton<AiAction>[] {
  const buttons: readonly ActionButton<AiAction>[] = [
    {
      action: "save",
      label: AI_TEXT.save,
      busyLabel: AI_TEXT.saving,
      blocked: form.saveBlocked,
      reasonId: form.saveBlocked ? saveReasonId : undefined,
      secondary: false,
    },
    {
      action: "verify",
      label: AI_TEXT.verify,
      busyLabel:
        view.settings?.provider === GROK_BOT_PROVIDER ? AI_TEXT.verifyingBot : AI_TEXT.verifying,
      blocked: form.verifyBlocked,
      hint: form.verifyHint,
      onClick: form.verifyNow,
      secondary: true,
    },
  ];

  if (form.fields.provider !== "openrouter" || !view.connect) return buttons;

  return [
    ...buttons,
    {
      action: "connect",
      label: AI_TEXT.connect,
      busyLabel: AI_TEXT.connecting,
      blocked: !view.secretReady,
      onClick: form.connect,
      secondary: true,
    },
  ];
}

const KEY_STATUS = {
  applies: AI_TEXT.keySet,
  changed: AI_TEXT.keyChanged,
  unreadable: AI_TEXT.keyUnreadable,
  none: AI_TEXT.keyMissing,
} as const;

function keyStatus(provider: Provider, savedKey: SavedKey): string | null {
  const { kind } = PROVIDERS[provider];

  if (kind === "binding") return null;

  if (kind === "bot") return AI_TEXT.grokBotKey;

  if (isCliProvider(provider)) return CLI_TEXT[provider].keyNotNeeded;

  return KEY_STATUS[savedKey];
}

function AiOutcome({ outcome }: Readonly<{ outcome: Form["outcome"] }>) {
  return (
    <>
      <SettingsResult outcome={outcome} />
      {outcome?.kind === "ok" && outcome.digest !== undefined ? (
        <DigestResult digest={outcome.digest} />
      ) : null}
    </>
  );
}

function ProviderNotes({
  view,
  provider,
  savedKey,
  saveBlocked,
  saveReasonId,
}: Readonly<{
  view: AiView;
  provider: Provider;
  savedKey: SavedKey;
  saveBlocked: boolean;
  saveReasonId: string;
}>) {
  const signedOut =
    isCliProvider(provider) && isSignedOut(view, provider) ? signedOutParts(provider) : null;
  const status = keyStatus(provider, savedKey);

  return (
    <>
      {status === null ? null : <p>{status}</p>}
      {signedOut === null ? null : (
        <p id={saveReasonId} className="fld-help">
          {signedOut.before}
          <code>{signedOut.command}</code>
          {signedOut.after}
        </p>
      )}
      {saveBlocked && signedOut === null ? (
        <p id={saveReasonId} className="fld-help">
          {AI_TEXT["secret-missing"]}
        </p>
      ) : null}
      {provider === GROK_BOT_PROVIDER ? (
        <>
          <p className="fld-help">{AI_TEXT.grokBotHelp}</p>
          <p className="fld-help">
            <a className="fl-link" href="#grok-bot">
              {AI_TEXT.grokBotLink}
            </a>
          </p>
        </>
      ) : null}
      {provider === "openrouter" ? <ConnectNotes view={view} /> : null}
    </>
  );
}

function AiControls({
  view,
  form,
  saveReasonId,
}: Readonly<{ view: AiView; form: Form; saveReasonId: string }>) {
  const { fields, phase, savedKey, saveBlocked } = form;

  return (
    <>
      <AiFields
        fields={fields}
        disabled={phase !== "idle"}
        publicOnly={view.publicOnly}
        savedKey={savedKey}
      />
      <ProviderNotes
        view={view}
        provider={fields.provider}
        savedKey={savedKey}
        saveBlocked={saveBlocked}
        saveReasonId={saveReasonId}
      />
    </>
  );
}

function AiForm({ view, changed }: Readonly<{ view: AiView; changed: (value: AiView) => void }>) {
  const form = useAiForm(view, changed);
  const { phase, submit } = form;
  const saveReasonId = useId();

  return (
    <>
      <SettingsForm action="/api/settings/ai" busy={phase !== "idle"} submit={submit}>
        <AiControls view={view} form={form} saveReasonId={saveReasonId} />
        <SettingsActions running={RUNNING[phase]} buttons={aiButtons(view, form, saveReasonId)} />
      </SettingsForm>
      <ConnectNotice view={view} notice={form.notice} />
      <AiOutcome outcome={form.outcome} />
    </>
  );
}

export const AI_SECTION: SectionSpec<AiView> = {
  id: "ai",
  title: AI_TEXT.title,
  intro: AI_TEXT.intro,
  loadFailed: AI_TEXT.loadFailed,
  Form: AiForm,
};
