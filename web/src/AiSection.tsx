import {
  type Digest,
  type Provider,
  GROK_BOT_PROVIDER,
  isCliProvider,
} from "../../src/core/ai-contract.ts";
import type { AiView } from "./ai-api.ts";
import { AI_TEXT, CLI_TEXT } from "./ai-text.ts";
import { AiFields } from "./AiFields.tsx";
import { ConnectNotes, ConnectNotice } from "./ConnectControls.tsx";
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
        {digest.keyPoints.map((point) => (
          <li key={point}>{point}</li>
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

function aiButtons(view: AiView, form: Form): readonly ActionButton<AiAction>[] {
  const buttons: readonly ActionButton<AiAction>[] = [
    {
      action: "save",
      label: AI_TEXT.save,
      busyLabel: AI_TEXT.saving,
      blocked: form.saveBlocked,
      secondary: false,
    },
    {
      action: "verify",
      label: AI_TEXT.verify,
      busyLabel:
        view.settings?.provider === GROK_BOT_PROVIDER ? AI_TEXT.verifyingBot : AI_TEXT.verifying,
      blocked: form.verifyBlocked,
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
      onClick: form.connection.connect,
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

function keyStatus(provider: Provider, savedKey: SavedKey): string {
  if (provider === "workers-ai") return AI_TEXT.keyNotNeeded;

  if (provider === GROK_BOT_PROVIDER) return AI_TEXT.grokBotKey;

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
}: Readonly<{
  view: AiView;
  provider: Provider;
  savedKey: SavedKey;
  saveBlocked: boolean;
}>) {
  const signedOut = isSignedOut(view, provider);
  const cli = isCliProvider(provider) ? CLI_TEXT[provider] : null;

  return (
    <>
      <p>{keyStatus(provider, savedKey)}</p>
      {signedOut && cli !== null ? (
        <p className="fld-help">
          {cli.signedOut} <code>{cli.signInCommand}</code>.
        </p>
      ) : null}
      {saveBlocked && !signedOut ? <p className="fld-help">{AI_TEXT["secret-missing"]}</p> : null}
      {provider === GROK_BOT_PROVIDER ? (
        <>
          <p className="fld-help">{AI_TEXT.grokBotHelp}</p>
          <p className="fld-help">
            <a href="#grok-bot">{AI_TEXT.grokBotLink}</a>
          </p>
        </>
      ) : null}
      {provider === "openrouter" ? <ConnectNotes view={view} /> : null}
    </>
  );
}

function AiControls({ view, form }: Readonly<{ view: AiView; form: Form }>) {
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
      />
    </>
  );
}

function AiForm({ view, saved }: Readonly<{ view: AiView; saved: (value: AiView) => void }>) {
  const form = useAiForm(view, saved);
  const { phase, submit } = form;

  return (
    <>
      <SettingsForm action="/api/settings/ai" busy={phase !== "idle"} submit={submit}>
        <AiControls view={view} form={form} />
        <SettingsActions running={RUNNING[phase]} buttons={aiButtons(view, form)} />
      </SettingsForm>
      <ConnectNotice view={view} notice={form.notice} />
      <AiOutcome outcome={form.outcome} />
    </>
  );
}

const aiForm = (view: AiView, saved: (view: AiView) => void) => (
  <AiForm view={view} saved={saved} />
);

export const AI_SECTION: SectionSpec<AiView> = {
  id: "ai",
  title: AI_TEXT.title,
  intro: AI_TEXT.intro,
  loadFailed: AI_TEXT.loadFailed,
  form: aiForm,
};
