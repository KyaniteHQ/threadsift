import { useCallback, type ReactNode, type SubmitEvent } from "react";

import { type Digest, type Provider, isCliProvider } from "../../src/core/ai-contract.ts";
import type { AiView } from "./ai-api.ts";
import { AI_TEXT, CLI_TEXT } from "./ai-text.ts";
import { AiFields } from "./AiFields.tsx";
import { Alert } from "./Alert.tsx";
import { ConnectButton, ConnectNotes, ConnectNotice } from "./ConnectControls.tsx";
import { type Loaded, LoadedSection } from "./LoadedSection.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { type SavedKey, isSignedOut, useAiForm } from "./use-ai-form.ts";

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

function AiActions({
  saveBlocked,
  verifyBlocked,
  phase,
  onVerify,
  children,
}: Readonly<{
  saveBlocked: boolean;
  verifyBlocked: boolean;
  phase: Form["phase"];
  onVerify: () => void;
  children: ReactNode;
}>) {
  const busy = phase !== "idle";

  return (
    <div className="ai-actions">
      <SwapButton
        label={AI_TEXT.save}
        busyLabel={AI_TEXT.saving}
        busy={phase === "saving"}
        blocked={busy || saveBlocked}
      />
      <SwapButton
        label={AI_TEXT.verify}
        busyLabel={AI_TEXT.verifying}
        busy={phase === "verifying"}
        blocked={busy || verifyBlocked}
        type="button"
        onClick={onVerify}
        secondary
      />
      {children}
    </div>
  );
}

const KEY_STATUS = {
  applies: AI_TEXT.keySet,
  changed: AI_TEXT.keyChanged,
  unreadable: AI_TEXT.keyUnreadable,
  none: AI_TEXT.keyMissing,
} as const;

function keyStatus(provider: Provider, savedKey: SavedKey): string {
  if (provider === "workers-ai") return AI_TEXT.keyNotNeeded;

  if (isCliProvider(provider)) return CLI_TEXT[provider].keyNotNeeded;

  return KEY_STATUS[savedKey];
}

function AiOutcome({ outcome }: Readonly<{ outcome: Form["outcome"] }>) {
  return (
    <>
      <output>{outcome?.kind === "ok" ? outcome.text : null}</output>
      <Alert text={outcome?.kind === "error" ? outcome.text : null} />
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
  const { fields, phase, saveBlocked, connection, submit } = form;

  const onSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      submit();
    },
    [submit],
  );

  return (
    <>
      <form
        method="post"
        action="/api/settings/ai"
        className="stack ai-form"
        onSubmit={onSubmit}
        aria-busy={phase !== "idle"}
      >
        <AiControls view={view} form={form} />
        <AiActions
          saveBlocked={saveBlocked}
          verifyBlocked={form.verifyBlocked}
          phase={phase}
          onVerify={form.verifyNow}
        >
          {fields.provider === "openrouter" ? (
            <ConnectButton view={view} connection={connection} blocked={phase !== "idle"} />
          ) : null}
        </AiActions>
      </form>
      <ConnectNotice view={view} notice={form.notice} />
      <AiOutcome outcome={form.outcome} />
    </>
  );
}

const aiForm = (view: AiView, saved: (view: AiView) => void) => (
  <AiForm view={view} saved={saved} />
);

export function AiSection({ initial }: Readonly<{ initial: Loaded<AiView> }>) {
  return (
    <LoadedSection
      id="ai"
      title={AI_TEXT.title}
      intro={AI_TEXT.intro}
      loadFailed={AI_TEXT.loadFailed}
      initial={initial}
      form={aiForm}
    />
  );
}
